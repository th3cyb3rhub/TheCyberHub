// @vitest-environment node
import { renderToString } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { LabMarkdown } from '../LabMarkdown'

describe('LabMarkdown while rendering on the server (no window)', () => {
    it('does not throw and puts the sanitised text in the HTML', () => {
        expect(typeof window).toBe('undefined')
        const html = renderToString(<LabMarkdown content={'## Goal\n\nFind the **flag** at [the docs](https://docs.example.org).'} />)
        expect(html).toContain('Goal')
        expect(html).toContain('<strong')
        expect(html).toContain('href="https://docs.example.org"')
    })

    it('shows a payload as text, with no script, handler or javascript: link', () => {
        const html = renderToString(<LabMarkdown content={'<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(2))\n\n```html\n<script>alert(3)</script>\n```'} />)
        expect(html).not.toMatch(/<script/i)
        expect(html).not.toMatch(/<img/i)
        expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i)
        expect(html).not.toMatch(/href="javascript/i)
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    })
})
