import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCompany, fetchCompanyJobs, fetchJobsPage, fetchPublicJob, isCompanySlug, isJobRef } from '../server'
import { card, company, job } from './fixtures'

const reply = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const stub = (res: Response | Error) => {
    const fn = vi.fn().mockImplementation(() => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res)))
    vi.stubGlobal('fetch', fn)
    return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('references', () => {
    it('knows what can be a job reference and a company slug', () => {
        expect(isJobRef('senior-pentester-abc123')).toBe(true)
        expect(isJobRef('65f1c0ffee')).toBe(true)
        expect(isJobRef('../etc/passwd')).toBe(false)
        expect(isJobRef('a b')).toBe(false)
        expect(isJobRef('')).toBe(false)
        expect(isCompanySlug('acme-security')).toBe(true)
        expect(isCompanySlug('Acme_Security')).toBe(false)
    })
})

describe('fetchPublicJob', () => {
    it('returns the job with the canonical slug the API gave for an old address', async () => {
        const fetchMock = stub(reply(200, { success: true, data: job(), meta: { redirectedFromSlug: 'old-slug', canonicalSlug: 'senior-pentester-abc123' } }, { date: 'Tue, 01 Jan 2030 00:00:00 GMT' }))
        const result = await fetchPublicJob('old-slug')
        expect(result.state).toBe('ok')
        if (result.state === 'ok') {
            expect(result.meta).toEqual({ redirectedFromSlug: 'old-slug', canonicalSlug: 'senior-pentester-abc123' })
            expect(result.job.title).toBe('Senior Pentester')
            expect(result.fetchedAt).toBe(Date.parse('2030-01-01T00:00:00Z'))
        }
        const [url, init] = fetchMock.mock.calls[0]
        expect(String(url)).toMatch(/\/api\/jobs\/old-slug$/)
        // No token is sent: the page a crawler gets is the page everybody gets
        expect(init.headers).toBeUndefined()
        expect(init.next).toEqual({ revalidate: 60, tags: ['jobs'] })
    })

    it('says missing for a 404 and invalid for a reference that cannot exist, without asking', async () => {
        const fetchMock = stub(reply(404, { success: false }))
        expect(await fetchPublicJob('draft-job-1')).toEqual({ state: 'missing' })
        fetchMock.mockClear()
        expect(await fetchPublicJob('../secret')).toEqual({ state: 'invalid' })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('fails soft: an error status, a bad body and a network error give `error`, never an exception', async () => {
        stub(reply(500))
        expect(await fetchPublicJob('a-job-1')).toEqual({ state: 'error' })
        stub(reply(200, { data: { nope: true } }))
        expect(await fetchPublicJob('a-job-2')).toEqual({ state: 'error' })
        stub(new Error('connection refused'))
        expect(await fetchPublicJob('a-job-3')).toEqual({ state: 'error' })
    })
})

describe('fetchJobsPage', () => {
    it('keeps the cards that parse and asks with the filters', async () => {
        const fetchMock = stub(reply(200, {
            success: true,
            data: [card(), { _id: 'broken' }, card({ _id: 'j2', slug: 'soc-analyst-1', title: 'SOC Analyst' })],
            pagination: { page: 1, limit: 20, total: 3, totalPages: 1, pages: 1, hasMore: false },
        }))
        const page = await fetchJobsPage({ category: 'soc' })
        expect(page?.data.map((j) => j._id)).toEqual(['j1', 'j2'])
        expect(String(fetchMock.mock.calls[0][0])).toContain('category=soc')
    })

    it('gives null when the API fails or answers something else', async () => {
        stub(reply(503))
        expect(await fetchJobsPage({ search: 'x1' })).toBeNull()
        stub(reply(200, { data: 'no' }))
        expect(await fetchJobsPage({ search: 'x2' })).toBeNull()
        stub(new Error('down'))
        expect(await fetchJobsPage({ search: 'x3' })).toBeNull()
    })
})

describe('company pages', () => {
    it('reads a company and its jobs', async () => {
        stub(reply(200, { data: company() }))
        const result = await fetchCompany('acme-security')
        expect(result.state).toBe('ok')
        stub(reply(200, { data: [card()], pagination: { page: 2, limit: 20, total: 21, totalPages: 2, pages: 2, hasMore: false } }))
        const jobs = await fetchCompanyJobs('acme-security', 2)
        expect(jobs?.data).toHaveLength(1)
        expect(jobs?.pagination.page).toBe(2)
    })

    it('is missing for a 404 (a rejected company too) and invalid for a bad slug', async () => {
        stub(reply(404))
        expect(await fetchCompany('gone-co')).toEqual({ state: 'missing' })
        expect(await fetchCompany('Not A Slug!')).toEqual({ state: 'invalid' })
        stub(reply(500))
        expect(await fetchCompany('other-co')).toEqual({ state: 'error' })
    })
})
