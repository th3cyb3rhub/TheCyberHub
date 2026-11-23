import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const api = vi.hoisted(() => ({ subscribePush: vi.fn(), unsubscribePush: vi.fn() }))
vi.mock('@/lib/api/push', () => api)

import { currentPermission, isPushSupported, readPromptDismissed, subscribeThisDevice, unsubscribeThisDevice, urlBase64ToBytes, writePromptDismissed } from '../push'

const KEY = 'AQIDBA' // bytes 1,2,3,4 as URL-safe base64 without padding

function makeSubscription(key: number[] | null, endpoint = 'https://push.example/1') {
    return {
        endpoint,
        options: { applicationServerKey: key ? new Uint8Array(key).buffer : null },
        toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
        unsubscribe: vi.fn().mockResolvedValue(true),
    }
}

function installBrowser(existing: ReturnType<typeof makeSubscription> | null) {
    const created = makeSubscription([1, 2, 3, 4], 'https://push.example/new')
    const pushManager = {
        getSubscription: vi.fn().mockResolvedValue(existing),
        subscribe: vi.fn().mockResolvedValue(created),
    }
    const registration = { pushManager }
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
            register: vi.fn().mockResolvedValue(registration),
            ready: Promise.resolve(registration),
            getRegistration: vi.fn().mockResolvedValue(registration),
        },
    })
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', { permission: 'default' })
    return { pushManager, created }
}

beforeEach(() => {
    vi.clearAllMocks()
    api.subscribePush.mockResolvedValue({ id: 's1', endpoint: 'x', createdAt: 'now' })
    api.unsubscribePush.mockResolvedValue(true)
})

afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('support and permission', () => {
    it('is unsupported without a service worker, push manager or Notification', () => {
        expect(isPushSupported()).toBe(false)
        installBrowser(null)
        expect(isPushSupported()).toBe(true)
        vi.stubGlobal('PushManager', undefined)
        Reflect.deleteProperty(window, 'PushManager')
        expect(isPushSupported()).toBe(false)
    })

    it('reads the current permission', () => {
        installBrowser(null)
        expect(currentPermission()).toBe('default')
        vi.stubGlobal('Notification', { permission: 'denied' })
        expect(currentPermission()).toBe('denied')
    })
})

describe('urlBase64ToBytes', () => {
    it('decodes URL-safe base64 without padding', () => {
        expect(Array.from(urlBase64ToBytes(KEY))).toEqual([1, 2, 3, 4])
        expect(Array.from(urlBase64ToBytes('_-8'))).toEqual([255, 239])
    })
})

describe('subscribeThisDevice', () => {
    it('registers the worker, subscribes and tells the server', async () => {
        const { pushManager } = installBrowser(null)
        await subscribeThisDevice(KEY)
        expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
        expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
        expect(api.subscribePush).toHaveBeenCalledWith({ endpoint: 'https://push.example/new', keys: { p256dh: 'p', auth: 'a' } })
    })

    it('reuses the subscription the browser already has for the same key', async () => {
        const existing = makeSubscription([1, 2, 3, 4])
        const { pushManager } = installBrowser(existing)
        await subscribeThisDevice(KEY)
        expect(pushManager.subscribe).not.toHaveBeenCalled()
        expect(api.subscribePush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/1' }))
    })

    it('replaces a subscription made for another key', async () => {
        const existing = makeSubscription([9, 9])
        const { pushManager } = installBrowser(existing)
        await subscribeThisDevice(KEY)
        expect(existing.unsubscribe).toHaveBeenCalled()
        expect(pushManager.subscribe).toHaveBeenCalled()
    })

    it('does not keep a new browser subscription the server refused', async () => {
        const { created } = installBrowser(null)
        const refusal = Object.assign(new Error('limit'), { code: 'PUSH_LIMIT_REACHED' })
        api.subscribePush.mockRejectedValue(refusal)
        await expect(subscribeThisDevice(KEY)).rejects.toBe(refusal)
        expect(created.unsubscribe).toHaveBeenCalled()
    })
})

describe('unsubscribeThisDevice', () => {
    it('removes the subscription from the server and the browser', async () => {
        const existing = makeSubscription([1, 2, 3, 4])
        installBrowser(existing)
        await unsubscribeThisDevice()
        expect(api.unsubscribePush).toHaveBeenCalledWith('https://push.example/1', undefined)
        expect(existing.unsubscribe).toHaveBeenCalled()
    })

    it('passes the sign-out token on to the request', async () => {
        installBrowser(makeSubscription([1, 2, 3, 4]))
        await unsubscribeThisDevice('tok')
        expect(api.unsubscribePush).toHaveBeenCalledWith('https://push.example/1', 'tok')
    })

    it('still removes it from the browser when the server call fails', async () => {
        const existing = makeSubscription([1, 2, 3, 4])
        installBrowser(existing)
        api.unsubscribePush.mockRejectedValue(new Error('offline'))
        await unsubscribeThisDevice()
        expect(existing.unsubscribe).toHaveBeenCalled()
    })

    it('does nothing when there is no subscription', async () => {
        installBrowser(null)
        await unsubscribeThisDevice()
        expect(api.unsubscribePush).not.toHaveBeenCalled()
    })
})

describe('prompt dismissal', () => {
    it('is remembered in localStorage', () => {
        expect(readPromptDismissed()).toBe(false)
        writePromptDismissed()
        expect(readPromptDismissed()).toBe(true)
        window.localStorage.clear()
    })

    it('survives storage that throws', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        expect(readPromptDismissed()).toBe(false)
        expect(() => writePromptDismissed()).not.toThrow()
        spy.mockRestore()
        set.mockRestore()
    })
})
