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
    it('does not throw while rendering without a browser, and keeps fenced code as text', () => {
        const out = renderToString(<EventDescription content={'Intro **bold**\n\n```js\nconst a = "<b>"\n```'} />)
        expect(out).toContain('event-md')
        expect(out).toContain('>const<')
        expect(out).not.toContain('<script')
    })
})
