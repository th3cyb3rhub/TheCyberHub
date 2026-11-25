import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { sanitizeHtml } from '../sanitizeHtml'
import { useSanitizer } from '@/hooks/useSanitizer'
import { EventDescription } from '@/components/events/EventDescription'

describe('sanitizeHtml', () => {
    it('removes scripts and event handlers in a browser', () => {
        const out = sanitizeHtml('<p onclick="x()">hi</p><script>alert(1)</script><img src=x onerror=alert(1)>')
        expect(out).toContain('<p>hi</p>')
        expect(out).not.toMatch(/script|onclick|onerror/i)
    })

    it('answers an empty string for nothing', () => {
        expect(sanitizeHtml('')).toBe('')
    })

    it('answers an empty string, never the raw markup, where there is no window to clean with', async () => {
        vi.resetModules()
        vi.doMock('dompurify', () => ({ default: { isSupported: false } }))
        const { sanitizeHtml: onServer } = await import('../sanitizeHtml')
        expect(onServer('<img src=x onerror=alert(1)>')).toBe('')
        vi.doUnmock('dompurify')
        vi.resetModules()
    })
})

function Probe({ html }: { html: string }) {
    const clean = useSanitizer()
    return <div id="out" dangerouslySetInnerHTML={{ __html: clean(html) }} />
}

describe('useSanitizer', () => {
    it('renders nothing on the server, and the cleaned HTML once the page has hydrated, without a mismatch', async () => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
        const serverHtml = renderToString(<Probe html={'<b>bold</b><script>alert(1)</script>'} />)
        expect(serverHtml).toBe('<div id="out"></div>')

        const container = document.createElement('div')
        container.innerHTML = serverHtml
        document.body.appendChild(container)
        await act(async () => { hydrateRoot(container, <Probe html={'<b>bold</b><script>alert(1)</script>'} />) })
        expect(container.querySelector('#out')?.innerHTML).toBe('<b>bold</b>')
        expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([])
        errors.mockRestore()
        container.remove()
    })
})

describe('EventDescription on the server', () => {
    const text = 'Intro **bold** with [a link](https://example.org) and <script>alert(1)</script>\n\n```js\nconst a = "<b>"\n```'

    it('does not throw while rendering without a browser, and keeps fenced code as text', () => {
        const out = renderToString(<EventDescription content={text} />)
        expect(out).toContain('event-md')
        expect(out).toContain('>const<')
        expect(out).not.toContain('<script')
    })

    it('has the description in the server HTML, escaped, so crawlers read it and the layout does not move', () => {
        const out = renderToString(<EventDescription content={text} />)
        expect(out).toMatch(/<strong[^>]*>bold<\/strong>/)
        expect(out).toContain('href="https://example.org"')
        expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('hydrates onto the server copy without a mismatch and keeps a mail link and an https picture', async () => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
        const source = 'Write to [us](mailto:ctf@example.org)\n\n![logo](https://img.example/a.png)'
        const serverHtml = renderToString(<EventDescription content={source} />)
        expect(serverHtml).toContain('<img src="https://img.example/a.png"')
        const container = document.createElement('div')
        container.innerHTML = serverHtml
        document.body.appendChild(container)
        await act(async () => { hydrateRoot(container, <EventDescription content={source} />) })
        expect(container.querySelector('a[href="mailto:ctf@example.org"]')).not.toBeNull()
        expect(container.querySelector('img')?.getAttribute('src')).toBe('https://img.example/a.png')
        expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([])
        errors.mockRestore()
        container.remove()
    })
})
