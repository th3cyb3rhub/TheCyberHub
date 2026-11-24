import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
const token = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('@/lib/api', async () => ({
    ...(await vi.importActual<typeof import('@/lib/api')>('@/lib/api')),
    fetchApi,
    tokenStore: { get: () => token.value, set: vi.fn(), remove: vi.fn() },
}))

import { ApiError } from '@/lib/api'
import * as cr from '../codeReview'
import { makeAdminSnippet, makeCard, makeDetail, makeManageCard, makeResult, makeViewer } from '@/lib/codeReview/__tests__/fixtures'

const url = (n = 0) => String(fetchApi.mock.calls[n][0])
const init = (n = 0) => fetchApi.mock.calls[n][1] as { method?: string; body?: string; cache?: string } | undefined
const pagination = { page: 1, limit: 12, total: 1, pages: 1, hasMore: false }

beforeEach(() => {
    fetchApi.mockReset()
    token.value = null
})

describe('the list', () => {
    it('asks with the filters the API knows and leaves out the empty ones', async () => {
        fetchApi.mockResolvedValue({ success: true, count: 1, data: [makeCard()], pagination })
        await cr.listSnippets({ category: 'sqli', difficulty: '', search: ' login ', status: 'passed', sortBy: 'difficulty', sortOrder: 'asc', page: 2, limit: 12 })
        const u = new URL(url(), 'http://x')
        expect(u.pathname).toBe('/api/code-review')
        expect(Object.fromEntries(u.searchParams)).toEqual({ category: 'sqli', search: 'login', status: 'passed', sortBy: 'difficulty', sortOrder: 'asc', page: '2', limit: '12' })
    })

    it('reads cards and tolerates fields it does not know', async () => {
        fetchApi.mockResolvedValue({ success: true, count: 1, data: [{ ...makeCard(), somethingNew: { a: 1 }, progress: { ...makeViewer(), status: 'passed', extra: true } }], pagination, meta: {} })
        const page = await cr.listSnippets()
        expect(page.data[0].slug).toBe('sql-injection-login')
        expect(page.data[0]).not.toHaveProperty('somethingNew')
        expect(page.data[0].progress?.status).toBe('passed')
        expect(page.pagination.hasMore).toBe(false)
    })

    it('fills what a newer or older API leaves out, and keeps an unknown category readable', async () => {
        fetchApi.mockResolvedValue({ data: [{ _id: 'x', slug: 's', title: 'T', category: 'brand-new', difficulty: 'impossible' }], pagination: { hasMore: true } })
        const page = await cr.listSnippets()
        expect(page.data[0]).toMatchObject({ category: 'brand-new', difficulty: 'medium', tags: [], findingCount: 0, summary: '' })
        expect(page.pagination.hasMore).toBe(true)
    })

    it('does not use the HTTP cache once there is a token, because the answer carries the member\'s progress', async () => {
        fetchApi.mockResolvedValue({ data: [], pagination })
        await cr.listSnippets()
        expect(init()?.cache).toBeUndefined()
        token.value = 'tok'
        await cr.listSnippets()
        expect(init(1)?.cache).toBe('no-store')
    })

    it('shows an answer of the wrong shape as an error, never a half page', async () => {
        fetchApi.mockResolvedValue({ data: 'nope', pagination })
        await expect(cr.listSnippets()).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
        fetchApi.mockResolvedValue({ data: [{ slug: 'no-id' }], pagination })
        await expect(cr.listSnippets()).rejects.toBeInstanceOf(ApiError)
    })

    it('lets the API error through', async () => {
        fetchApi.mockRejectedValue(new ApiError('down', 503))
        await expect(cr.listSnippets()).rejects.toMatchObject({ status: 503 })
    })
})

describe('one exercise', () => {
    it('asks by slug, encoded, and returns the code and the viewer', async () => {
        fetchApi.mockResolvedValue({ success: true, data: { ...makeDetail(), secretKey: 'x' } })
        const d = await cr.getSnippet('a b/c')
        expect(url()).toBe('/api/code-review/a%20b%2Fc')
        expect(d.vulnerableCode).toContain('def login')
        expect(d.viewer?.attemptsLeftToday).toBe(30)
        expect(d).not.toHaveProperty('secretKey')
    })

    it('a visitor has no viewer', async () => {
        fetchApi.mockResolvedValue({ data: { ...makeDetail(), viewer: null } })
        expect((await cr.getSnippet('x')).viewer).toBeNull()
    })

    it('needs the code', async () => {
        fetchApi.mockResolvedValue({ data: { ...makeDetail(), vulnerableCode: undefined } })
        await expect(cr.getSnippet('x')).rejects.toMatchObject({ code: 'BAD_RESPONSE' })
    })
})

