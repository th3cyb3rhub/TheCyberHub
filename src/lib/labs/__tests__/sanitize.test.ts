// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderMarkdownSegments } from '@/lib/markdown'
import { httpUrl, sanitizeLabHtml } from '../sanitize'

const md = (source: string) => renderMarkdownSegments(source).map((s) => (s.type === 'html' ? sanitizeLabHtml(s.html) : '')).join('')

describe('sanitizeLabHtml (no window)', () => {
    it('runs where there is no document', () => {
        expect(typeof window).toBe('undefined')
        expect(md('## Goal\n\nFind the **flag**.')).toContain('<h2')
    })

    it('keeps the markup the renderer writes: headings, lists, emphasis, code', () => {
        const html = md('## Goal\n\n- one\n- two\n\nSome **bold**, _em_ and `code`')
        for (const tag of ['<h2', '<ul', '<li', '<strong', '<em', '<code']) expect(html).toContain(tag)
    })

    it('never lets a tag from the author through: it is shown as text', () => {
        const html = md('Try <script>alert(1)</script> and <img src=x onerror="alert(1)"> and <iframe src="https://evil.example"></iframe>')
        expect(html).not.toMatch(/<script|<iframe|<img/i)
        expect(html).toContain('&lt;script&gt;')
        // Shown as text it may still read `onerror=`, but no tag carries a handler
        expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i)
    })

    it('drops every tag and attribute outside the allowlist', () => {
        const html = sanitizeLabHtml('<p onclick="x()" style="color:red" class="a b">hi</p><script>x()</script><svg onload="x()"></svg><a href="https://a.example" onmouseover="x()" class="y">l</a><form action="/x"><input></form>')
        expect(html).toBe('<p class="a b">hi</p>x()<a href="https://a.example" class="y" target="_blank" rel="noopener noreferrer nofollow ugc">l</a>')
    })

    it('refuses a class value that carries anything but class-name characters', () => {
        expect(sanitizeLabHtml('<p class="x&quot; onmouseover=&quot;y">t</p>')).toBe('<p>t</p>')
    })

    it('keeps http and https links with a safe rel and target, and nothing else', () => {
        const html = md('[ok](https://docs.example.org/a?b=1&c=2) [mail](mailto:a@b.example) [js](javascript:alert(1)) [data](data:text/html,x) [v](vbscript:x) [tab](java\tscript:alert(1))')
        expect(html).toContain('href="https://docs.example.org/a?b=1&amp;c=2"')
        expect(html).toContain('rel="noopener noreferrer nofollow ugc"')
        expect(html).not.toMatch(/mailto:|javascript:|data:text|vbscript/i)
        expect((html.match(/<a /g) ?? []).length).toBe(1)
        expect((html.match(/<\/a>/g) ?? []).length).toBe(1)
    })

    it('does not load a remote image: it becomes a plain link with its description', () => {
        const html = md('![diagram of the login](https://img.example.org/x.png)')
        expect(html).not.toContain('<img')
        expect(html).toContain('<a href="https://img.example.org/x.png"')
        expect(html).toContain('>diagram of the login</a>')
        expect(md('![x](http://img.example.org/x.png)')).not.toContain('<img')
    })

    it('closes a link left open so nothing after it ends up inside', () => {
        expect(sanitizeLabHtml('<a href="https://a.example">open')).toBe('<a href="https://a.example" target="_blank" rel="noopener noreferrer nofollow ugc">open</a>')
    })

    it('escapes a stray angle bracket', () => {
        expect(sanitizeLabHtml('<p>a < b and c > d <b</p>')).toBe('<p>a &lt; b and c &gt; d &lt;b</p>')
    })

    it('shows a payload in prose as text, however it is spelled', () => {
        const payloads = ['<SCRIPT SRC=//evil.example/x.js></SCRIPT>', '<img src="x" onerror=alert(1)//', '<svg/onload=alert(1)>', '<a href="java&#115;cript:alert(1)">x</a>', '"><script>alert(1)</script>', '<math><mtext></form><form><mglyph><svg><mtext><style><path id="</style><img onerror=alert(1) src>">']
        for (const payload of payloads) {
            const html = md(payload)
            expect(html).not.toMatch(/<(script|svg|math|style|form|iframe|img)\b/i)
            expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i)
            expect(html).not.toMatch(/href="\s*java/i)
        }
    })
})

describe('httpUrl', () => {
    it('accepts http and https and rejects the rest', () => {
        expect(httpUrl('https://a.example/x')).toBe('https://a.example/x')
        expect(httpUrl('http://a.example')).toBe('http://a.example')
        for (const bad of ['javascript:alert(1)', 'mailto:a@b.example', 'data:text/html,x', '//a.example', 'https://u:p@a.example', 'https://a.example/ x', 'java\tscript:x', '', undefined]) {
            expect(httpUrl(bad as string | undefined)).toBeNull()
        }
    })
})

describe('sanitizeLabHtml options (what an event description may keep)', () => {
    const img = '<img src="https://img.example/a.png" alt="A &quot;logo&quot;" loading="lazy" referrerpolicy="no-referrer" class="max-w-full rounded-lg my-4" />'

    it('turns a remote image into a link by default', () => {
        expect(sanitizeLabHtml(img)).toContain('<a href="https://img.example/a.png"')
        expect(sanitizeLabHtml(img)).not.toContain('<img')
    })

    it('keeps an https image as a rebuilt image when asked, with only the checked attributes', () => {
        const out = sanitizeLabHtml(img.replace('class=', 'onerror="x()" class='), { images: true })
        expect(out).toBe('<img src="https://img.example/a.png" alt="A &quot;logo&quot;" loading="lazy" referrerpolicy="no-referrer" class="max-w-full rounded-lg my-4" />')
    })

    it('never keeps an image that is not https, or that has no address, even when asked', () => {
        expect(sanitizeLabHtml('<img src="http://img.example/a.png" alt="x" />', { images: true })).not.toContain('<img')
        expect(sanitizeLabHtml('<img src="javascript:alert(1)" alt="x" />', { images: true })).toBe('x')
        expect(sanitizeLabHtml('<img src="data:image/svg+xml,<svg/>" alt="x" />', { images: true })).not.toContain('<img')
    })

    it('keeps a mailto link only when asked, and never one that carries markup or spaces', () => {
        expect(sanitizeLabHtml('<a href="mailto:ctf@example.org">mail</a>')).toBe('mail')
        expect(sanitizeLabHtml('<a href="mailto:ctf@example.org">mail</a>', { mailto: true })).toContain('href="mailto:ctf@example.org"')
        expect(sanitizeLabHtml('<a href="mailto:a b@example.org">mail</a>', { mailto: true })).toBe('mail')
        expect(sanitizeLabHtml('<a href="javascript:alert(1)">x</a>', { mailto: true })).toBe('x')
    })
})
