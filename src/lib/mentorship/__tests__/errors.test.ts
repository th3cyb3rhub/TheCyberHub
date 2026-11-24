import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api'
import { isForbidden, isNotFound, mentorshipErrorCode, mentorshipErrorMessage } from '../errors'

const err = (status: number, code?: string, message = 'server said so') => new ApiError(message, status, code)

describe('mentorshipErrorMessage', () => {
    it.each([
        'MENTOR_NOT_ELIGIBLE', 'MENTOR_EMAIL_NOT_VERIFIED', 'MENTOR_ALREADY_REGISTERED', 'MENTOR_UNAVAILABLE', 'MENTOR_AT_CAPACITY',
        'MENTOR_COOLDOWN', 'MENTOR_INBOX_FULL', 'MENTOR_PAIR_BLOCKED', 'OWN_PROFILE', 'REQUEST_OPEN_EXISTS', 'REQUEST_DAILY_LIMIT',
        'REQUEST_NOT_OPEN', 'REQUEST_INVITE_LIMIT', 'MENTEE_LIMIT_REACHED', 'MENTORSHIP_EXISTS', 'MENTORSHIP_NOT_ACTIVE',
        'MENTORSHIP_EXTEND_LIMIT', 'MENTORSHIP_NOT_COMPLETED', 'SESSION_TOO_SOON', 'SESSION_TOO_FAR', 'SESSION_OVERLAP',
        'SESSION_LIMIT_REACHED', 'SESSION_AFTER_TERM', 'SESSION_NOT_STARTED', 'SESSION_MENTOR_ONLY', 'FEEDBACK_ALREADY_SUBMITTED',
        'FEEDBACK_DEADLINE_PASSED', 'ALREADY_REPORTED', 'ATTACHMENT_URL_INVALID', 'ATTACHMENT_TYPE_INVALID', 'ATTACHMENT_TOO_LARGE',
        'TRANSACTIONS_UNAVAILABLE', 'FLAG_CLOSED', 'MENTEE_UNAVAILABLE',
    ])('has a friendly message for %s', (code) => {
        const text = mentorshipErrorMessage(err(409, code))
        expect(text).not.toBe('server said so')
        expect(text).not.toContain(code)
        expect(text.length).toBeGreaterThan(15)
    })

    it('tells a member who is over the daily limit to come back tomorrow', () => {
        expect(mentorshipErrorMessage(err(429, 'REQUEST_DAILY_LIMIT'))).toMatch(/tomorrow/)
    })
    it('says the service is unavailable for the 503 code', () => {
        expect(mentorshipErrorMessage(err(503, 'TRANSACTIONS_UNAVAILABLE'))).toMatch(/temporarily unavailable.*later/)
    })
    it('falls back to the server message for an unknown code', () => {
        expect(mentorshipErrorMessage(err(409, 'SOMETHING_NEW'))).toBe('server said so')
    })
    it('treats 404 as not found or not yours, 401 as sign in and 429 as slow down', () => {
        expect(mentorshipErrorMessage(err(404))).toMatch(/could not find/)
        expect(mentorshipErrorMessage(err(401))).toBe('Sign in to do that.')
        expect(mentorshipErrorMessage(err(429))).toMatch(/too quickly/)
    })
    it('joins validation details', () => {
        const e = new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'bio', message: 'Bio too short' }, { message: 'Pick an area' }])
        expect(mentorshipErrorMessage(e)).toBe('Bio too short Pick an area')
    })
    it('uses a plain Error message and a fallback for anything else', () => {
        expect(mentorshipErrorMessage(new Error('offline'))).toBe('offline')
        expect(mentorshipErrorMessage('x', 'Try later')).toBe('Try later')
    })
    it('exposes the code and the status checks', () => {
        expect(mentorshipErrorCode(err(409, 'MENTOR_COOLDOWN'))).toBe('MENTOR_COOLDOWN')
        expect(mentorshipErrorCode(new Error('x'))).toBeUndefined()
        expect(isNotFound(err(404))).toBe(true)
        expect(isForbidden(err(403))).toBe(true)
        expect(isNotFound(err(500))).toBe(false)
    })
})
