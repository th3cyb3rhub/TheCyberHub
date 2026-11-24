import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { challengesWithSolves, ctfErrorMessage, fieldErrors, isStaleState, lockedFields } from '../errors'

const err = (status: number, code: string, message = 'server words', meta?: Record<string, unknown>, details?: { field?: string; message: string }[]) =>
    new ApiError(message, status, code, details, meta)

describe('ctfErrorMessage', () => {
    it.each([
        ['CTF_NOT_STARTED', 'has not started'],
        ['CTF_ENDED', 'has ended'],
        ['CTF_CANCELLED', 'was cancelled'],
        ['CTF_ALREADY_SOLVED', 'already solved'],
        ['CTF_TEAM_REQUIRED', 'Create a team'],
        ['CTF_FULL', 'full'],
        ['CTF_REGISTRATION_CLOSED', 'closed'],
        ['CTF_CAPTAIN_CANNOT_LEAVE', 'captain'],
        ['CTF_INVITE_INVALID', 'invite code'],
        ['CTF_TEAM_NAME_TAKEN', 'name'],
        ['CTF_TEAM_FULL', 'full'],
        ['CTF_MEMBER_HAS_SOLVES', 'solved'],
        ['CTF_TEAM_HAS_SOLVES', 'roster is fixed'],
        ['CTF_CHALLENGE_INVALID', 'archived'],
        ['CTF_SLUG_TAKEN', 'slug'],
        ['CTF_CHALLENGE_HAS_SOLVES', 'solves'],
    ])('maps %s to words a person can read', (code, part) => {
        const text = ctfErrorMessage(err(409, code))
        expect(text.toLowerCase()).toContain(part.toLowerCase())
        expect(text).not.toBe('server words')
    })

    it('says how many members a team has and how many it needs', () => {
        const text = ctfErrorMessage(err(409, 'CTF_TEAM_TOO_SMALL', 'x', { minTeamSize: 3, members: 1 }))
        expect(text).toContain('1 member')
        expect(text).toContain('at least 3')
    })

    it('turns a 429 into a wait', () => {
        const text = ctfErrorMessage(err(429, 'RATE_LIMIT_EXCEEDED', 'x', { retryAfter: 60 }))
        expect(text).toContain('1 minute')
        expect(ctfErrorMessage(err(429, 'RATE_LIMIT_EXCEEDED'))).toContain('Wait a moment')
    })

    it('names the locked fields', () => {
        const e = err(409, 'CTF_LOCKED', 'x', { fields: ['teamsEnabled', 'scoringMode'] })
        expect(lockedFields(e)).toEqual(['teamsEnabled', 'scoringMode'])
        expect(ctfErrorMessage(e)).toContain('team play and the scoring mode')
    })

    it('falls back to the server message, then to a plain line', () => {
        expect(ctfErrorMessage(err(500, 'SOMETHING_NEW', 'The server said so'))).toBe('The server said so')
        expect(ctfErrorMessage(new Error('boom'))).toBe('boom')
        expect(ctfErrorMessage(null)).toBe('Something went wrong. Please try again.')
        expect(ctfErrorMessage(err(401, 'X', ''))).toBe('Sign in to do that.')
    })
})

describe('error helpers', () => {
    it('reads the challenges that have solves', () => {
        expect(challengesWithSolves(err(409, 'CTF_CHALLENGE_HAS_SOLVES', 'x', { challenges: ['a', 'b'] }))).toEqual(['a', 'b'])
        expect(challengesWithSolves(err(409, 'OTHER', 'x', { challenges: ['a'] }))).toEqual([])
    })

    it('reads field errors of a 400', () => {
        const e = err(400, 'VALIDATION_ERROR', 'x', undefined, [{ field: 'endDate', message: 'End date must be after start date' }, { message: 'loose' }])
        expect(fieldErrors(e)).toEqual({ endDate: 'End date must be after start date' })
    })

    it('knows which answers mean the screen is out of date', () => {
        expect(isStaleState(err(409, 'CTF_ALREADY_SOLVED'))).toBe(true)
        expect(isStaleState(err(404, 'CTF_INVITE_INVALID'))).toBe(false)
        expect(isStaleState(new Error('x'))).toBe(false)
    })
})
