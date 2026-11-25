// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), cache: <T,>(fn: T) => fn }))

import { fetchPublicSnippet, fetchSitemapSlugs, fetchSnippetStats, fetchSnippetsPage, isSnippetRef } from '../server'
import { makeCard, makeDetail, makeViewer } from './fixtures'

const respond = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const pagination = { page: 1, limit: 12, total: 1, pages: 1, hasMore: false }

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

describe('which segments can be an exercise', () => {
    it('accepts a slug or an id and refuses reserved words and strangers', () => {
        expect(isSnippetRef('sql-injection-login')).toBe(true)
        expect(isSnippetRef('SQL-Login')).toBe(true)
        expect(isSnippetRef('0123456789abcdef01234567')).toBe(true)
        for (const bad of ['manage', 'stats', 'progress', 'attempts', '', 'a b', 'a/b', '../x', 'x'.repeat(81), 'ünï']) expect(isSnippetRef(bad)).toBe(false)
    })
})

describe('the exercise fetched while rendering', () => {
    it('answers invalid without asking the API', async () => {
        expect(await fetchPublicSnippet('manage')).toEqual({ state: 'invalid' })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns the exercise without a viewer or progress, and tags the request for the purge', async () => {
        fetchMock.mockResolvedValue(respond(200, { success: true, data: { ...makeDetail({ viewer: makeViewer() }), progress: { status: 'passed' } } }))
        const r = await fetchPublicSnippet('Sql-Injection-Login')
        expect(r.state).toBe('ok')
        if (r.state === 'ok') {
            expect(r.snippet.viewer).toBeNull()
            expect(r.snippet.progress).toBeUndefined()
            expect(r.snippet.vulnerableCode).toContain('def login')
        }
        const [address, options] = fetchMock.mock.calls[0]
        expect(address).toMatch(/\/api\/code-review\/sql-injection-login$/)
        expect(options.next).toEqual({ revalidate: 60, tags: ['code-review'] })
        expect(options.headers).toBeUndefined()
    })

    it('is missing for a 404 or 400, an error for a failure, and never throws', async () => {
        fetchMock.mockResolvedValue(respond(404, { success: false }))
        expect(await fetchPublicSnippet('nope')).toEqual({ state: 'missing' })
        fetchMock.mockResolvedValue(respond(400))
        expect(await fetchPublicSnippet('nope2')).toEqual({ state: 'missing' })
        fetchMock.mockResolvedValue(respond(500))
        expect(await fetchPublicSnippet('x1')).toEqual({ state: 'error' })
        fetchMock.mockRejectedValue(new Error('timeout'))
        expect(await fetchPublicSnippet('x2')).toEqual({ state: 'error' })
        fetchMock.mockResolvedValue(respond(200, { data: { slug: 's' } }))
        expect(await fetchPublicSnippet('x3')).toEqual({ state: 'error' })
    })
})

describe('the first page of the list', () => {
    it('keeps the cards that parse and drops a member\'s progress', async () => {
        fetchMock.mockResolvedValue(respond(200, { data: [{ ...makeCard(), progress: { status: 'passed' } }, { broken: true }], pagination }))
        const page = await fetchSnippetsPage(12)
        expect(page?.data).toHaveLength(1)
        expect(page?.data[0].progress).toBeUndefined()
        expect(page?.pagination.hasMore).toBe(false)
        expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/code-review\?limit=12$/)
    })

    it('is null when the API fails, so the browser asks again', async () => {
        fetchMock.mockResolvedValue(respond(503))
        expect(await fetchSnippetsPage()).toBeNull()
        fetchMock.mockRejectedValue(new Error('x'))
        expect(await fetchSnippetsPage()).toBeNull()
        fetchMock.mockResolvedValue(respond(200, { data: 'x' }))
        expect(await fetchSnippetsPage()).toBeNull()
        fetchMock.mockResolvedValue(respond(200, { data: [] }))
        expect(await fetchSnippetsPage()).toBeNull()
    })
})

describe('the totals', () => {
    it('reads them without a viewer', async () => {
        fetchMock.mockResolvedValue(respond(200, { data: { total: 3, facets: { categories: [], difficulties: [], languages: [] }, viewer: { attempted: 1, passed: 0, points: 0 } } }))
        expect((await fetchSnippetStats())?.viewer).toBeNull()
        fetchMock.mockResolvedValue(respond(500))
        expect(await fetchSnippetStats()).toBeNull()
    })
})

describe('the exercises for the sitemap', () => {
    it('reads every page of the public list and keeps only the addresses', async () => {
        fetchMock
            .mockResolvedValueOnce(respond(200, { data: [{ ...makeCard({ slug: 'a-one' }), vulnerableCode: 'x' }, { slug: 'manage' }, { slug: 'Bad Slug' }, { title: 'no slug' }], pagination: { ...pagination, hasMore: true } }))
            .mockResolvedValueOnce(respond(200, { data: [{ slug: 'b-two' }, { slug: 'a-one' }], pagination }))
        expect(await fetchSitemapSlugs()).toEqual(['a-one', 'b-two'])
        expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/code-review\?limit=50&page=1$/)
        expect(String(fetchMock.mock.calls[1][0])).toMatch(/page=2$/)
        expect(fetchMock.mock.calls[0][1].next.revalidate).toBe(3600)
    })

    it('keeps what it read when the API fails later, and is empty when it fails at once', async () => {
        fetchMock.mockResolvedValueOnce(respond(200, { data: [{ slug: 'a-one' }], pagination: { ...pagination, hasMore: true } })).mockResolvedValueOnce(respond(503))
        expect(await fetchSitemapSlugs()).toEqual(['a-one'])
        fetchMock.mockReset()
        fetchMock.mockRejectedValue(new Error('down'))
        expect(await fetchSitemapSlugs()).toEqual([])
        fetchMock.mockReset()
        fetchMock.mockResolvedValue(respond(200, { data: 'x' }))
        expect(await fetchSitemapSlugs()).toEqual([])
    })
})
