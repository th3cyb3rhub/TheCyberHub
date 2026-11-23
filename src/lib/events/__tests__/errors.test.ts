import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api'
import { eventErrorMessage, fieldErrors, isAuthError } from '../errors'

const CODES = [
    'EVENT_REGISTRATION_CLOSED', 'EVENT_FULL', 'EVENT_ALREADY_REGISTERED', 'EVENT_ALREADY_WAITLISTED', 'EVENT_NOT_REGISTERED',
    'EVENT_NOT_FULL', 'EVENT_WAITLIST_DISABLED', 'EVENT_NOT_WAITLISTED', 'EVENT_REMINDER_UNAVAILABLE', 'EVENT_ENDED',
    'EVENT_ALREADY_ATTENDED', 'EVENT_EMAIL_NOT_VERIFIED', 'EVENT_PENDING_LIMIT', 'EVENT_DAILY_LIMIT', 'EVENT_DUPLICATE',
    'EVENT_NOT_PENDING', 'EVENT_NOT_CANCELLABLE', 'EVENT_CANCELLED', 'EVENT_FIELD_LOCKED', 'EVENT_FEEDBACK_CLOSED',
    'EVENT_FEEDBACK_EXISTS', 'EVENT_FEEDBACK_FORBIDDEN',
]

describe('eventErrorMessage', () => {
    it.each(CODES)('has its own wording for %s', (code) => {
        const msg = eventErrorMessage(new ApiError('server words', 409, code))
        expect(msg).not.toBe('server words')
        expect(msg.length).toBeGreaterThan(10)
    })

    it('falls back to the server message for an unknown code', () => {
        expect(eventErrorMessage(new ApiError('Something specific', 400, 'NEW_CODE'))).toBe('Something specific')
    })

    it('says what to do on 401, 404 and 429', () => {
        expect(eventErrorMessage(new ApiError('x', 401))).toMatch(/Sign in/)
        expect(eventErrorMessage(new ApiError('x', 404))).toMatch(/could not be found/)
        expect(eventErrorMessage(new ApiError('Too many requests from this client', 429))).toMatch(/too quickly/)
    })

    it('joins validation details', () => {
        const err = new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'title', message: 'Title is required' }, { field: 'startDate', message: 'Start date is required' }])
        expect(eventErrorMessage(err)).toBe('Title is required Start date is required')
    })

    it('handles plain errors and unknown values', () => {
        expect(eventErrorMessage(new Error('Network down'))).toBe('Network down')
        expect(eventErrorMessage('boom')).toMatch(/Something went wrong/)
    })
})

describe('fieldErrors and isAuthError', () => {
    it('keys the first message by field', () => {
        const err = new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [
            { field: 'startDate', message: 'first' }, { field: 'startDate', message: 'second' }, { message: 'no field' },
        ])
        expect(fieldErrors(err)).toEqual({ startDate: 'first' })
        expect(fieldErrors(new Error('x'))).toEqual({})
    })
    it('spots a 401', () => {
        expect(isAuthError(new ApiError('x', 401))).toBe(true)
        expect(isAuthError(new ApiError('x', 403))).toBe(false)
    })
})
