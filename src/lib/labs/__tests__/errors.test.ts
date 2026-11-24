import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api'
import { fieldErrors, isLockedError, labErrorMessage, lockedUntilFromError, retryAfterSeconds, unattachedDetails, waitText } from '../errors'

const locked = (meta?: Record<string, unknown>) => new ApiError('locked', 429, 'LAB_LOCKED', undefined, meta)

describe('lab error messages', () => {
    it('explains the lock with the wait when the API names one', () => {
        expect(labErrorMessage(locked({ retryAfter: 840 }))).toBe('Too many wrong flags for this lab. You can try again in about 14 minutes.')
        expect(labErrorMessage(locked())).toMatch(/Wait a few minutes/)
    })

    it('asks to retry on a busy answer and to wait on a generic 429', () => {
        expect(labErrorMessage(new ApiError('x', 409, 'LAB_BUSY'))).toMatch(/send it again/)
        expect(labErrorMessage(new ApiError('x', 429))).toBe('Too many requests. Wait a moment and try again.')
        expect(labErrorMessage(new ApiError('x', 429, undefined, undefined, { retryAfter: 30 }))).toBe('Too many requests. Try again in about 30 seconds.')
    })

    it('maps the authoring codes and falls back to the server message', () => {
        expect(labErrorMessage(new ApiError('x', 409, 'LAB_NOT_READY'))).toMatch(/flag before you publish/)
        expect(labErrorMessage(new ApiError('x', 409, 'LAB_HAS_COMPLETIONS'))).toMatch(/Archive/)
        expect(labErrorMessage(new ApiError('x', 409, 'LAB_HINTS_LOCKED'))).toMatch(/opened hints.*cannot remove hints/)
        // The limiters answer 429 with their own code and the wait at error.retryAfter
        expect(labErrorMessage(new ApiError('x', 429, 'RATE_LIMIT_EXCEEDED', undefined, { retryAfter: 90 }))).toBe('Too many requests. Try again in about 2 minutes.')
        expect(labErrorMessage(new ApiError('x', 409, 'LAB_SLUG_TAKEN'))).toMatch(/slug/)
        expect(labErrorMessage(new ApiError('Odd thing', 500, 'LAB_NEW'))).toBe('Odd thing')
        expect(labErrorMessage(new Error('offline'))).toBe('offline')
        expect(labErrorMessage('x')).toBe('Something went wrong. Please try again.')
    })

    it('reads 401, 403 and 404 plainly', () => {
        expect(labErrorMessage(new ApiError('x', 401))).toBe('Sign in to do that.')
        expect(labErrorMessage(new ApiError('x', 403))).toBe('You are not allowed to do that.')
        expect(labErrorMessage(new ApiError('x', 404))).toMatch(/could not be found/)
    })
})

describe('lock timing', () => {
    it('prefers the relative wait and falls back to the absolute time', () => {
        expect(retryAfterSeconds(locked({ retryAfter: 90, lockedUntil: '2000-01-01T00:00:00Z' }), 0)).toBe(90)
        const now = Date.parse('2030-01-01T00:00:00Z')
        expect(retryAfterSeconds(locked({ lockedUntil: '2030-01-01T00:10:00Z' }), now)).toBe(600)
        expect(retryAfterSeconds(locked({}), now)).toBeNull()
        expect(retryAfterSeconds(new Error('x'))).toBeNull()
    })

    it('turns the wait into a client clock instant only for a lock', () => {
        expect(lockedUntilFromError(locked({ retryAfter: 60 }), 1000)).toBe(61_000)
        expect(lockedUntilFromError(new ApiError('x', 429, 'OTHER', undefined, { retryAfter: 60 }), 1000)).toBeNull()
        expect(isLockedError(locked())).toBe(true)
        expect(isLockedError(new ApiError('x', 429))).toBe(false)
    })

    it('words a wait', () => {
        expect(waitText(1)).toBe('1 second')
        expect(waitText(59)).toBe('59 seconds')
        expect(waitText(61)).toBe('2 minutes')
        expect(waitText(60)).toBe('1 minute')
    })
})

describe('server field errors', () => {
    it('key by the API path and list the bare ones apart', () => {
        const err = new ApiError('x', 400, 'VALIDATION_ERROR', [{ field: 'hints.0.text', message: 'Too long' }, { field: 'hints.0.text', message: 'second' }, { message: 'Odd' }])
        expect(fieldErrors(err)).toEqual({ 'hints.0.text': 'Too long' })
        expect(unattachedDetails(err)).toEqual(['Odd'])
    })
})
