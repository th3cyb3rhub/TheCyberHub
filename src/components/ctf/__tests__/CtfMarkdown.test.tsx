import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CtfMarkdown } from '../CtfMarkdown'

const PAYLOADS = [
    '<script>window.pwned = 1</script>',
    '<img src=x onerror="window.pwned = 2">',
    '[click](javascript:window.pwned=3)',
    '[click](JaVaScRiPt:window.pwned=3)',
    '[click](data:text/html;base64,PHNjcmlwdD4=)',
    '<a href="javascript:window.pwned=4" onclick="window.pwned=5">x</a>',
    '<svg onload="window.pwned=6"></svg>',
    '<iframe src="https://evil.example"></iframe>',
    '<style>body{display:none}</style>',
    '![x](javascript:window.pwned=7)',
]

describe('CtfMarkdown', () => {
    it.each(PAYLOADS)('keeps %s inert', (payload) => {
        const { container } = render(<CtfMarkdown content={`## Rules\n\n${payload}`} />)
        expect(container.querySelector('script, iframe, style, svg, object, embed')).toBeNull()
        expect(container.querySelector('[onerror], [onclick], [onload]')).toBeNull()
        expect(Array.from(container.querySelectorAll('a')).every((a) => /^https?:/i.test(a.getAttribute('href') ?? ''))).toBe(true)
        expect(container.querySelector('img[src^="javascript"], img[onerror]')).toBeNull()
        expect(Array.from(container.querySelectorAll('[href], [src]')).some((el) => /^\s*(javascript|data):/i.test(el.getAttribute('href') ?? el.getAttribute('src') ?? ''))).toBe(false)
        expect((window as unknown as { pwned?: number }).pwned).toBeUndefined()
        expect(container.querySelector('h2')).toHaveTextContent('Rules')
    })

    it('shows the markup of an attack as text', () => {
        const { container } = render(<CtfMarkdown content={'<img src=x onerror=alert(1)>'} />)
        expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
    })

    it('keeps fenced code as code, escaped', () => {
        const { container } = render(<CtfMarkdown content={'```html\n<script>alert(1)</script>\n```'} />)
        expect(container.querySelector('pre code')?.textContent).toContain('<script>alert(1)</script>')
        expect(container.querySelector('script')).toBeNull()
    })

    it('opens an http link safely and drops a bare javascript link', () => {
        const { container } = render(<CtfMarkdown content={'[site](https://example.com) and [bad](javascript:alert(1))'} />)
        const links = Array.from(container.querySelectorAll('a'))
        const good = links.find((a) => a.getAttribute('href') === 'https://example.com')
        expect(good).toBeTruthy()
        expect(good?.getAttribute('rel') ?? '').toMatch(/noopener/)
        expect(links.some((a) => /javascript/i.test(a.getAttribute('href') ?? ''))).toBe(false)
    })
})
