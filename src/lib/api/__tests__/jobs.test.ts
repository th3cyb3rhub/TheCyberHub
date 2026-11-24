import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async () => ({ ...(await vi.importActual<typeof import('@/lib/api')>('@/lib/api')), fetchApi }))

import * as jobs from '../jobs'

const urls = () => fetchApi.mock.calls.map((c) => String(c[0]))
const init = (n = 0) => fetchApi.mock.calls[n][1] as { method?: string; body?: string; requireAuth?: boolean } | undefined

beforeEach(() => { fetchApi.mockReset(); fetchApi.mockResolvedValue({ success: true, data: {}, meta: {} }) })

describe('the jobs client', () => {
    it('never calls the deprecated employer routes', async () => {
        await jobs.listMyJobs({ status: 'draft' })
        await jobs.getMyStats()
        await jobs.createJob({ title: 'x' })
        await jobs.updateJob('1', {})
        await jobs.submitJob('1')
        await jobs.closeJob('1')
        await jobs.reopenJob('1')
        await jobs.deleteJob('1')
        await jobs.becomeEmployer({ name: 'Acme' })
        await jobs.getMyCompany()
        expect(urls().some((u) => u.includes('/employer'))).toBe(false)
        expect(urls()[0]).toBe('/api/jobs/mine?status=draft')
        expect(urls()[1]).toBe('/api/jobs/mine/stats')
    })

    it('reads the list with the filters and the job by reference, with its redirect meta', async () => {
        fetchApi.mockResolvedValueOnce({ data: { _id: 'j' }, meta: { redirectedFromSlug: 'old', canonicalSlug: 'new' } })
        const got = await jobs.getJob('old slug/x')
        expect(urls()[0]).toBe('/api/jobs/old%20slug%2Fx')
        expect(got.meta).toEqual({ redirectedFromSlug: 'old', canonicalSlug: 'new' })
        await jobs.listJobs({ category: 'soc', page: 2 })
        expect(urls()[1]).toContain('category=soc')
        expect(urls()[1]).toContain('page=2')
    })

    it('counts the apply click, sends the token when there is one and returns where to apply', async () => {
        fetchApi.mockResolvedValueOnce({ data: { applyUrl: 'https://a.example/apply', applyEmail: null } })
        expect(await jobs.applyToJob('j1')).toEqual({ applyUrl: 'https://a.example/apply', applyEmail: null })
        expect(urls()[0]).toBe('/api/jobs/j1/apply')
        // Sign-in is optional on this route: the token goes along (fetchApi adds it), it is never switched off
        expect(init()).toEqual({ method: 'POST' })
        expect(init()?.requireAuth).not.toBe(false)
        fetchApi.mockResolvedValueOnce({ data: null })
        expect(await jobs.applyToJob('j2')).toEqual({ applyUrl: null, applyEmail: null })
    })

    it('reports with a trimmed detail and leaves it out when empty', async () => {
        await jobs.reportJob('j1', { reason: 'scam', details: '  asks for money  ' })
        expect(JSON.parse(init()!.body!)).toEqual({ reason: 'scam', details: 'asks for money' })
        await jobs.reportJob('j1', { reason: 'spam', details: '   ' })
        expect(JSON.parse(init(1)!.body!)).toEqual({ reason: 'spam' })
    })

    it('saves and unsaves through the bookmarks', async () => {
        await jobs.saveJob('j1')
        await jobs.unsaveJob('j1')
        expect(urls()).toEqual(['/api/bookmarks', '/api/bookmarks/job/j1'])
        expect(JSON.parse(init()!.body!)).toEqual({ contentType: 'job', contentId: 'j1' })
        expect(init(1)?.method).toBe('DELETE')
    })

    it('sends the reopen date only when there is one', async () => {
        await jobs.reopenJob('j1', '2031-01-01T00:00:00.000Z')
        await jobs.reopenJob('j1')
        expect(JSON.parse(init()!.body!)).toEqual({ expiresAt: '2031-01-01T00:00:00.000Z' })
        expect(JSON.parse(init(1)!.body!)).toEqual({})
    })

    it('takes the review decisions to the review routes, with the reason', async () => {
        await jobs.approveJob('j1')
        await jobs.rejectJob('j1', '  Not a real role  ')
        await jobs.approveCompany('c1')
        await jobs.rejectCompany('c1', 'Site does not exist')
        await jobs.reviewReportedJob('j1', 'dismiss')
        expect(urls()).toEqual(['/api/jobs/admin/j1/approve', '/api/jobs/admin/j1/reject', '/api/companies/admin/c1/approve', '/api/companies/admin/c1/reject', '/api/moderation/items/review'])
        expect(JSON.parse(init(1)!.body!)).toEqual({ reason: 'Not a real role' })
        expect(JSON.parse(init(4)!.body!)).toEqual({ contentType: 'job', contentId: 'j1', action: 'dismiss' })
    })

    it('lists the review queue with its filters', async () => {
        await jobs.listAdminJobs({ status: 'pending', sort: 'oldest', page: 1, limit: 20 })
        await jobs.listAdminJobs({ reported: true, status: 'all', q: ' acme ', page: 3 })
        expect(urls()[0]).toBe('/api/jobs/admin?status=pending&sort=oldest&limit=20')
        expect(urls()[1]).toBe('/api/jobs/admin?status=all&reported=true&q=acme&page=3')
    })
})

describe('decisions and the new calls', () => {
    it('binds every decision to the updatedAt the reviewer saw, and sends none when there is none', async () => {
        await jobs.approveJob('j1', { note: ' fine ', updatedAt: '2030-01-02T00:00:00.000Z' })
        await jobs.rejectJob('j1', 'No', { updatedAt: '2030-01-02T00:00:00.000Z' })
        await jobs.approveCompany('c1', { updatedAt: '2030-02-01T00:00:00.000Z' })
        await jobs.rejectCompany('c1', 'No site', { updatedAt: '2030-02-01T00:00:00.000Z' })
        await jobs.approveJob('j2')
        const bodies = [0, 1, 2, 3, 4].map((n) => JSON.parse(init(n)!.body!))
        expect(bodies).toEqual([
            { note: 'fine', updatedAt: '2030-01-02T00:00:00.000Z' },
            { reason: 'No', updatedAt: '2030-01-02T00:00:00.000Z' },
            { updatedAt: '2030-02-01T00:00:00.000Z' },
            { reason: 'No site', updatedAt: '2030-02-01T00:00:00.000Z' },
            {},
        ])
    })

    it('closes with an optional reason', async () => {
        await jobs.closeJob('j1', '  Duplicate  ')
        await jobs.closeJob('j2')
        expect(JSON.parse(init(0)!.body!)).toEqual({ reason: 'Duplicate' })
        expect(JSON.parse(init(1)!.body!)).toEqual({})
    })

    it('asks for a new review of a rejected company on its own route', async () => {
        await jobs.resubmitMyCompany()
        expect(urls()[0]).toBe('/api/companies/my/resubmit')
        expect(init()?.method).toBe('POST')
    })

    it('reads a job without a cache, so the API counts the view', async () => {
        await jobs.getJob('j1')
        expect(init()).toMatchObject({ cache: 'no-store' })
    })
})
