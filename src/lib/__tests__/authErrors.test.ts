import { describe, it, expect } from 'vitest'
import { AUTH_CODES, authErrorMessage, formatWait, retryAfterSeconds, sessionEndReason } from '../authErrors'

describe('sessionEndReason', () => {
    it('maps the codes that end a session', () => {
        expect(sessionEndReason(401, AUTH_CODES.SESSION_REVOKED)).toBe('revoked')
        expect(sessionEndReason(401, AUTH_CODES.LEGACY_TOKEN_REFUSED)).toBe('legacy')
        expect(sessionEndReason(403, AUTH_CODES.ACCOUNT_DISABLED)).toBe('disabled')
    })

    it.each([
        [401, AUTH_CODES.TOKEN_INVALID],
        [401, AUTH_CODES.REFRESH_RACE],
        [400, AUTH_CODES.PASSWORD_INCORRECT],
        [400, AUTH_CODES.TWO_FACTOR_CODE_INVALID],
        [429, AUTH_CODES.RATE_LIMITED],
        [401, undefined],
        [403, AUTH_CODES.SESSION_REVOKED],
    ])('does not end the session for %s %s', (status, code) => {
        expect(sessionEndReason(status, code)).toBeNull()
    })
})

describe('authErrorMessage', () => {
    it('prefers the first field problem, then the server message, then the fallback', () => {
        expect(authErrorMessage({ message: 'Validation failed', details: [{ field: 'email', message: 'Email is invalid' }] }, 'x')).toBe('Email is invalid')
        expect(authErrorMessage({ message: 'Invalid credentials' }, 'Login failed')).toBe('Invalid credentials')
        expect(authErrorMessage({}, 'Login failed')).toBe('Login failed')
        expect(authErrorMessage(null, 'Login failed')).toBe('Login failed')
    })

    it('tells a rate limited caller how long to wait', () => {
        expect(authErrorMessage({ status: 429, message: 'Too many requests.', meta: { retryAfter: 900 } }, 'x')).toBe('Too many requests. Try again in 15 minutes.')
        expect(authErrorMessage({ status: 429, message: 'Too many requests.' }, 'x')).toBe('Too many requests.')
        expect(authErrorMessage({ status: 401, message: 'Invalid credentials', meta: { retryAfter: 900 } }, 'x')).toBe('Invalid credentials')
    })
})

describe('retryAfterSeconds and formatWait', () => {
    it('reads a positive wait only', () => {
        expect(retryAfterSeconds({ meta: { retryAfter: 29.2 } })).toBe(30)
        expect(retryAfterSeconds({ meta: { retryAfter: 0 } })).toBeUndefined()
        expect(retryAfterSeconds({ meta: 'soon' })).toBeUndefined()
        expect(retryAfterSeconds(undefined)).toBeUndefined()
    })

    it('words the wait', () => {
        expect(formatWait(1)).toBe('1 second')
        expect(formatWait(45)).toBe('45 seconds')
        expect(formatWait(120)).toBe('2 minutes')
        expect(formatWait(7200)).toBe('2 hours')
    })
})
