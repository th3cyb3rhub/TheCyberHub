import { describe, expect, it } from 'vitest'
import { clockFor, countdownWords, effectiveCtfStatus, formatCountdown, isPlayable } from '../status'
import { makeCompetition } from './fixtures'

const at = (iso: string) => new Date(iso)
const comp = (over = {}) => makeCompetition({ startDate: '2026-12-05T10:00:00.000Z', endDate: '2026-12-07T10:00:00.000Z', frozenAt: '2026-12-07T08:00:00.000Z', ...over })

describe('effectiveCtfStatus', () => {
    it('follows the dates, with the end exclusive', () => {
        const c = comp({ status: 'upcoming' })
        expect(effectiveCtfStatus(c, at('2026-12-05T09:59:59.999Z'))).toBe('upcoming')
        expect(effectiveCtfStatus(c, at('2026-12-05T10:00:00.000Z'))).toBe('live')
        expect(effectiveCtfStatus(c, at('2026-12-07T07:59:59.000Z'))).toBe('live')
        expect(effectiveCtfStatus(c, at('2026-12-07T08:00:00.000Z'))).toBe('frozen')
        expect(effectiveCtfStatus(c, at('2026-12-07T09:59:59.999Z'))).toBe('frozen')
        expect(effectiveCtfStatus(c, at('2026-12-07T10:00:00.000Z'))).toBe('ended')
    })

    it('treats a cached "upcoming" as live once the clock passed the start, and a cached "live" as ended after the end', () => {
        expect(effectiveCtfStatus(comp({ status: 'upcoming' }), at('2026-12-06T00:00:00.000Z'))).toBe('live')
        expect(effectiveCtfStatus(comp({ status: 'live' }), at('2026-12-08T00:00:00.000Z'))).toBe('ended')
    })

    it('never moves a decision with the clock: draft and cancelled stay', () => {
        expect(effectiveCtfStatus(comp({ status: 'cancelled' }), at('2026-12-06T00:00:00.000Z'))).toBe('cancelled')
        expect(effectiveCtfStatus(comp({ status: 'draft' }), at('2026-12-06T00:00:00.000Z'))).toBe('draft')
    })

    it('has no freeze without frozenAt', () => {
        expect(effectiveCtfStatus(comp({ frozenAt: null }), at('2026-12-07T09:00:00.000Z'))).toBe('live')
    })

    it('knows when flags are accepted', () => {
        expect(['live', 'frozen'].every((s) => isPlayable(s as never))).toBe(true)
        expect(['draft', 'upcoming', 'ended', 'cancelled'].some((s) => isPlayable(s as never))).toBe(false)
    })
})

describe('clockFor', () => {
    it('counts to the start while upcoming and to the end while it runs', () => {
        const c = comp({ status: 'upcoming' })
        expect(clockFor(c, at('2026-12-05T09:00:00.000Z'))).toEqual({ kind: 'starts', ms: 3600_000 })
        expect(clockFor(c, at('2026-12-06T10:00:00.000Z'))).toEqual({ kind: 'ends', ms: 24 * 3600_000 })
        expect(clockFor(c, at('2026-12-08T10:00:00.000Z'))).toEqual({ kind: 'ended', ms: 0 })
        expect(clockFor(comp({ status: 'cancelled' }), at('2026-12-06T10:00:00.000Z')).kind).toBe('cancelled')
    })
})

describe('formatCountdown', () => {
    it('shows days and a clock, and never goes below zero', () => {
        expect(formatCountdown(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toBe('2d 03:04:05')
        expect(formatCountdown(59_000)).toBe('00:00:59')
        expect(formatCountdown(-5)).toBe('00:00:00')
    })

    it('says it in words for a screen reader', () => {
        expect(countdownWords((26 * 3600) * 1000)).toBe('1 day 2 hours')
        expect(countdownWords(90 * 60 * 1000)).toBe('1 hour 30 minutes')
        expect(countdownWords(500)).toBe('a moment')
    })
})
