import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { resetServerClock, serverOffsetMs } from '@/lib/ctf/serverClock'
import { flagReducer, initialFlagState } from '@/lib/ctf/flagForm'
import { getChallenges, getLeaderboard, getResults, submitFlag } from '../ctf'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const fetchMock = vi.fn()

beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    resetServerClock()
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); resetServerClock() })

describe('server time from the API', () => {
    it('learns the offset from the board stamp', async () => {
        const ahead = new Date(Date.now() + 5 * 60_000).toISOString()
        fetchMock.mockResolvedValueOnce(json(200, { success: true, data: [], mode: 'solo', frozen: false, updatedAt: ahead }))
        await getLeaderboard('winter-ctf')
        expect(serverOffsetMs()).toBeGreaterThan(4.9 * 60_000)
    })

    it('learns the offset from the results stamp', async () => {
        const behind = new Date(Date.now() - 5 * 60_000).toISOString()
        fetchMock.mockResolvedValueOnce(json(200, { success: true, data: { generatedAt: behind } }))
        await getResults('winter-ctf')
        expect(serverOffsetMs()).toBeLessThan(-4.9 * 60_000)
    })

    it('learns the offset from the timestamp of a refusal, and still throws it', async () => {
        const ahead = new Date(Date.now() + 2 * 60_000).toISOString()
        fetchMock.mockResolvedValueOnce(json(403, { success: false, error: { code: 'CTF_NOT_STARTED', message: 'not yet' }, timestamp: ahead }))
        const err = await getChallenges('winter-ctf').catch((e: unknown) => e)
        expect(err).toBeInstanceOf(ApiError)
        expect((err as ApiError).code).toBe('CTF_NOT_STARTED')
        expect((err as ApiError).serverTime).toBe(ahead)
        expect(serverOffsetMs()).toBeGreaterThan(1.9 * 60_000)
    })

    it('ignores a body without a stamp', async () => {
        fetchMock.mockResolvedValueOnce(json(200, { success: true, data: [], mode: 'solo', frozen: false }))
        await getLeaderboard('winter-ctf')
        expect(serverOffsetMs()).toBe(0)
    })
})

describe('a real 429 body through fetchApi into the flag form', () => {
    // The shape the API's limiter sends: the wait is `error.retryAfter`, in seconds
    const body = { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many flag attempts', retryAfter: 42 }, timestamp: new Date().toISOString() }

    it('becomes a wait of the length the API gave, counted from when the answer arrived', async () => {
        fetchMock.mockResolvedValueOnce(json(429, body))
        const err = await submitFlag('winter-ctf', 'ch1', 'flag{x}').catch((e: unknown) => e)
        expect(err).toBeInstanceOf(ApiError)
        expect((err as ApiError).status).toBe(429)
        expect((err as ApiError).meta?.retryAfter).toBe(42)
        const submitting = flagReducer(initialFlagState(), { type: 'submit' })
        const next = flagReducer(submitting, { type: 'failed', error: err, now: 1_000_000 })
        expect(next).toEqual({ phase: 'waiting', until: 1_000_000 + 42_000 })
    })

    it('falls back to the one minute window when the body has no wait', async () => {
        fetchMock.mockResolvedValueOnce(json(429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Slow down' } }))
        const err = await submitFlag('winter-ctf', 'ch1', 'flag{x}').catch((e: unknown) => e)
        const next = flagReducer(flagReducer(initialFlagState(), { type: 'submit' }), { type: 'failed', error: err, now: 0 })
        expect(next).toEqual({ phase: 'waiting', until: 60_000 })
    })
})
