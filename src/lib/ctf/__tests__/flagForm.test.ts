import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { attemptsText, checkFlag, flagReducer, initialFlagState, type FlagState } from '../flagForm'

const submitting: FlagState = { phase: 'submitting' }
const wrong = { correct: false as const, message: 'Incorrect flag', attemptsRecent: 3, attemptLimit: 10, windowSeconds: 60 }
const right = { correct: true as const, message: 'Correct flag!', pointsEarned: 90, firstBlood: true, scope: 'team' as const, teamId: 't1', accountPointsAwarded: true, newBadges: [{ name: 'First blood' }] }
const fail = (status: number, code: string, meta?: Record<string, unknown>) => new ApiError('server', status, code, undefined, meta)

describe('flag form state machine', () => {
    it('starts open, sends one flag at a time and ignores a second send', () => {
        expect(initialFlagState()).toEqual({ phase: 'idle', notice: null })
        expect(flagReducer(initialFlagState(), { type: 'submit' })).toEqual({ phase: 'submitting' })
        expect(flagReducer(submitting, { type: 'submit' })).toBe(submitting)
    })

    it('keeps an empty flag from being sent and says why', () => {
        expect(checkFlag('   ')).toEqual({ ok: false, message: 'Enter the flag before you send it' })
        expect(checkFlag('  flag{a}  ')).toEqual({ ok: true, flag: 'flag{a}' })
        expect(checkFlag('x'.repeat(501)).ok).toBe(false)
        expect(flagReducer(initialFlagState(), { type: 'invalid', message: 'Enter the flag' })).toEqual({ phase: 'idle', notice: { kind: 'invalid', message: 'Enter the flag' } })
    })

    it('reads a wrong flag as an answer: the attempt counter, and the box opens again', () => {
        const next = flagReducer(submitting, { type: 'result', result: wrong })
        expect(next).toEqual({ phase: 'idle', notice: { kind: 'wrong', attemptsRecent: 3, attemptLimit: 10, attemptsLeft: 7, windowSeconds: 60 } })
        if (next.phase === 'idle' && next.notice?.kind === 'wrong') expect(attemptsText(next.notice)).toBe('3 of 10 tries used in the last minute')
        const last = flagReducer(submitting, { type: 'result', result: { ...wrong, attemptsRecent: 12 } })
        expect(last.phase === 'idle' && last.notice?.kind === 'wrong' && last.notice.attemptsLeft).toBe(0)
    })

    it('reads a right flag with its points, first blood, scope and badges', () => {
        expect(flagReducer(submitting, { type: 'result', result: right })).toEqual({ phase: 'success', result: right })
    })

    it('waits after a 429, counted from when the answer arrived', () => {
        const next = flagReducer(submitting, { type: 'failed', error: fail(429, 'RATE_LIMIT_EXCEEDED', { retryAfter: 45 }), now: 1000 })
        expect(next).toEqual({ phase: 'waiting', until: 1000 + 45_000 })
        // No wait given: the window of a minute
        expect(flagReducer(submitting, { type: 'failed', error: fail(429, 'RATE_LIMIT_EXCEEDED'), now: 0 })).toEqual({ phase: 'waiting', until: 60_000 })
        // The box opens again when the wait ends
        expect(flagReducer({ phase: 'waiting', until: 5 }, { type: 'unlocked' })).toEqual({ phase: 'idle', notice: null })
        // Nothing can be sent while waiting
        expect(flagReducer({ phase: 'waiting', until: 5 }, { type: 'submit' })).toEqual({ phase: 'waiting', until: 5 })
    })

    it('moves to solved when the challenge was already solved', () => {
        expect(flagReducer(submitting, { type: 'failed', error: fail(409, 'CTF_ALREADY_SOLVED') })).toEqual({ phase: 'solved' })
    })

    it.each([
        ['CTF_TEAM_REQUIRED', 409, 'team-required'],
        ['CTF_TEAM_TOO_SMALL', 409, 'team-too-small'],
        ['CTF_ENDED', 403, 'ended'],
        ['CTF_CANCELLED', 403, 'cancelled'],
        ['CTF_NOT_STARTED', 403, 'not-started'],
    ])('blocks the form on %s', (code, status, reason) => {
        const next = flagReducer(submitting, { type: 'failed', error: fail(status, code, { minTeamSize: 3, members: 1 }) })
        expect(next.phase).toBe('blocked')
        expect(next.phase === 'blocked' && next.reason).toBe(reason)
        expect(next.phase === 'blocked' && next.message.length).toBeGreaterThan(10)
    })

    it('shows any other failure in the notice and keeps the box open', () => {
        const next = flagReducer(submitting, { type: 'failed', error: new Error('network down') })
        expect(next).toEqual({ phase: 'idle', notice: { kind: 'error', message: 'network down' } })
    })

    it('does not move on an answer it was not waiting for', () => {
        const idle = initialFlagState()
        expect(flagReducer(idle, { type: 'result', result: right })).toBe(idle)
        expect(flagReducer(idle, { type: 'failed', error: fail(429, 'RATE_LIMIT_EXCEEDED') })).toBe(idle)
    })

    it('opens the box again on a recheck after "not started", and only then', () => {
        const submitting = flagReducer(initialFlagState(), { type: 'submit' })
        const notStarted = flagReducer(submitting, { type: 'failed', error: new ApiError('x', 403, 'CTF_NOT_STARTED') })
        expect(notStarted.phase).toBe('blocked')
        expect(flagReducer(notStarted, { type: 'recheck' })).toEqual({ phase: 'idle', notice: null })
        const ended = flagReducer(flagReducer(initialFlagState(), { type: 'submit' }), { type: 'failed', error: new ApiError('x', 403, 'CTF_ENDED') })
        expect(flagReducer(ended, { type: 'recheck' })).toBe(ended)
        const idle = initialFlagState()
        expect(flagReducer(idle, { type: 'recheck' })).toBe(idle)
    })
})
