import { describe, expect, it } from 'vitest'
import {
    companyToForm, emptyCompanyForm, emptyJobForm, expiryFromDays, jobToForm, toCompanyPayload, toJobPayload, validateCompanyForm, validateJobForm,
    type JobFormValues,
} from '../form'
import { job } from './fixtures'

const valid = (over: Partial<JobFormValues> = {}): JobFormValues => ({
    ...emptyJobForm(),
    title: 'Senior Pentester',
    description: 'We need somebody to break our products before somebody else does, and to write it up.',
    ...over,
})

describe('job form validation', () => {
    it('accepts a minimal job', () => {
        expect(validateJobForm(valid())).toEqual({})
    })

    it('checks the limits of the API before sending', () => {
        const e = validateJobForm(valid({ title: 'abc', description: 'short' }))
        expect(e.title).toMatch(/at least 5/)
        expect(e.description).toMatch(/at least 50/)
        expect(validateJobForm(valid({ title: 'x'.repeat(151) })).title).toMatch(/at most 150/)
        expect(validateJobForm(valid({ description: 'x'.repeat(10001) })).description).toMatch(/at most 10000/)
        expect(validateJobForm(valid({ location: 'x'.repeat(101) })).location).toMatch(/at most 100/)
        expect(validateJobForm(valid({ skills: ['x'.repeat(51)] })).skills).toMatch(/50/)
        expect(validateJobForm(valid({ benefits: ['x'.repeat(101)] })).benefits).toMatch(/100/)
        expect(validateJobForm(valid({ requirements: Array.from({ length: 21 }, (_, i) => `r${i}`) })).requirements).toMatch(/20 items/)
    })

    it('refuses links that are not http or https and bad addresses', () => {
        expect(validateJobForm(valid({ applyUrl: 'javascript:alert(1)' })).applyUrl).toMatch(/http/)
        expect(validateJobForm(valid({ applyUrl: 'ftp://x.example' })).applyUrl).toMatch(/http/)
        expect(validateJobForm(valid({ applyUrl: 'https://x.example/apply' })).applyUrl).toBeUndefined()
        expect(validateJobForm(valid({ applyEmail: 'not-an-email' })).applyEmail).toMatch(/valid email/)
    })

    it('checks the pay range', () => {
        expect(validateJobForm(valid({ salaryMin: '100', salaryMax: '50' }))['salary.max']).toMatch(/cannot be lower/)
        expect(validateJobForm(valid({ salaryMin: '-5' }))['salary.min']).toBeDefined()
        expect(validateJobForm(valid({ salaryMin: 'abc' }))['salary.min']).toBeDefined()
        expect(validateJobForm(valid({ salaryMin: '100', salaryMax: '200' }))).toEqual({})
    })

    it('limits how long a job runs: 90 days for employers, a year for administrators', () => {
        expect(validateJobForm(valid({ runFor: '91' })).runFor).toMatch(/1 and 90/)
        expect(validateJobForm(valid({ runFor: '90' })).runFor).toBeUndefined()
        expect(validateJobForm(valid({ runFor: '180' }), { admin: true }).runFor).toBeUndefined()
        expect(validateJobForm(valid({ runFor: '0' })).runFor).toBeDefined()
    })

    it('asks administrators for the company name', () => {
        expect(validateJobForm(valid(), { admin: true }).company).toBeDefined()
        expect(validateJobForm(valid({ company: 'Acme' }), { admin: true }).company).toBeUndefined()
        expect(validateJobForm(valid({ company: 'Acme', companyWebsite: 'javascript:1' }), { admin: true }).companyWebsite).toMatch(/http/)
    })
})

describe('job payload', () => {
    it('sends only the filled optional fields for a new job and the company fields never for an employer', () => {
        const body = toJobPayload(valid({ company: 'Evil Co', isFeatured: true, companyLogo: 'https://x.example/l.png' }))
        expect(body).not.toHaveProperty('company')
        expect(body).not.toHaveProperty('isFeatured')
        expect(body).not.toHaveProperty('companyLogo')
        expect(body).not.toHaveProperty('location')
        expect(body).not.toHaveProperty('salary')
        expect(body).not.toHaveProperty('applyUrl')
        expect(body).not.toHaveProperty('saveAsDraft')
        expect(body.title).toBe('Senior Pentester')
    })

    it('marks a draft, trims, drops empty list items and sends pay as numbers', () => {
        const body = toJobPayload(valid({ title: '  Senior Pentester  ', skills: [' Burp ', ' ', 'Python'], salaryMin: '90000', salaryMax: '120000', salaryCurrency: 'eur', location: ' Berlin ' }), { saveAsDraft: true })
        expect(body.saveAsDraft).toBe(true)
        expect(body.title).toBe('Senior Pentester')
        expect(body.skills).toEqual(['Burp', 'Python'])
        expect(body.salary).toEqual({ min: 90000, max: 120000, currency: 'EUR', period: 'yearly' })
        expect(body.location).toBe('Berlin')
    })

    it('lets an edit clear what was emptied', () => {
        const body = toJobPayload(valid({ applyUrl: '', applyEmail: '', location: '', applicationDeadline: '' }), { edit: true })
        expect(body.applyUrl).toBe('')
        expect(body.applyEmail).toBe('')
        expect(body.location).toBe('')
        expect(body.applicationDeadline).toBeNull()
        expect(body.salary).toEqual({})
        expect(body).not.toHaveProperty('saveAsDraft')
    })

    it('sets the end date from a number of days, a minute short of the day', () => {
        const now = Date.parse('2030-01-01T00:00:00Z')
        expect(expiryFromDays(30, now)).toBe(new Date(now + 30 * 86_400_000 - 60_000).toISOString())
        expect(toJobPayload(valid({ runFor: '30' }), { now }).expiresAt).toBe(expiryFromDays(30, now))
        expect(toJobPayload(valid(), { now })).not.toHaveProperty('expiresAt')
    })

    it('adds the company fields and the featured flag for an administrator', () => {
        const body = toJobPayload(valid({ company: ' Acme ', isFeatured: true }), { admin: true })
        expect(body.company).toBe('Acme')
        expect(body.isFeatured).toBe(true)
    })

    it('round-trips a job into the form', () => {
        const values = jobToForm(job({ applicationDeadline: '2030-05-05T23:59:59.000Z' }))
        expect(values.title).toBe('Senior Pentester')
        expect(values.salaryMin).toBe('90000')
        expect(values.applicationDeadline).toBe('2030-05-05')
        expect(values.runFor).toBe('')
        expect(validateJobForm(values)).toEqual({})
    })
})

describe('company form', () => {
    it('needs a name and web links', () => {
        expect(validateCompanyForm(emptyCompanyForm()).name).toBeDefined()
        expect(validateCompanyForm(emptyCompanyForm('Acme'))).toEqual({})
        const e = validateCompanyForm({ ...emptyCompanyForm('Acme'), website: 'javascript:1', linkedin: 'ftp://x', size: 'huge' })
        expect(e.website).toMatch(/http/)
        expect(e['socialLinks.linkedin']).toMatch(/http/)
        expect(e.size).toBeDefined()
    })

    it('sends an emptied field as null so it clears', () => {
        const body = toCompanyPayload({ ...emptyCompanyForm('  Acme '), industry: ' ', website: 'https://acme.example' })
        expect(body).toEqual({
            name: 'Acme', logo: null, website: 'https://acme.example', description: null, industry: null, size: '', location: null,
            socialLinks: { linkedin: null, twitter: null },
        })
        expect(companyToForm(null, 'Acme').name).toBe('Acme')
    })
})
