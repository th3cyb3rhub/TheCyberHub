import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runInNewContext } from 'vm'

type Listener = (event: Record<string, unknown>) => void

/** Runs public/sw.js against a fake worker scope and returns what it registered */
function loadWorker() {
    const listeners: Record<string, Listener> = {}
    const showNotification = vi.fn().mockResolvedValue(undefined)
    const openWindow = vi.fn().mockResolvedValue(undefined)
    const matchAll = vi.fn().mockResolvedValue([])
    const scope = {
        location: { origin: 'https://thecyberhub.test' },
        registration: { showNotification },
        clients: { matchAll, openWindow, claim: vi.fn() },
        skipWaiting: vi.fn(),
        addEventListener: (name: string, fn: Listener) => { listeners[name] = fn },
    }
    runInNewContext(readFileSync(resolve(__dirname, '../../../../public/sw.js'), 'utf8'), { self: scope, URL, Promise })
    return { listeners, showNotification, openWindow, matchAll }
}

const pushEvent = (payload: unknown, raw?: string) => {
    const waits: Promise<unknown>[] = []
    return {
        event: {
            data: raw !== undefined ? { json: () => { throw new Error('bad json') } } : { json: () => payload },
            waitUntil: (p: Promise<unknown>) => { waits.push(p) },
        },
        done: () => Promise.all(waits),
    }
}

const clickEvent = (path: unknown) => {
    const waits: Promise<unknown>[] = []
    const close = vi.fn()
    return {
        event: { notification: { close, data: { path } }, waitUntil: (p: Promise<unknown>) => { waits.push(p) } },
        close,
        done: () => Promise.all(waits),
    }
}

let sw: ReturnType<typeof loadWorker>
beforeEach(() => { sw = loadWorker() })

describe('service worker push', () => {
    it('shows the notification with its tag and body', async () => {
        const { event, done } = pushEvent({ title: 'New reply', body: 'Ada replied', link: '/feed/post/1', tag: 'reply:1' })
        sw.listeners.push(event)
        await done()
        expect(sw.showNotification).toHaveBeenCalledWith('New reply', expect.objectContaining({
            body: 'Ada replied', tag: 'reply:1', renotify: true, data: { path: '/feed/post/1' },
        }))
    })

    it('falls back to a plain notification for a payload it cannot read', async () => {
        const { event, done } = pushEvent(null, 'broken')
        sw.listeners.push(event)
        await done()
        expect(sw.showNotification).toHaveBeenCalledWith('TheCyberHub', expect.objectContaining({ body: '', data: { path: '/notifications' } }))
    })

    it.each(['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 42])('never keeps an off-site link: %s', async (link) => {
        const { event, done } = pushEvent({ title: 't', body: 'b', link })
        sw.listeners.push(event)
        await done()
        expect(sw.showNotification).toHaveBeenCalledWith('t', expect.objectContaining({ data: { path: '/notifications' } }))
    })
})

describe('service worker click', () => {
    it('focuses an open tab of the site and sends it to the link', async () => {
        const client = { url: 'https://thecyberhub.test/feed', navigate: vi.fn().mockResolvedValue(undefined), focus: vi.fn().mockResolvedValue('focused') }
        sw.matchAll.mockResolvedValue([{ url: 'https://other.example/', focus: vi.fn() }, client])
        const { event, close, done } = clickEvent('/feed/post/1')
        sw.listeners.notificationclick(event)
        await done()
        expect(close).toHaveBeenCalled()
        expect(client.navigate).toHaveBeenCalledWith('https://thecyberhub.test/feed/post/1')
        expect(client.focus).toHaveBeenCalled()
        expect(sw.openWindow).not.toHaveBeenCalled()
    })

    it('opens a window when the site is not open', async () => {
        const { event, done } = clickEvent('/notifications')
        sw.listeners.notificationclick(event)
        await done()
        expect(sw.openWindow).toHaveBeenCalledWith('https://thecyberhub.test/notifications')
    })

    it('ignores a link that is not an in-app path', async () => {
        const { event, done } = clickEvent('https://evil.example/phish')
        sw.listeners.notificationclick(event)
        await done()
        expect(sw.openWindow).toHaveBeenCalledWith('https://thecyberhub.test/notifications')
    })
})
