import { render, screen, act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from '../ThemeContext'

function Probe() {
    const { theme, toggleTheme, setTheme } = useTheme()
    return (
        <div>
            <h1>Heading</h1>
            <span data-testid="theme">{theme}</span>
            <button onClick={toggleTheme}>toggle</button>
            <button onClick={() => setTheme('light')}>light</button>
        </div>
    )
}

const html = document.documentElement
const mockSystem = (dark: boolean) =>
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: query.includes('dark') ? dark : !dark, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })))

beforeEach(() => {
    window.localStorage.clear()
    html.className = ''
    html.removeAttribute('data-theme')
    mockSystem(true)
})
afterEach(() => vi.unstubAllGlobals())

describe('ThemeProvider on the server', () => {
    it('renders its children (no mounted gate) with the default dark theme', () => {
        const out = renderToString(<ThemeProvider><Probe /></ThemeProvider>)
        expect(out).toContain('<h1>Heading</h1>')
        expect(out).toContain('>dark</span>')
    })
})

describe('ThemeProvider in the browser', () => {
    it('renders the children on the first render and uses the dark default without a stored choice and a dark system', () => {
        render(<ThemeProvider><Probe /></ThemeProvider>)
        expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument()
        expect(screen.getByTestId('theme')).toHaveTextContent('dark')
        expect(html).toHaveClass('dark')
        expect(html).not.toHaveClass('light')
        expect(html).not.toHaveAttribute('data-theme')
    })

    it('reconciles to the stored choice after mount', () => {
        window.localStorage.setItem('tch-theme', 'light')
        render(<ThemeProvider><Probe /></ThemeProvider>)
        expect(screen.getByTestId('theme')).toHaveTextContent('light')
        expect(html).toHaveClass('light')
        expect(html).not.toHaveClass('dark')
        expect(html).toHaveAttribute('data-theme', 'light')
    })

    it('follows a light system preference when nothing is stored', () => {
        mockSystem(false)
        render(<ThemeProvider><Probe /></ThemeProvider>)
        expect(screen.getByTestId('theme')).toHaveTextContent('light')
        expect(window.localStorage.getItem('tch-theme')).toBeNull()
    })

    it('ignores a stored value that is not a theme', () => {
        window.localStorage.setItem('tch-theme', 'purple')
        render(<ThemeProvider><Probe /></ThemeProvider>)
        expect(screen.getByTestId('theme')).toHaveTextContent('dark')
        expect(html).not.toHaveClass('purple')
    })

    it('keeps what the inline script already set on <html> when nothing else says otherwise', () => {
        html.classList.add('light')
        html.setAttribute('data-theme', 'light')
        mockSystem(false)
        render(<ThemeProvider><Probe /></ThemeProvider>)
        expect(screen.getByTestId('theme')).toHaveTextContent('light')
    })

    it('toggles, stores the choice and updates <html>', () => {
        render(<ThemeProvider><Probe /></ThemeProvider>)
        act(() => { screen.getByText('toggle').click() })
        expect(screen.getByTestId('theme')).toHaveTextContent('light')
        expect(window.localStorage.getItem('tch-theme')).toBe('light')
        expect(html).toHaveClass('light')
        expect(html).toHaveAttribute('data-theme', 'light')
        act(() => { screen.getByText('toggle').click() })
        expect(screen.getByTestId('theme')).toHaveTextContent('dark')
        expect(window.localStorage.getItem('tch-theme')).toBe('dark')
        expect(html).toHaveClass('dark')
        expect(html).not.toHaveAttribute('data-theme')
    })

    it('still switches when storage throws, and falls back to the system preference on read', () => {
        const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        try {
            mockSystem(false)
            render(<ThemeProvider><Probe /></ThemeProvider>)
            expect(screen.getByTestId('theme')).toHaveTextContent('light')
            act(() => { screen.getByText('toggle').click() })
            expect(screen.getByTestId('theme')).toHaveTextContent('dark')
            expect(html).toHaveClass('dark')
        } finally {
            get.mockRestore()
            set.mockRestore()
        }
    })

    it('follows a change made in another tab, and ignores other keys and invalid values', () => {
        render(<ThemeProvider><Probe /></ThemeProvider>)
        act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tch-theme', newValue: 'light' })) })
        expect(screen.getByTestId('theme')).toHaveTextContent('light')
        expect(html).toHaveClass('light')
        act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'dark' })) })
        act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tch-theme', newValue: 'nonsense' })) })
        act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tch-theme', newValue: null })) })
        expect(screen.getByTestId('theme')).toHaveTextContent('light')
    })

    it('stops listening when it unmounts', () => {
        const { unmount } = render(<ThemeProvider><Probe /></ThemeProvider>)
        unmount()
        act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tch-theme', newValue: 'light' })) })
        expect(html).not.toHaveClass('light')
    })

    it('throws a clear error for a consumer outside the provider', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(() => render(<Probe />)).toThrow('useTheme must be used within ThemeProvider')
        spy.mockRestore()
    })
})
