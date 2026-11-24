import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LabMarkdown } from '../LabMarkdown'

const html = (md: string) => render(<LabMarkdown content={md} />).container

describe('LabMarkdown', () => {
    it('shows a script tag as text, never as a script', () => {
        const c = html('Try <script>alert(1)</script> in the search box')
        expect(c.querySelector('script')).toBeNull()
        expect(c.textContent).toContain('<script>alert(1)</script>')
    })

    it('drops an event handler on an image and the image with it', () => {
        const c = html('<img src=x onerror="alert(1)">')
        expect(c.querySelector('img')).toBeNull()
        expect(c.querySelector('[onerror]')).toBeNull()
        // The text is shown, but no element carries an event handler attribute
        const handlers = Array.from(c.querySelectorAll('*')).flatMap((el) => Array.from(el.attributes).filter((a) => /^on/i.test(a.name)))
        expect(handlers).toHaveLength(0)
        expect(c.textContent).toContain('onerror')
    })

    it('refuses javascript:, data: and vbscript: links, however they are spelled', () => {
        const c = html('[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c](data:text/html,<script>alert(1)</script>) [d](java\tscript:alert(1)) [e](vbscript:x)')
        expect(c.querySelector('a[href^="javascript" i]')).toBeNull()
        expect(c.querySelector('a[href^="data" i]')).toBeNull()
        expect(c.querySelector('a[href^="vbscript" i]')).toBeNull()
        expect(c.innerHTML).not.toMatch(/href="\s*(javascript|data|vbscript)/i)
    })

    it('keeps http and https links and opens them safely in a new tab', () => {
        const c = html('[docs](https://docs.example.org/page)')
        const a = c.querySelector('a') as HTMLAnchorElement
        expect(a.getAttribute('href')).toBe('https://docs.example.org/page')
        expect(a.getAttribute('target')).toBe('_blank')
        expect(a.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc')
    })

    it('keeps a payload inside a code fence as text, so a lab can show it', () => {
        const c = html('```html\n<img src=x onerror=alert(1)>\n```')
        expect(c.querySelector('img')).toBeNull()
        expect(c.textContent).toContain('<img src=x onerror=alert(1)>')
    })

    it('does not turn iframes, forms, styles or svg into elements', () => {
        const c = html('<iframe src="https://evil.example"></iframe><form action="https://evil.example"><input></form><style>body{display:none}</style><svg onload=alert(1)></svg>')
        for (const tag of ['iframe', 'form', 'input', 'style', 'svg']) expect(c.querySelector(tag)).toBeNull()
    })

    it('renders plain markdown: headings, lists and emphasis', () => {
        const c = html('## Goal\n\n- one\n- two\n\nSome **bold** text')
        expect(c.querySelector('h2')?.textContent).toBe('Goal')
        expect(c.querySelectorAll('li')).toHaveLength(2)
        expect(c.querySelector('strong')?.textContent).toBe('bold')
    })
})
