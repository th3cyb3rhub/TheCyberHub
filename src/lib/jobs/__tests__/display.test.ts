import { describe, expect, it, vi } from 'vitest'
import { applyTarget, openOutbound } from '../apply'
import {
    daysLeftText, effectiveStatus, savedChanges, formatSalary, hostOf, isEmail, isPublicNow, LINK_REL, locationText, mailtoHref, safeHref,
} from '../display'

describe('link guard', () => {
    it.each([
        'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd',
        'ftp://example.com/a', '//evil.example/x', '/relative/path', 'mailto:a@b.co', '', '   ', null, undefined,
    ])('refuses %j', (value) => {
        expect(safeHref(value as string | null | undefined)).toBeNull()
    })

    it('lets http and https through, and nothing else', () => {
        expect(safeHref('https://careers.example.com/apply?id=1')).toBe('https://careers.example.com/apply?id=1')
        expect(safeHref('http://example.com')).toBe('http://example.com/')
    })

    it('opens outbound links with noopener and noreferrer, and only plain web links', () => {
        const win = { open: vi.fn() }
        expect(openOutbound('https://example.com/x', win)).toBe(true)
        expect(win.open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer')
        expect(openOutbound('javascript:alert(1)', win)).toBe(false)
        expect(openOutbound('data:text/html,x', win)).toBe(false)
        expect(win.open).toHaveBeenCalledTimes(1)
        expect(openOutbound('https://example.com', null)).toBe(false)
    })

    it('uses noopener noreferrer for every link the page renders', () => {
        expect(LINK_REL).toContain('noopener')
        expect(LINK_REL).toContain('noreferrer')
    })

    it('shows a host without www', () => {
        expect(hostOf('https://www.example.com/a/b')).toBe('example.com')
    })
})

describe('what Apply does', () => {
    it('prefers the apply link, then the email, else nothing', () => {
        expect(applyTarget({ applyUrl: 'https://a.example/apply', applyEmail: 'jobs@a.example' })).toEqual({ kind: 'url', href: 'https://a.example/apply', host: 'a.example' })
        const mail = applyTarget({ applyUrl: null, applyEmail: 'jobs@a.example' }, 'Pentester')
        expect(mail.kind).toBe('email')
        if (mail.kind === 'email') {
            expect(mail.href).toBe('mailto:jobs@a.example?subject=Application%20for%20Pentester')
            expect(mail.address).toBe('jobs@a.example')
        }
        expect(applyTarget({ applyUrl: null, applyEmail: null })).toEqual({ kind: 'none' })
        expect(applyTarget(null)).toEqual({ kind: 'none' })
    })

    it('never follows a script link, even when the answer carries one', () => {
        expect(applyTarget({ applyUrl: 'javascript:alert(1)', applyEmail: null })).toEqual({ kind: 'none' })
        expect(applyTarget({ applyUrl: 'javascript:alert(1)', applyEmail: 'jobs@a.example' }).kind).toBe('email')
    })

    it('refuses an address that is not one', () => {
        expect(isEmail('a@b.co')).toBe(true)
        expect(isEmail('a b@c.co')).toBe(false)
        expect(isEmail('<x>@c.co')).toBe(false)
        expect(mailtoHref('nope')).toBeNull()
    })

    it('gives no mailto link to an address that could add a header or a field', () => {
        for (const bad of ['a@b.co?bcc=x@evil.example', 'a&cc=x@evil.example@b.co', 'a#x@b.co', 'a%0Abcc:x@b.co', 'a=b@c.co', 'a/b@c.co']) {
            expect(mailtoHref(bad, 'Job')).toBeNull()
        }
        expect(mailtoHref('jobs+eu@a.example', 'Job')).toBe('mailto:jobs+eu@a.example?subject=Application%20for%20Job')
    })
})

describe('status and dates', () => {
    const now = Date.parse('2030-02-01T00:00:00Z')
    it('shows an approved job past its end date as expired', () => {
        expect(effectiveStatus({ status: 'approved', expiresAt: '2030-01-31T00:00:00Z' }, now)).toBe('expired')
        expect(effectiveStatus({ status: 'approved', expiresAt: '2030-03-01T00:00:00Z' }, now)).toBe('approved')
        expect(effectiveStatus({ status: 'closed', expiresAt: '2030-01-01T00:00:00Z' }, now)).toBe('closed')
        expect(isPublicNow({ status: 'approved', expiresAt: '2030-01-31T00:00:00Z' }, now)).toBe(false)
    })

    it('counts the days left', () => {
        expect(daysLeftText('2030-02-11T00:00:00Z', now)).toBe('10 days left')
        expect(daysLeftText('2030-02-02T00:00:00Z', now)).toBe('1 day left')
        expect(daysLeftText('2030-01-01T00:00:00Z', now)).toBe('Ends today')
        expect(daysLeftText(null, now)).toBeNull()
    })
})

describe('job facts', () => {
    it('writes a pay range and a location', () => {
        expect(formatSalary({ min: 90000, max: 120000, currency: 'USD', period: 'yearly' })).toMatch(/90,000/)
        expect(formatSalary({})).toBeNull()
        expect(formatSalary(null)).toBeNull()
        expect(locationText({ locationType: 'remote', location: null })).toMatch(/Remote/)
        expect(locationText({ locationType: 'onsite', location: 'Berlin' })).toMatch(/Berlin/)
    })
})

describe('the saved change of a company against what the public sees', () => {
    const base = { name: 'Acme', website: 'https://a.example', logo: null }
    it('lists only the fields that differ from the approved ones', () => {
        expect(savedChanges({ ...base, reviewed: { name: 'Acme', website: 'https://a.example', logo: null } })).toEqual([])
        expect(savedChanges({ ...base, name: 'Acme Labs', logo: 'https://a.example/l.png', reviewed: { name: 'Acme', website: 'https://a.example', logo: null } })).toEqual([
            { field: 'Name', saved: 'Acme Labs', reviewed: 'Acme' },
            { field: 'Logo', saved: 'https://a.example/l.png', reviewed: 'none' },
        ])
    })
    it('has nothing to compare when nobody approved the company yet', () => {
        expect(savedChanges({ ...base, reviewed: null })).toEqual([])
        expect(savedChanges(base)).toEqual([])
    })
})
