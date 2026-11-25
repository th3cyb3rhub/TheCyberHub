import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProgress, isTrackedNavigation, type ProgressPhase } from '../navigationProgress'

describe('createProgress', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const setup = (options = {}) => {
        const seen: ProgressPhase[] = []
        const progress = createProgress({ delayMs: 100, maxMs: 5000, finishMs: 200, onChange: (p) => seen.push(p), ...options })
        return { progress, seen }
    }

    it('shows the bar only after the delay, and completes it when the navigation finishes', () => {
        const { progress, seen } = setup()
        progress.start()
        vi.advanceTimersByTime(99)
        expect(seen).toEqual([])
        vi.advanceTimersByTime(1)
        expect(seen).toEqual(['running'])
        progress.finish()
        expect(seen).toEqual(['running', 'finishing'])
        vi.advanceTimersByTime(200)
        expect(seen).toEqual(['running', 'finishing', 'idle'])
    })

    it('never shows the bar for a navigation that ends within the delay', () => {
        const { progress, seen } = setup()
        progress.start()
        vi.advanceTimersByTime(50)
        progress.finish()
        vi.advanceTimersByTime(10_000)
        expect(seen).toEqual([])
    })

    it('lets go of a navigation that never finishes (cancelled, or a click that went nowhere)', () => {
        const { progress, seen } = setup()
        progress.start()
        vi.advanceTimersByTime(100)
        expect(seen).toEqual(['running'])
        vi.advanceTimersByTime(5000)
        expect(seen).toEqual(['running', 'finishing'])
        vi.advanceTimersByTime(200)
        expect(seen.at(-1)).toBe('idle')
        // and nothing is left running afterwards
        expect(vi.getTimerCount()).toBe(0)
    })

    it('ignores a second start while the bar is running or waiting', () => {
        const { progress, seen } = setup()
        progress.start()
        progress.start()
        vi.advanceTimersByTime(100)
        progress.start()
        expect(seen).toEqual(['running'])
        expect(vi.getTimerCount()).toBe(1) // only the give up timer
    })

    it('can start again right after it finished', () => {
        const { progress, seen } = setup()
        progress.start()
        vi.advanceTimersByTime(100)
        progress.finish()
        progress.start()
        vi.advanceTimersByTime(100)
        expect(seen).toEqual(['running', 'finishing', 'running'])
    })

    it('a finish with nothing running does nothing', () => {
        const { progress, seen } = setup()
        progress.finish()
        expect(seen).toEqual([])
    })

    it('destroy drops every timer and says nothing more', () => {
        const { progress, seen } = setup()
        progress.start()
        vi.advanceTimersByTime(100)
        progress.destroy()
        expect(vi.getTimerCount()).toBe(0)
        progress.start()
        vi.advanceTimersByTime(10_000)
        expect(seen).toEqual(['running'])
    })
})

describe('isTrackedNavigation', () => {
    const here = { href: 'https://app.example/labs?tab=labs', origin: 'https://app.example', pathname: '/labs', search: '?tab=labs' }
    const click = (html: string, init: Partial<Parameters<typeof isTrackedNavigation>[0]> = {}) => {
        document.body.innerHTML = html
        return isTrackedNavigation({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, target: document.querySelector('[data-t]'), ...init }, here)
    }

    it('follows a link to another page of the app, also from an element inside the link', () => {
        expect(click('<a href="/jobs"><span data-t>Jobs</span></a>')).toBe(true)
        expect(click('<a data-t href="https://app.example/jobs/x">x</a>')).toBe(true)
    })

    it('follows a link to the same page with other filters', () => {
        expect(click('<a data-t href="/labs?tab=leaderboard">x</a>')).toBe(true)
    })

    it.each([
        ['the same address', '<a data-t href="/labs?tab=labs">x</a>'],
        ['another place on the same page', '<a data-t href="#top">x</a>'],
        ['another hash of the same address', '<a data-t href="/labs?tab=labs#a">x</a>'],
        ['another site', '<a data-t href="https://other.example/jobs">x</a>'],
        ['a mail link', '<a data-t href="mailto:a@b.example">x</a>'],
        ['a new tab', '<a data-t href="/jobs" target="_blank">x</a>'],
        ['a download', '<a data-t href="/file.pdf" download>x</a>'],
        ['a link that opted out', '<a data-t data-no-progress href="/jobs">x</a>'],
        ['no link', '<button data-t>x</button>'],
    ])('does not follow %s', (_name, html) => {
        expect(click(html)).toBe(false)
    })

    it.each([{ button: 1 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }])('does not follow a click with %j (a new tab or window)', (init) => {
        expect(click('<a data-t href="/jobs">x</a>', init)).toBe(false)
    })
})
