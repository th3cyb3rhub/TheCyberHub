import { describe, expect, it } from 'vitest'
import { fillCallback, needsCallback, parseCallbackUrl, SSRF_CATEGORIES, SSRF_PAYLOADS } from '../ssrfPayloads'

describe('SSRF payload list', () => {
    it('has no fake detection and every payload in a known category', () => {
        const known = new Set<string>(SSRF_CATEGORIES.map((c) => c.id))
        for (const p of SSRF_PAYLOADS) expect(known.has(p.category)).toBe(true)
        expect(JSON.stringify(SSRF_PAYLOADS).toLowerCase()).not.toContain('webhook.site')
    })

    it('only the out-of-band payloads need a callback', () => {
        const needing = SSRF_PAYLOADS.filter((p) => needsCallback(p.payload))
        expect(needing.length).toBeGreaterThan(0)
        expect(needing.every((p) => p.category === 'oob')).toBe(true)
    })
})

describe('callback URL', () => {
    it('fills both placeholders from the URL the tester brings', () => {
        expect(fillCallback('{CALLBACK_URL}/x', 'https://abc.oast.example')).toBe('https://abc.oast.example/x')
        expect(fillCallback('http://ssrf-test.{CALLBACK_HOST}/', 'https://abc.oast.example:8443/path')).toBe('http://ssrf-test.abc.oast.example/')
        expect(fillCallback('http://169.254.169.254/', null)).toBe('http://169.254.169.254/')
        expect(fillCallback('{CALLBACK_URL}', null)).toBe('{CALLBACK_URL}')
    })

    it('accepts http(s) addresses and adds a scheme to a bare host', () => {
        expect(parseCallbackUrl('abc.oast.example')).toEqual({ ok: true, value: 'http://abc.oast.example' })
        expect(parseCallbackUrl(' https://x.example/path/ ')).toEqual({ ok: true, value: 'https://x.example/path' })
    })

    it('refuses empty input, other schemes and credentials', () => {
        expect(parseCallbackUrl('')).toMatchObject({ ok: false })
        expect(parseCallbackUrl('ftp://x.example')).toMatchObject({ ok: false })
        expect(parseCallbackUrl('https://user:pw@x.example')).toMatchObject({ ok: false })
        expect(parseCallbackUrl('http://')).toMatchObject({ ok: false })
    })
})
