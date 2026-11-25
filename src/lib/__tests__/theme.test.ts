import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, currentTheme, resolveTheme, themeInitScript } from '../theme'

const html = document.documentElement
const mockSystem = (dark: boolean) =>
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: query.includes('dark') ? dark : !dark, media: query })))

beforeEach(() => {
    window.localStorage.clear()
    html.className = ''
    html.removeAttribute('data-theme')
    mockSystem(true)
})
afterEach(() => vi.unstubAllGlobals())

const runScript = () => new Function(themeInitScript)()

describe('the script that runs before the first paint', () => {
    it('applies a stored light theme with the same class and attribute as applyTheme', () => {
        window.localStorage.setItem('tch-theme', 'light')
        html.classList.add('dark')
        runScript()
        expect(html.className).toBe('light')
        expect(html.getAttribute('data-theme')).toBe('light')
        const expected = document.createElement('html')
        applyTheme('light', expected)
        expect(expected.className).toBe(html.className)
        expect(expected.getAttribute('data-theme')).toBe(html.getAttribute('data-theme'))
    })

    it('applies a stored dark theme over a light system', () => {
        mockSystem(false)
        window.localStorage.setItem('tch-theme', 'dark')
        html.classList.add('dark')
        runScript()
        expect(html.className).toBe('dark')
        expect(html.hasAttribute('data-theme')).toBe(false)
    })

    it('falls back to the system preference when nothing is stored', () => {
        mockSystem(false)
        html.classList.add('dark')
        runScript()
        expect(currentTheme()).toBe('light')
    })

    it('ignores a stored value that is not a theme', () => {
        window.localStorage.setItem('tch-theme', 'foo')
        html.classList.add('dark')
        runScript()
        expect(html.className).toBe('dark')
    })

    it('leaves the dark default when storage and matchMedia both fail', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        vi.stubGlobal('matchMedia', () => { throw new Error('nope') })
        html.classList.add('dark')
        runScript()
        expect(html.className).toBe('dark')
        vi.restoreAllMocks()
    })

    it('has no way to run anything but the theme: no network, no eval, no cookies', () => {
        expect(themeInitScript).not.toMatch(/fetch|XMLHttpRequest|eval|document\.cookie|innerHTML|import\(/)
    })
})

describe('resolveTheme', () => {
    it('prefers the stored choice, then the system', () => {
        expect(resolveTheme()).toBe('dark')
        mockSystem(false)
        expect(resolveTheme()).toBe('light')
        window.localStorage.setItem('tch-theme', 'dark')
        expect(resolveTheme()).toBe('dark')
    })
})
