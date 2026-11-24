import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api'
import { checkFlag, flagReducer, initialFlagState, type FlagState } from '../flagForm'

const NOW = Date.parse('2030-01-01T00:00:00Z')
const idle: FlagState = { phase: 'idle', notice: null }
const submitting: FlagState = { phase: 'submitting' }
const wrong = (over = {}) => ({ correct: false as const, attempts: 2, status: 'started' as const, pointsEarned: 0 as const, attemptsLeft: 3, lockedUntil: null, ...over })

describe('flag form state machine', () => {
    it('starts open, or locked when the lab says it is locked', () => {
        expect(initialFlagState(null)).toEqual(idle)
        expect(initialFlagState(NOW - 1000, NOW)).toEqual(idle)
        expect(initialFlagState(NOW + 60_000, NOW)).toEqual({ phase: 'locked', until: NOW + 60_000 })
    })

    it('sends one flag at a time', () => {
        expect(flagReducer(idle, { type: 'submit' })).toEqual(submitting)
        expect(flagReducer(submitting, { type: 'submit' })).toBe(submitting)
        const locked: FlagState = { phase: 'locked', until: NOW + 1000 }
        expect(flagReducer(locked, { type: 'submit' })).toBe(locked)
        const done: FlagState = { phase: 'completed' }
        expect(flagReducer(done, { type: 'submit' })).toBe(done)
    })

    it('shows the attempts left after a wrong flag and goes back to the open box', () => {
        const next = flagReducer(submitting, { type: 'result', result: wrong(), now: NOW })
        expect(next).toEqual({ phase: 'idle', notice: { kind: 'wrong', attempts: 2, attemptsLeft: 3 } })
    })

    it('locks when the wrong flag was the last one allowed', () => {
        const until = new Date(NOW + 900_000).toISOString()
        const next = flagReducer(submitting, { type: 'result', result: wrong({ attempts: 5, attemptsLeft: 0, lockedUntil: until }), now: NOW })
        expect(next).toEqual({ phase: 'locked', until: NOW + 900_000, attempts: 5 })
    })

    it.each([20 * 60_000, -5 * 60_000])('locks by lockedForSeconds whatever the server instant says (skew %i ms)', (skew) => {
        const result = wrong({ attempts: 5, attemptsLeft: 0, lockedForSeconds: 900, lockedUntil: new Date(NOW + skew + 900_000).toISOString() })
        expect(flagReducer(submitting, { type: 'result', result, now: NOW })).toEqual({ phase: 'locked', until: NOW + 900_000, attempts: 5 })
    })

    it('stays open when the API says not locked, even with a lockedUntil still ahead', () => {
        const result = wrong({ lockedForSeconds: null, lockedUntil: new Date(NOW + 900_000).toISOString() })
        expect(flagReducer(submitting, { type: 'result', result, now: NOW }).phase).toBe('idle')
    })

    it('ignores a lock time that has already passed', () => {
        const next = flagReducer(submitting, { type: 'result', result: wrong({ lockedUntil: new Date(NOW - 5000).toISOString() }), now: NOW })
        expect(next.phase).toBe('idle')
    })

    it('reads a right flag as success with the points and the badges', () => {
        const badge = { code: 'first-lab', name: 'First lab', icon: 'flag', rarity: 'common' }
        const next = flagReducer(submitting, { type: 'result', result: { correct: true, attempts: 3, status: 'completed', pointsEarned: 40, completedAt: 'x', newBadges: [badge] } })
        expect(next).toEqual({ phase: 'success', pointsEarned: 40, badges: [badge], attempts: 3 })
    })

    it('reads a 429 as a lock counted from the API wait, not the clock', () => {
        const err = new ApiError('x', 429, 'LAB_LOCKED', undefined, { retryAfter: 120, lockedUntil: '1999-01-01T00:00:00Z' })
        expect(flagReducer(submitting, { type: 'failed', error: err, now: NOW })).toEqual({ phase: 'locked', until: NOW + 120_000 })
    })

    it('asks to send again on a busy answer, without a verdict', () => {
        const next = flagReducer(submitting, { type: 'failed', error: new ApiError('x', 409, 'LAB_BUSY') })
        expect(next).toMatchObject({ phase: 'idle', notice: { kind: 'busy' } })
    })

    it('ends in the completed state when the lab was already completed', () => {
        expect(flagReducer(submitting, { type: 'failed', error: new ApiError('x', 409, 'LAB_ALREADY_COMPLETED') })).toEqual({ phase: 'completed' })
    })

    it('shows any other failure as a message and stays open', () => {
        expect(flagReducer(submitting, { type: 'failed', error: new ApiError('x', 404, 'LAB_NOT_STARTED') })).toMatchObject({ phase: 'idle', notice: { kind: 'error' } })
        expect(flagReducer(submitting, { type: 'failed', error: new Error('offline') })).toMatchObject({ phase: 'idle', notice: { kind: 'error', message: 'offline' } })
    })

    it('opens again when the wait is over, and only from the locked state', () => {
        expect(flagReducer({ phase: 'locked', until: NOW }, { type: 'unlocked' })).toEqual(idle)
        expect(flagReducer(submitting, { type: 'unlocked' })).toBe(submitting)
    })

    it('does not move on an answer it did not wait for', () => {
        expect(flagReducer(idle, { type: 'result', result: wrong() })).toBe(idle)
        expect(flagReducer(idle, { type: 'failed', error: new Error('x') })).toBe(idle)
    })

    it('takes a lock from the lab while open, but never over a sending flag, and never moves one that is counting down', () => {
        expect(flagReducer(idle, { type: 'lock', until: NOW })).toEqual({ phase: 'locked', until: NOW })
        expect(flagReducer(submitting, { type: 'lock', until: NOW })).toBe(submitting)
        const counting: FlagState = { phase: 'locked', until: NOW + 60_000 }
        expect(flagReducer(counting, { type: 'lock', until: NOW + 3_600_000 })).toBe(counting)
    })
})

describe('checkFlag', () => {
    it('trims what is sent', () => {
        expect(checkFlag('  flag{a b}  ')).toEqual({ ok: true, flag: 'flag{a b}' })
    })

    it('refuses an empty flag and one past 500 characters', () => {
        expect(checkFlag('   ')).toMatchObject({ ok: false })
        expect(checkFlag('x'.repeat(500))).toMatchObject({ ok: true })
        expect(checkFlag('x'.repeat(501))).toMatchObject({ ok: false, message: expect.stringMatching(/500/) })
    })
})
