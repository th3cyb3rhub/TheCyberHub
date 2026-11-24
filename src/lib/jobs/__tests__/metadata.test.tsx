import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StructuredData from '@/components/StructuredData'
import { companyMetadata, jobMetadata, jobPostingJsonLd, jobsListMetadata } from '../metadata'
import { card, company, job } from './fixtures'

describe('job page metadata', () => {
    it('has a canonical address on the slug, and keeps a missing job out of search results', () => {
        const meta = jobMetadata(job())
        expect(meta.alternates?.canonical).toMatch(/\/jobs\/senior-pentester-abc123$/)
        expect(meta.title).toBe('Senior Pentester at Acme Security')
        expect(jobMetadata(null).robots).toEqual({ index: false, follow: false })
    })

    it('does not use a logo that is not a web link', () => {
        const meta = jobMetadata(job({ companyLogo: 'javascript:alert(1)', companyRef: null }))
        expect(JSON.stringify(meta.openGraph?.images)).not.toContain('javascript')
    })

    it('does not index a filtered list, and points it at the plain one', () => {
        expect(jobsListMetadata(true).robots).toEqual({ index: false, follow: true })
        expect(jobsListMetadata(false).robots).toBeUndefined()
        expect(jobsListMetadata(true).alternates?.canonical).toBe('/jobs')
    })

    it('keeps a missing company out of search results', () => {
        expect(companyMetadata(null).robots).toEqual({ index: false, follow: false })
        expect(companyMetadata(company()).alternates?.canonical).toMatch(/\/company\/acme-security$/)
    })
})

describe('JobPosting structured data', () => {
    it('describes the job for search engines', () => {
        const data = jobPostingJsonLd(job())
        expect(data['@type']).toBe('JobPosting')
        expect(data.employmentType).toBe('FULL_TIME')
        expect(data.jobLocationType).toBe('TELECOMMUTE')
        expect(data.hiringOrganization).toMatchObject({ '@type': 'Organization', name: 'Acme Security', sameAs: 'https://acme.example/' })
        expect(data.baseSalary).toMatchObject({ currency: 'USD', value: { minValue: 90000, maxValue: 120000, unitText: 'YEAR' } })
        expect(data.validThrough).toBe('2030-01-31T00:00:00.000Z')
    })

    it('uses a place for an on-site job and drops a bad website', () => {
        const data = jobPostingJsonLd(job({ locationType: 'onsite', location: 'Berlin', companyWebsite: 'javascript:1', companyRef: null }))
        expect(data.jobLocation).toMatchObject({ address: { addressLocality: 'Berlin' } })
        expect(data).not.toHaveProperty('jobLocationType')
        expect(JSON.stringify(data.hiringOrganization)).not.toContain('javascript')
    })

    it('escapes the two line separators too, so older script parsers keep one line', () => {
        const html = renderToStaticMarkup(<StructuredData data={{ name: 'a\u2028b\u2029c' }} />)
        expect(html).not.toMatch(/[\u2028\u2029]/)
        expect(html).toContain('a\\u2028b\\u2029c')
        const body = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
        expect(JSON.parse(body)).toEqual({ name: 'a\u2028b\u2029c' })
    })

    it('escapes the description before it becomes HTML, and `<` before it is written into the page', () => {
        const evil = job({ title: '</script><script>alert(1)</script>', description: '<img src=x onerror=alert(1)> and </script><script>alert(2)</script>\n\nSecond paragraph' })
        const data = jobPostingJsonLd(evil)
        expect(String(data.description)).not.toContain('<img')
        expect(String(data.description)).toContain('&lt;img')
        expect(String(data.description)).toContain('<p>')
        const html = renderToStaticMarkup(<StructuredData data={data} />)
        // Exactly one script element: the text cannot close it
        expect(html.match(/<script/g)).toHaveLength(1)
        expect(html.match(/<\/script>/g)).toHaveLength(1)
        expect(html).not.toContain('</script><script>')
        const body = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
        // The JSON still reads back to the original text
        expect(JSON.parse(body).name ?? JSON.parse(body).title).toBe('</script><script>alert(1)</script>')
    })

    it('accepts a card (no lists) without failing', () => {
        expect(jobPostingJsonLd(card())['@type']).toBe('JobPosting')
    })
})