describe('stats and progress', () => {
    it('reads the totals with the facets and the viewer block', async () => {
        fetchApi.mockResolvedValue({ data: { total: 25, facets: { categories: [{ category: 'xss', count: 3 }], difficulties: [], languages: [] }, viewer: { attempted: 4, passed: 2, points: 75, more: 1 } } })
        const s = await cr.getStats()
        expect(url()).toBe('/api/code-review/stats')
        expect(s.viewer).toEqual({ attempted: 4, passed: 2, points: 75 })
        expect(s.facets.categories[0]).toEqual({ category: 'xss', count: 3 })
        fetchApi.mockResolvedValue({ data: { total: 1, facets: { categories: [], difficulties: [], languages: [] }, viewer: null } })
        expect((await cr.getStats()).viewer).toBeNull()
    })

    it('reads my progress: the summary and the rows', async () => {
        fetchApi.mockResolvedValue({
            summary: { attempted: 1, passed: 1, points: 25 },
            data: [{ status: 'passed', attempts: 2, bestScore: 20, maxScore: 20, bestPercent: 100, passed: true, pointsEarned: 25, snippet: { _id: '1', slug: 's', title: 'T', category: 'xss', difficulty: 'easy', points: 25, findingCount: 2 }, passedAt: null, hintsUsed: 0, solutionViewed: false, lastAttemptAt: null }],
        })
        const p = await cr.getMyProgress()
        expect(url()).toBe('/api/code-review/progress/me')
        expect(p.summary.points).toBe(25)
        expect(p.data[0].snippet.slug).toBe('s')
    })
})

describe('what a member sends', () => {
    it('posts the marks and nothing else: no user, score, points or hints used', async () => {
        fetchApi.mockResolvedValue({ data: makeResult() })
        await cr.submitAttempt('sql-injection-login', [
            { lineStart: 4, lineEnd: 5, vulnerabilityType: 'sqli' }, { lineStart: 9, lineEnd: 9, vulnerabilityType: '', userId: 'u', score: 99 } as never,
        ])
        expect(url()).toBe('/api/code-review/sql-injection-login/attempts')
        expect(init()?.method).toBe('POST')
        expect(JSON.parse(init()!.body!)).toEqual({ marks: [{ lineStart: 4, lineEnd: 5, vulnerabilityType: 'sqli' }, { lineStart: 9, lineEnd: 9 }] })
    })

    it('reads the result', async () => {
        fetchApi.mockResolvedValue({ data: { ...makeResult({ passed: true, firstPass: true, pointsAwarded: 20, newBadges: [{ code: 'b', name: 'Bug hunter', icon: null, rarity: 'common' }] }), extra: 1 } })
        const r = await cr.submitAttempt('s', [{ lineStart: 1, lineEnd: 1 }])
        expect(r).toMatchObject({ passed: true, firstPass: true, pointsAwarded: 20, missedCount: 1, falsePositives: 1 })
        expect(r.newBadges[0].name).toBe('Bug hunter')
        expect(r.matched[0].typeCorrect).toBe(false)
        expect(r.marks[1]).toEqual({ index: 1, result: 'unmatched' })
    })

    it('an unknown verdict of a mark reads as unmatched, a missing type as null', async () => {
        const body = makeResult()
        fetchApi.mockResolvedValue({ data: { ...body, marks: [{ index: 0, result: 'weird' }], matched: [{ ...body.matched[0], typeCorrect: undefined }] } })
        const r = await cr.submitAttempt('s', [{ lineStart: 1, lineEnd: 1 }])
        expect(r.marks[0].result).toBe('unmatched')
        expect(r.matched[0].typeCorrect).toBeNull()
    })

    it('lists my attempts', async () => {
        fetchApi.mockResolvedValue({ data: [{ attemptId: 'a', score: 5, maxScore: 20, percent: 25, passed: false, matchedCount: 1, falsePositives: 0, hintsUsed: 1, marks: [{ lineStart: 1, lineEnd: 2 }], createdAt: '2026-01-01T00:00:00Z' }] })
        const rows = await cr.listAttempts('s')
        expect(url()).toBe('/api/code-review/s/attempts')
        expect(rows[0].marks).toEqual([{ lineStart: 1, lineEnd: 2 }])
    })

    it('opens a hint by its order and reads what it cost', async () => {
        fetchApi.mockResolvedValue({ data: { hint: { order: 2, text: 'Look.', cost: 5 }, alreadyUnlocked: false, recorded: true, hintsUsed: 2, hintCost: 8, pointsAvailable: 17 } })
        const r = await cr.unlockHint('s', 2)
        expect(url()).toBe('/api/code-review/s/hints/2')
        expect(init()?.method).toBe('POST')
        expect(r).toMatchObject({ hint: { order: 2, text: 'Look.' }, pointsAvailable: 17 })
    })

    it('reads the solution, never from a cache', async () => {
        fetchApi.mockResolvedValue({ data: { _id: '1', slug: 's', title: 'T', findings: [{ lineStart: 4, lineEnd: 5, severity: 'high', vulnerabilityType: 'sqli', explanation: 'x', exploit: { payload: 'p' }, fix: null }], explanation: 'o', fixedCode: 'f', exploitedCode: '', fixedExploitedCode: '', exploitExample: null, hints: [], viewer: makeViewer() } })
        const s = await cr.getSolution('s')
        expect(url()).toBe('/api/code-review/s/solution')
        expect(init()?.cache).toBe('no-store')
        expect(s.findings[0].exploit?.payload).toBe('p')
        expect(s.fixedCode).toBe('f')
    })
})

