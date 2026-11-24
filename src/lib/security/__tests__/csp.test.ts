import { describe, it, expect } from 'vitest'
import { apiConnectSources, connectSrc, contentSecurityPolicy, STATIC_CONNECT_SOURCES } from '../csp'

const directive = (csp: string, name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? ''

describe('connect-src', () => {
    it('lists the API origin for fetch and for sockets', () => {
        expect(apiConnectSources('https://api.example.com')).toEqual(['https://api.example.com', 'wss://api.example.com'])
        expect(apiConnectSources('http://localhost:5001')).toEqual(['http://localhost:5001', 'ws://localhost:5001'])
    })

    it('adds nothing for a missing, odd or non-http API url', () => {
        expect(apiConnectSources(undefined)).toEqual([])
        expect(apiConnectSources('not a url')).toEqual([])
        expect(apiConnectSources('javascript:alert(1)')).toEqual([])
        expect(apiConnectSources('ftp://example.com')).toEqual([])
    })

    it('does not list any third-party lookup service', () => {
        const value = connectSrc('https://api.example.com')
        expect(value).not.toMatch(/crt\.sh/)
        expect(value).not.toMatch(/execute-api|lambda|gateway/i)
        // The one wildcard is for presigned S3 uploads
        expect(value.split(' ').filter((s) => s.includes('*'))).toEqual(['https://*.amazonaws.com'])
    })

    it('has exactly the known static sources', () => {
        expect(STATIC_CONNECT_SOURCES).toEqual([
            "'self'",
            'https://*.amazonaws.com',
            'https://www.google-analytics.com',
            'https://www.googletagmanager.com',
            'https://va.vercel-scripts.com',
        ])
    })
})

describe('contentSecurityPolicy', () => {
    const csp = contentSecurityPolicy('https://api.example.com')

    it('keeps the protections that were already there', () => {
        expect(directive(csp, 'default-src')).toBe("default-src 'self'")
        expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
        expect(directive(csp, 'script-src')).not.toContain("'unsafe-eval'")
        expect(csp.endsWith(';')).toBe(true)
    })

    it('never opens connect-src to everything', () => {
        const connect = directive(csp, 'connect-src').split(' ')
        expect(connect).not.toContain('*')
        expect(connect).not.toContain('https:')
        expect(connect).not.toContain('http:')
        expect(connect).not.toContain('ws:')
        expect(connect).toContain('https://api.example.com')
        expect(connect).toContain('wss://api.example.com')
    })
})
