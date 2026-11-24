import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEADBAND_MS, noteServerTime, resetServerClock, serverNow, serverOffsetMs } from '../serverClock'
import { clockFor, effectiveCtfStatus } from '../status'
import { makeCompetition } from './fixtures'

const REAL = Date.parse('2026-12-05T10:00:00.000Z')
const comp = () => makeCompetition({ status: 'upcoming', startDate: '2026-12-05T10:00:00.000Z', endDate: '2026-12-07T10:00:00.000Z', frozenAt: null })

beforeEach(() => { resetServerClock() })
afterEach(() => { vi.useRealTimers(); resetServerClock() })

describe('server clock offset', () => {
    it('is zero until a stamp shows a real difference, and ignores values that are not dates', () => {
        expect(serverOffsetMs()).toBe(0)
        noteServerTime(null)
        noteServerTime('')
        noteServerTime('not a date')
        expect(serverOffsetMs()).toBe(0)
    })

    it('treats a small difference as none: a stale cached stamp must not move a correct clock', () => {
        noteServerTime(new Date(REAL - 12_000).toISOString(), REAL)
        expect(serverOffsetMs()).toBe(0)
        noteServerTime(new Date(REAL + 5_000).toISOString(), REAL)
        expect(serverOffsetMs()).toBe(0)
    })

    it('learns a browser that runs behind the server', () => {
        // The browser says 09:57, the server says 10:00
        noteServerTime('2026-12-05T10:00:00.000Z', REAL - 3 * 60_000)
        expect(serverOffsetMs()).toBe(3 * 60_000)
    })

    it('learns a browser that runs ahead of the server', () => {
        noteServerTime('2026-12-05T10:00:00.000Z', REAL + 3 * 60_000)
        expect(serverOffsetMs()).toBe(-3 * 60_000)
    })

    it('keeps the largest of the recent samples, because a cached stamp is only ever too old', () => {
        const received = REAL - 3 * 60_000
        noteServerTime('2026-12-05T10:00:00.000Z', received)
        noteServerTime(new Date(REAL - 10_000).toISOString(), received)
        expect(serverOffsetMs()).toBe(3 * 60_000)
    })

    it('forgets the offset on reset', () => {
        noteServerTime('2026-12-05T10:00:00.000Z', REAL - 3 * 60_000)
        resetServerClock()
        expect(serverOffsetMs()).toBe(0)
    })

    it('is a real deadband and not a rounding: just over it counts', () => {
        noteServerTime('2026-12-05T10:00:00.000Z', REAL - DEADBAND_MS - 1)
        expect(serverOffsetMs()).toBe(DEADBAND_MS + 1)
    })
})

describe('status and countdown on the server clock', () => {
    it('a browser two minutes fast still says "upcoming" until the server says live', () => {
        vi.useFakeTimers()
        // The browser reads 10:01, the server 09:59
        vi.setSystemTime(new Date('2026-12-05T10:01:00.000Z'))
        expect(effectiveCtfStatus(comp())).toBe('live') // before the correction: the raw browser clock
        noteServerTime('2026-12-05T09:59:00.000Z', Date.now())
        expect(serverNow().toISOString()).toBe('2026-12-05T09:59:00.000Z')
        expect(effectiveCtfStatus(comp())).toBe('upcoming')
        expect(clockFor(comp())).toEqual({ kind: 'starts', ms: 60_000 })
    })

    it('a browser two minutes slow shows "live" as soon as the server is live', () => {
        vi.useFakeTimers()
        // The browser reads 09:59, the server 10:01
        vi.setSystemTime(new Date('2026-12-05T09:59:00.000Z'))
        expect(effectiveCtfStatus(comp())).toBe('upcoming')
        noteServerTime('2026-12-05T10:01:00.000Z', Date.now())
        expect(effectiveCtfStatus(comp())).toBe('live')
        expect(clockFor(comp()).kind).toBe('ends')
    })

    it('moves the end by the same offset', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-12-07T09:59:00.000Z'))
        noteServerTime('2026-12-07T10:01:00.000Z', Date.now())
        expect(effectiveCtfStatus(makeCompetition({ status: 'live', startDate: '2026-12-05T10:00:00.000Z', endDate: '2026-12-07T10:00:00.000Z', frozenAt: null }))).toBe('ended')
    })

    it('an explicit moment is never shifted', () => {
        noteServerTime('2026-12-05T10:00:00.000Z', REAL - 3 * 60_000)
        expect(effectiveCtfStatus(comp(), new Date('2026-12-05T09:59:59.000Z'))).toBe('upcoming')
    })
})