describe('what staff send', () => {
    it('lists the manage view with the published filter', async () => {
        fetchApi.mockResolvedValue({ data: [makeManageCard()], pagination })
        await cr.listManaged({ isPublished: false, search: ' x ', page: 3, limit: 20 })
        const u = new URL(url(), 'http://x')
        expect(u.pathname).toBe('/api/code-review/manage')
        expect(Object.fromEntries(u.searchParams)).toEqual({ isPublished: 'false', search: 'x', page: '3', limit: '20' })
        await cr.listManaged({ isPublished: '' })
        expect(url(1)).toBe('/api/code-review/manage')
    })

    it('creates, edits, publishes, unpublishes and deletes at the right addresses', async () => {
        fetchApi.mockResolvedValue({ data: makeAdminSnippet() })
        await cr.createSnippet({ title: 'T' })
        await cr.updateSnippet('a b', { title: 'U' })
        fetchApi.mockResolvedValue({ data: makeManageCard() })
        await cr.setPublished('s', true)
        await cr.setPublished('s', false)
        fetchApi.mockResolvedValue({ data: { _id: '1', slug: 's' } })
        const gone = await cr.deleteSnippet('s')
        expect(fetchApi.mock.calls.map((c) => `${(c[1] as { method?: string })?.method} ${c[0]}`)).toEqual([
            'POST /api/code-review', 'PUT /api/code-review/a%20b', 'POST /api/code-review/s/publish', 'POST /api/code-review/s/unpublish', 'DELETE /api/code-review/s',
        ])
        expect(gone).toEqual({ _id: '1', slug: 's' })
    })

    it('reads the whole snippet with its key for the editor', async () => {
        fetchApi.mockResolvedValue({ data: { ...makeAdminSnippet(), findings: [{ lineStart: 1, lineEnd: 2, title: null, vulnerabilityType: 'xss', severity: 'low', explanation: 'x', cwe: null, owasp: null }], hints: [{ order: 1, text: 't', cost: 3 }] } })
        const s = await cr.getAdminSnippet('s')
        expect(init()?.cache).toBe('no-store')
        expect(s.findings[0]).toMatchObject({ lineStart: 1, severity: 'low', exploit: null })
        expect(s.hints[0]).toEqual({ order: 1, text: 't', cost: 3 })
        expect(s.isPublished).toBe(true)
    })

    it('sends the payload as given', async () => {
        fetchApi.mockResolvedValue({ data: makeAdminSnippet() })
        await cr.createSnippet({ title: 'T', findings: [{ lineStart: 1, lineEnd: 1, vulnerabilityType: 'xss', severity: 'low', explanation: 'Long enough.' }] })
        expect(JSON.parse(init()!.body!).findings[0].lineEnd).toBe(1)
    })
})
