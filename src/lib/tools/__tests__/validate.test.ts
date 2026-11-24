import { describe, expect, it } from 'vitest'
import {
    checkCveId, checkDnsName, checkDomain, checkHost, checkHttpUrl, checkIp, checkOrigins, checkPort, checkSubdomainList, cleanHostInput, isDomainName, isIPv4, isIPv6,
} from '../validate'

describe('cleanHostInput', () => {
    it('reduces a pasted address to its host name', () => {
        expect(cleanHostInput('  HTTPS://User:pw@Example.COM:8443/path?x=1#y ')).toBe('example.com')
        expect(cleanHostInput('example.com.')).toBe('example.com')
        expect(cleanHostInput('[2001:db8::1]')).toBe('[2001:db8::1]')
    })
})

describe('address checks', () => {
    it('knows IPv4 and IPv6', () => {
        expect(isIPv4('8.8.8.8')).toBe(true)
        expect(isIPv4('256.1.1.1')).toBe(false)
        expect(isIPv4('01.2.3.4')).toBe(false)
        expect(isIPv6('2606:4700:4700::1111')).toBe(true)
        expect(isIPv6('::1')).toBe(true)
        expect(isIPv6('12345::')).toBe(false)
        expect(isIPv6('not an ip')).toBe(false)
    })

    it('validates domains, with and without underscores', () => {
        expect(isDomainName('example.com')).toBe(true)
        expect(isDomainName('münchen.de')).toBe(true)
        expect(isDomainName('localhost')).toBe(false)
        expect(isDomainName('1.2.3.4')).toBe(false)
        expect(isDomainName('-bad.example.com')).toBe(false)
        expect(isDomainName('_dmarc.example.com')).toBe(false)
        expect(isDomainName('_dmarc.example.com', { allowUnderscore: true })).toBe(true)
        expect(isDomainName(`${'a'.repeat(64)}.com`)).toBe(false)
    })

    it('checkDomain cleans and reports', () => {
        expect(checkDomain('https://Example.com/a')).toEqual({ ok: true, value: 'example.com' })
        expect(checkDomain('')).toMatchObject({ ok: false })
        expect(checkDomain('8.8.8.8')).toMatchObject({ ok: false })
        expect(checkDomain('nodot')).toMatchObject({ ok: false })
    })

    it('checkDnsName and checkHost accept IPs too', () => {
        expect(checkDnsName('_dmarc.example.com')).toEqual({ ok: true, value: '_dmarc.example.com' })
        expect(checkDnsName('8.8.8.8')).toEqual({ ok: true, value: '8.8.8.8' })
        expect(checkDnsName('[2001:db8::1]')).toEqual({ ok: true, value: '2001:db8::1' })
        expect(checkDnsName('%%%')).toMatchObject({ ok: false })
        expect(checkHost('example.com:443')).toEqual({ ok: true, value: 'example.com' })
        expect(checkHost('1.1.1.1')).toEqual({ ok: true, value: '1.1.1.1' })
        expect(checkHost('x y')).toMatchObject({ ok: false })
    })

    it('checkIp', () => {
        expect(checkIp(' 1.1.1.1 ')).toEqual({ ok: true, value: '1.1.1.1' })
        expect(checkIp('[::1]')).toEqual({ ok: true, value: '::1' })
        expect(checkIp('example.com')).toMatchObject({ ok: false })
        expect(checkIp('')).toMatchObject({ ok: false })
    })
})

describe('other inputs', () => {
    it('checkCveId', () => {
        expect(checkCveId('cve-2021-44228')).toEqual({ ok: true, value: 'CVE-2021-44228' })
        expect(checkCveId('CVE-2021-1')).toMatchObject({ ok: false })
        expect(checkCveId('log4j')).toMatchObject({ ok: false })
    })

    it('checkPort', () => {
        expect(checkPort('443')).toEqual({ ok: true, value: 443 })
        expect(checkPort('0')).toMatchObject({ ok: false })
        expect(checkPort('65536')).toMatchObject({ ok: false })
        expect(checkPort('80.5')).toMatchObject({ ok: false })
        expect(checkPort('abc')).toMatchObject({ ok: false })
    })

    it('checkHttpUrl adds https to a bare host and refuses other schemes', () => {
        expect(checkHttpUrl('example.com/path')).toEqual({ ok: true, value: 'https://example.com/path' })
        expect(checkHttpUrl('http://example.com:8080')).toEqual({ ok: true, value: 'http://example.com:8080' })
        expect(checkHttpUrl('ftp://example.com')).toMatchObject({ ok: false })
        expect(checkHttpUrl('javascript:alert(1)')).toMatchObject({ ok: false })
        expect(checkHttpUrl('')).toMatchObject({ ok: false })
        expect(checkHttpUrl(`https://example.com/${'a'.repeat(2100)}`)).toMatchObject({ ok: false })
    })

    it('checkOrigins takes up to five origins or null', () => {
        expect(checkOrigins('')).toEqual({ ok: true, value: [] })
        expect(checkOrigins('https://a.example\nnull, https://a.example')).toEqual({ ok: true, value: ['https://a.example', 'null'] })
        expect(checkOrigins('https://a.example/path')).toMatchObject({ ok: false })
        expect(checkOrigins('example.com')).toMatchObject({ ok: false })
        expect(checkOrigins('https://1.example\nhttps://2.example\nhttps://3.example\nhttps://4.example\nhttps://5.example\nhttps://6.example')).toMatchObject({ ok: false, error: 'Enter at most 5 origins.' })
    })

    it('checkSubdomainList takes 1 to 20 host names', () => {
        expect(checkSubdomainList('a.example.com\nB.example.com, a.example.com')).toEqual({ ok: true, value: ['a.example.com', 'b.example.com'] })
        expect(checkSubdomainList('')).toMatchObject({ ok: false })
        expect(checkSubdomainList('not a host!')).toMatchObject({ ok: false })
        const many = Array.from({ length: 21 }, (_, i) => `h${i}.example.com`).join('\n')
        expect(checkSubdomainList(many)).toMatchObject({ ok: false })
    })
})
