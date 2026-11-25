import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import {
    crErrorMessage, fieldErrors, isDailyLimit, isRateLimited, isStaleState, keyChangeInfo, nextHintOrder, retryAfterSeconds, tooBroadLimits, unattachedDetails, waitText,
} from '../errors'

const err = (status: number, code?: string, message = 'server says', details?: { field?: string; message: string }[], meta?: Record<string, unknown>) =>
    new ApiError(message, status, code, details, meta)

describe('code review error messages', () => {
    it.each([
        ['CR_NOT_FOUND', 404, /could not be found/],
        ['CR_HINT_NOT_FOUND', 404, /hint does not exist/],
        ['CR_SOLUTION_LOCKED', 403, /first graded attempt/],
        ['CR_SLUG_TAKEN', 409, /already uses this slug/],
        ['CR_NOT_READY', 409, /at least one finding/],
        ['CR_NOT_GRADABLE', 409, /no findings to grade/],
        ['CR_HAS_PROGRESS', 409, /Unpublish it instead/],
    ])('says what %s means', (code, status, text) => {
        expect(crErrorMessage(err(status, code))).toMatch(text)
    })

    it('the hint order error names the hint to open first', () => {
        expect(crErrorMessage(err(409, 'CR_HINT_OUT_OF_ORDER', 'x', undefined, { next: 2 }))).toBe('Hints open in order. Open hint 2 first.')
        expect(crErrorMessage(err(409, 'CR_HINT_OUT_OF_ORDER'))).toMatch(/in order/)
        expect(nextHintOrder(err(409, 'CR_HINT_OUT_OF_ORDER', 'x', undefined, { next: 3 }))).toBe(3)
        expect(nextHintOrder(err(409, 'CR_HINT_OUT_OF_ORDER', 'x', undefined, { next: 'x' }))).toBeNull()
        expect(nextHintOrder(err(409, 'OTHER', 'x', undefined, { next: 3 }))).toBeNull()
    })

    it('the daily limit says how long to wait and how many attempts there are', () => {
        const e = err(429, 'CR_ATTEMPT_LIMIT', 'x', undefined, { retryAfter: 5400, limit: 30 })
        expect(crErrorMessage(e)).toContain('all 30 graded attempts')
        expect(crErrorMessage(e)).toContain('2 hours')
        expect(isDailyLimit(e)).toBe(true)
        expect(crErrorMessage(err(429, 'CR_ATTEMPT_LIMIT'))).toMatch(/Try again later/)
    })

    it('a per-minute limit gives the wait from the 429', () => {
        const e = err(429, 'RATE_LIMIT_EXCEEDED', 'x', undefined, { retryAfter: 42 })
        expect(crErrorMessage(e)).toBe('Too many requests. Try again in about 42 seconds.')
        expect(isRateLimited(e)).toBe(true)
        expect(isDailyLimit(e)).toBe(false)
        expect(retryAfterSeconds(e)).toBe(42)
        expect(crErrorMessage(err(429))).toMatch(/Wait a moment/)
        expect(retryAfterSeconds(err(429))).toBeNull()
        expect(retryAfterSeconds(new Error('x'))).toBeNull()
    })

    it('says too many marks or lines were sent, with the limits the API names', () => {
        const e = err(400, 'CR_TOO_BROAD', 'x', undefined, { maxMarks: 4, maxLines: 6 })
        expect(crErrorMessage(e)).toBe('Too many marks or too many lines marked. An answer can hold at most 4 marks covering at most 6 lines. Narrow your marks and send them again.')
        expect(tooBroadLimits(e)).toEqual({ maxMarks: 4, maxLines: 6 })
        expect(crErrorMessage(err(400, 'CR_TOO_BROAD'))).toMatch(/Narrow your marks/)
        expect(tooBroadLimits(err(400, 'CR_TOO_BROAD', 'x', undefined, { maxMarks: 'x' }))).toBeNull()
        expect(tooBroadLimits(err(400, 'OTHER', 'x', undefined, { maxMarks: 4, maxLines: 6 }))).toBeNull()
    })

    it('reads the numbers of an unconfirmed key change, and says what it is', () => {
        const meta = { solveCount: 3, oldFindingCount: 2, newFindingCount: 1, oldHintCount: 3, newHintCount: 0 }
        expect(keyChangeInfo(err(409, 'CR_KEY_CHANGE_UNCONFIRMED', 'x', undefined, meta))).toEqual(meta)
        expect(keyChangeInfo(err(409, 'CR_KEY_CHANGE_UNCONFIRMED'))).toEqual({ solveCount: 0, oldFindingCount: 0, newFindingCount: 0, oldHintCount: 0, newHintCount: 0 })
        expect(keyChangeInfo(err(409, 'CR_HAS_PROGRESS', 'x', undefined, meta))).toBeNull()
        expect(crErrorMessage(err(409, 'CR_KEY_CHANGE_UNCONFIRMED'))).toMatch(/solved/i)
    })

    it('has a message for sign-in, permission and an unknown 404', () => {
        expect(crErrorMessage(err(401))).toBe('Sign in to do that.')
        expect(crErrorMessage(err(403, 'FORBIDDEN'))).toBe('You are not allowed to do that.')
        expect(crErrorMessage(err(404))).toMatch(/could not be found/)
    })

    it('joins the details of a validation error, and falls back to the server text', () => {
        expect(crErrorMessage(err(400, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'a', message: 'One.' }, { message: 'Two.' }]))).toBe('One. Two.')
        expect(crErrorMessage(err(500, 'WHATEVER', 'Boom'))).toBe('Boom')
        expect(crErrorMessage(new Error('network down'))).toBe('network down')
        expect(crErrorMessage('x', 'fallback')).toBe('fallback')
    })

    it('the shape error is not shown as a stack trace', () => {
        expect(crErrorMessage(err(502, 'BAD_RESPONSE'))).toMatch(/does not understand/)
    })
})

describe('waiting', () => {
    it('writes a wait in the unit that fits', () => {
        expect(waitText(1)).toBe('1 second')
        expect(waitText(45)).toBe('45 seconds')
        expect(waitText(61)).toBe('2 minutes')
        expect(waitText(3599)).toBe('60 minutes')
        expect(waitText(3600)).toBe('1 hour')
        expect(waitText(3601)).toBe('2 hours')
        expect(waitText(0)).toBe('1 second')
    })
})

describe('what stale state is', () => {
    it('is an error that means the page shows an old state', () => {
        expect(isStaleState(err(409, 'CR_HINT_OUT_OF_ORDER'))).toBe(true)
        expect(isStaleState(err(404, 'CR_NOT_FOUND'))).toBe(true)
        expect(isStaleState(err(429, 'CR_ATTEMPT_LIMIT'))).toBe(false)
        expect(isStaleState(new Error('x'))).toBe(false)
    })
})

describe('field details', () => {
    it('keys the first message of each field and lists the ones without a field', () => {
        const e = err(400, 'VALIDATION_ERROR', 'Validation failed', [
            { field: 'findings.0.lineEnd', message: 'past the end' }, { field: 'findings.0.lineEnd', message: 'second' }, { message: 'general' },
        ])
        expect(fieldErrors(e)).toEqual({ 'findings.0.lineEnd': 'past the end' })
        expect(unattachedDetails(e)).toEqual(['general'])
        expect(fieldErrors(new Error('x'))).toEqual({})
    })
})
