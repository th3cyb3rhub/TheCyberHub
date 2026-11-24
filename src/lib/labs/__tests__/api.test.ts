import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
    return { ...actual, fetchApi }
})

import { getLab, getLabProgress, listMyProgress, submitFlag } from '@/lib/api/labs'
import { makeLab, makeViewer } from './fixtures'

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0)
const reply = (body: unknown, date?: string) => ({ headers: { get: (name: string) => (name.toLowerCase() === 'date' ? (date ?? null) : null) }, json: async () => body })

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); fetchApi.mockReset() })
afterEach(() => vi.useRealTimers())

describe('the labs client stamps every lock with the moment the answer arrived', () => {
    it('getLab: a lock counts from now whatever the server instant says (server clock +20 minutes)', async () => {
        const viewer = makeViewer({ myStatus: 'in-progress', lockedForSeconds: 600, lockedUntil: new Date(NOW + 20 * 60_000 + 600_000).toISOString() })
        fetchApi.mockResolvedValue(reply({ data: makeLab({ viewer }) }))
        const lab = await getLab('sql-injection-basics')
        expect(lab.viewer?.lockEndsAt).toBe(NOW + 600_000)
        expect(fetchApi).toHaveBeenCalledWith(expect.stringContaining('/sql-injection-basics'), expect.objectContaining({ raw: true }))
    })

    it('getLab: without lockedForSeconds it uses the Date header (server clock -5 minutes)', async () => {
        const serverNow = NOW - 5 * 60_000
        const viewer = makeViewer({ myStatus: 'in-progress', lockedUntil: new Date(serverNow + 420_000).toISOString() })
        fetchApi.mockResolvedValue(reply({ data: makeLab({ viewer }) }, new Date(serverNow).toUTCString()))
        const lab = await getLab('sql-injection-basics')
        expect(lab.viewer?.lockEndsAt).toBe(NOW + 420_000)
    })

    it('getLab: a visitor has no viewer and nothing to stamp', async () => {
        fetchApi.mockResolvedValue(reply({ data: makeLab({ viewer: null }) }))
        expect((await getLab('x')).viewer).toBeNull()
    })

    it('getLab: not locked stays not locked', async () => {
        fetchApi.mockResolvedValue(reply({ data: makeLab({ viewer: makeViewer({ lockedForSeconds: null }) }) }))
        expect((await getLab('x')).viewer?.lockEndsAt).toBeNull()
    })

    it('submitFlag: a wrong flag that locks counts from its arrival; a right one is untouched', async () => {
        fetchApi.mockResolvedValueOnce(reply({ data: { correct: false, attempts: 5, status: 'started', pointsEarned: 0, attemptsLeft: 0, lockedUntil: new Date(NOW + 20 * 60_000).toISOString(), lockedForSeconds: 900 } }))
        const wrong = await submitFlag('x', 'flag{a}')
        expect(wrong.correct === false && wrong.lockEndsAt).toBe(NOW + 900_000)
        fetchApi.mockResolvedValueOnce(reply({ data: { correct: true, attempts: 1, status: 'completed', pointsEarned: 50, completedAt: 'x', newBadges: [] } }))
        const right = await submitFlag('x', 'flag{b}')
        expect(right).toMatchObject({ correct: true, pointsEarned: 50 })
        expect(JSON.parse(fetchApi.mock.calls[0][1].body)).toEqual({ flag: 'flag{a}' })
    })

    it('progress rows are stamped too, and a lab not started is null', async () => {
        fetchApi.mockResolvedValueOnce(reply({ data: { _id: 'p', lab: 'l', status: 'started', lockedForSeconds: 120, lockedUntil: null } }))
        expect((await getLabProgress('x'))?.lockEndsAt).toBe(NOW + 120_000)
        fetchApi.mockResolvedValueOnce(reply({ success: true, data: [{ _id: 'p', lockedForSeconds: 30 }, { _id: 'q', lockedForSeconds: null }], pagination: {} }))
        const page = await listMyProgress()
        expect(page.data.map((r) => r.lockEndsAt)).toEqual([NOW + 30_000, null])
        const { ApiError } = await import('@/lib/api')
        fetchApi.mockRejectedValueOnce(new ApiError('nope', 404, 'LAB_NOT_STARTED'))
        expect(await getLabProgress('x')).toBeNull()
    })
})
