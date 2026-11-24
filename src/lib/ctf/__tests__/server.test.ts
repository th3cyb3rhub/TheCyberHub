// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCompetitionsPage, fetchedAtOf, fetchPublicCompetition, fetchPublicResults, isCtfSlug } from '../server'
import { makeCompetition, makeResults } from './fixtures'

const fetchMock = vi.fn()
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const DATE = 'Mon, 07 Dec 2026 09:00:00 GMT'

beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('isCtfSlug', () => {
    it('accepts what the API accepts and nothing else', () => {
        expect(isCtfSlug('winter-ctf-2026')).toBe(true)
        expect(isCtfSlug('Winter-CTF')).toBe(true)
        expect(isCtfSlug('')).toBe(false)
        expect(isCtfSlug('a'.repeat(81))).toBe(false)
        expect(isCtfSlug('../etc/passwd')).toBe(false)
        expect(isCtfSlug('a b')).toBe(false)
    })
})

describe('fetchPublicCompetition fails soft', () => {
    it('never asks the API for a segment that cannot be a slug', async () => {
        expect(await fetchPublicCompetition('../x')).toEqual({ state: 'invalid' })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('gives the competition and when the API produced it', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: makeCompetition({ slug: 'ok-one' }) }, { Date: DATE }))
        const result = await fetchPublicCompetition('ok-one')
        expect(result.state).toBe('ok')
        if (result.state === 'ok') {
            expect(result.competition.slug).toBe('ok-one')
            expect(result.fetchedAt).toBe(Date.parse(DATE))
        }
    })

    it('has no age when the API sent no Date header, so the browser asks again', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: makeCompetition({ slug: 'no-date' }) }), { status: 200 }))
        const result = await fetchPublicCompetition('no-date')
        expect(result.state === 'ok' && result.fetchedAt).toBe(0)
    })

    it.each([404, 400])('says "missing" for HTTP %i', async (status) => {
        fetchMock.mockResolvedValueOnce(reply(status, { success: false }))
        expect(await fetchPublicCompetition(`gone-${status}`)).toEqual({ state: 'missing' })
    })

    it('says "error" for a 500', async () => {
        fetchMock.mockResolvedValueOnce(reply(500, { success: false }))
        expect(await fetchPublicCompetition('server-down')).toEqual({ state: 'error' })
    })

    it('says "error" for a body that does not fit the schema', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: { slug: 'bad-shape', title: 42 } }))
        expect(await fetchPublicCompetition('bad-shape')).toEqual({ state: 'error' })
        fetchMock.mockResolvedValueOnce(reply(200, { success: true }))
        expect(await fetchPublicCompetition('no-data')).toEqual({ state: 'error' })
    })

    it('says "error" when the body is not JSON', async () => {
        fetchMock.mockResolvedValueOnce(new Response('<html>oops</html>', { status: 200 }))
        expect(await fetchPublicCompetition('not-json')).toEqual({ state: 'error' })
    })

    it('says "error", and does not throw, when the request times out or the network fails', async () => {
        fetchMock.mockRejectedValueOnce(new DOMException('The operation timed out', 'TimeoutError'))
        expect(await fetchPublicCompetition('slow-one')).toEqual({ state: 'error' })
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
        expect(await fetchPublicCompetition('offline-one')).toEqual({ state: 'error' })
    })

    it('asks with a timeout signal and no token', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: makeCompetition({ slug: 'check-call' }) }))
        await fetchPublicCompetition('check-call')
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toContain('/api/ctf-competitions/check-call')
        expect(init.signal).toBeInstanceOf(AbortSignal)
        expect(init.headers).toBeUndefined()
    })
})

describe('fetchPublicResults fails soft', () => {
    it('gives the results with their age', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: makeResults() }, { Date: DATE }))
        const result = await fetchPublicResults('res-ok')
        expect(result.state).toBe('ok')
        expect(result.state === 'ok' && result.fetchedAt).toBe(Date.parse(DATE))
    })

    it('says "not-ready" for 409, "missing" for 404 and "error" for a 500, a bad body or a timeout', async () => {
        fetchMock.mockResolvedValueOnce(reply(409, { success: false }))
        expect(await fetchPublicResults('res-409')).toEqual({ state: 'not-ready' })
        fetchMock.mockResolvedValueOnce(reply(404, { success: false }))
        expect(await fetchPublicResults('res-404')).toEqual({ state: 'missing' })
        fetchMock.mockResolvedValueOnce(reply(500, { success: false }))
        expect(await fetchPublicResults('res-500')).toEqual({ state: 'error' })
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: { competition: {} } }))
        expect(await fetchPublicResults('res-bad')).toEqual({ state: 'error' })
        fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
        expect(await fetchPublicResults('res-timeout')).toEqual({ state: 'error' })
    })

    it('does not ask for an invalid slug', async () => {
        expect(await fetchPublicResults('a/b')).toEqual({ state: 'invalid' })
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('fetchCompetitionsPage fails soft', () => {
    const pagination = { page: 1, limit: 12, total: 1, pages: 1 }

    it('gives the page, leaving out cards that do not parse', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: [makeCompetition({ slug: 'list-a' }), { slug: 'broken', title: 7 }], pagination }, { Date: DATE }))
        const page = await fetchCompetitionsPage('all', 1, 12)
        expect(page?.data.map((c) => c.slug)).toEqual(['list-a'])
        expect(page?.fetchedAt).toBe(Date.parse(DATE))
    })

    it('maps a tab to the API status word', async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: [], pagination }))
        await fetchCompetitionsPage('live', 1, 12)
        expect(String(fetchMock.mock.calls[0][0])).toContain('status=ongoing')
    })

    it('gives null for a 500, a missing pagination, a body that is not a list, or a timeout', async () => {
        fetchMock.mockResolvedValueOnce(reply(500, {}))
        expect(await fetchCompetitionsPage('upcoming', 1, 12)).toBeNull()
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: [] }))
        expect(await fetchCompetitionsPage('ended', 1, 12)).toBeNull()
        fetchMock.mockResolvedValueOnce(reply(200, { success: true, data: 'nope', pagination }))
        expect(await fetchCompetitionsPage('all', 2, 12)).toBeNull()
        fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
        expect(await fetchCompetitionsPage('all', 3, 12)).toBeNull()
    })
})

describe('fetchedAtOf', () => {
    it('reads the Date header and is 0 without a usable one', () => {
        expect(fetchedAtOf(new Response('', { headers: { Date: DATE } }))).toBe(Date.parse(DATE))
        expect(fetchedAtOf(new Response('', { headers: { Date: 'garbage' } }))).toBe(0)
        expect(fetchedAtOf(new Response(''))).toBe(0)
    })
})
