import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import {
    companyRejectedReason, formErrors, formFieldPath, isAlreadyReported, isAuthError, isSelfReview, isStaleJobState, jobErrorMessage, reportErrorMessage, retryAtText, staleCurrent,
} from '../errors'

const err = (status: number, code?: string, meta?: Record<string, unknown>, message = 'server said') => new ApiError(message, status, code, undefined, meta)

describe('jobs error messages', () => {
    it('says what to do for the employer gates', () => {
        expect(jobErrorMessage(err(403, 'EMAIL_NOT_VERIFIED'))).toMatch(/Confirm your email/)
        expect(jobErrorMessage(err(403, 'EMPLOYER_EMAIL_NOT_ORG'))).toMatch(/organisation.*domain/)
        expect(jobErrorMessage(err(403, 'EMPLOYER_EMAIL_NOT_ORG'))).toMatch(/Gmail/)
    })

    it('names the limit when the job cap is reached', () => {
        expect(jobErrorMessage(err(409, 'JOB_LIMIT_REACHED', { limit: 10 }))).toMatch(/10 open jobs/)
        expect(jobErrorMessage(err(409, 'JOB_LIMIT_REACHED'))).toMatch(/number of open jobs/)
    })

    it('carries the reviewer reason of a rejected company', () => {
        const rejected = err(403, 'COMPANY_REJECTED', { reason: 'Website does not match' })
        expect(companyRejectedReason(rejected)).toBe('Website does not match')
        expect(jobErrorMessage(rejected)).toMatch(/not approved: Website does not match/)
        expect(jobErrorMessage(err(403, 'COMPANY_REJECTED'))).not.toMatch(/: undefined/)
        expect(companyRejectedReason(err(403, 'OTHER', { reason: 'x' }))).toBeNull()
    })

    it('explains a state conflict with the state the job is in', () => {
        expect(jobErrorMessage(err(409, 'JOB_INVALID_TRANSITION', { status: 'approved', to: 'approved' }))).toMatch(/live/)
        expect(jobErrorMessage(err(409, 'JOB_INVALID_TRANSITION'))).toMatch(/current state/)
    })

    it('waits on a 429 for as long as the API says', () => {
        expect(jobErrorMessage(err(429, 'RATE_LIMIT_EXCEEDED', { retryAfter: 90 }))).toMatch(/2 minutes/)
        expect(jobErrorMessage(err(429))).toMatch(/Wait a moment/)
    })

    it('joins validation details and falls back to the server message', () => {
        const validation = new ApiError('bad', 400, 'VALIDATION_ERROR', [{ field: 'title', message: 'Title is too short' }, { field: 'description', message: 'Describe it' }])
        expect(jobErrorMessage(validation)).toBe('Title is too short Describe it')
        expect(jobErrorMessage(err(500, 'JOB_NEW_CODE', undefined, 'Odd thing'))).toBe('Odd thing')
        expect(jobErrorMessage(err(404))).toMatch(/not available/)
        expect(jobErrorMessage(err(401))).toBe('Sign in to do that.')
        expect(jobErrorMessage(new Error('offline'))).toBe('offline')
        expect(jobErrorMessage('x')).toBe('Something went wrong. Please try again.')
    })
})

describe('report errors', () => {
    it('reads a 409 as "already reported" and keeps the other cases apart', () => {
        expect(reportErrorMessage(err(409))).toMatch(/already reported/)
        expect(isAlreadyReported(err(409))).toBe(true)
        expect(isAlreadyReported(err(409, 'JOB_HAS_REPORTS'))).toBe(false)
        expect(reportErrorMessage(err(400, 'JOB_OWN_REPORT'))).toMatch(/your own job/)
        expect(reportErrorMessage(err(404))).toMatch(/not available/)
        expect(reportErrorMessage(err(429, undefined, { retryAfter: 30 }))).toMatch(/30 seconds/)
        expect(reportErrorMessage(err(429))).toMatch(/limit for reports/)
    })
})

describe('error kinds and field paths', () => {
    it('tells a stale screen from a refusal', () => {
        expect(isStaleJobState(err(409, 'JOB_INVALID_TRANSITION'))).toBe(true)
        expect(isStaleJobState(err(404))).toBe(true)
        expect(isStaleJobState(err(403))).toBe(false)
        for (const code of ['JOB_STALE', 'COMPANY_STALE', 'COMPANY_INVALID_TRANSITION']) expect(isStaleJobState(err(409, code))).toBe(true)
        expect(isStaleJobState(err(409, 'JOB_LIMIT_REACHED'))).toBe(false)
        expect(isSelfReview(err(403, 'SELF_REVIEW'))).toBe(true)
        expect(isSelfReview(err(403, 'AUTHZ_FORBIDDEN'))).toBe(false)
        expect(isAuthError(err(401))).toBe(true)
        expect(isAuthError(err(403))).toBe(false)
    })

    it('maps server field paths to form fields', () => {
        expect(formFieldPath('requirements.3')).toBe('requirements')
        expect(formFieldPath('salary.min')).toBe('salary.min')
        expect(formFieldPath('skills.0')).toBe('skills')
        const e = new ApiError('bad', 400, 'VALIDATION_ERROR', [{ field: 'requirements.2', message: 'Too long' }, { field: 'requirements.4', message: 'Other' }, { field: 'title', message: 'Short' }])
        expect(formErrors(e)).toEqual({ requirements: 'Too long', title: 'Short' })
        expect(formErrors(new Error('x'))).toEqual({})
    })
})

describe('the codes of the second round', () => {
    it('says a stale decision means the row changed since it was opened', () => {
        expect(jobErrorMessage(err(409, 'JOB_STALE'))).toMatch(/changed since you opened it/)
        expect(jobErrorMessage(err(409, 'COMPANY_STALE'))).toMatch(/changed since you opened it/)
        expect(jobErrorMessage(err(409, 'JOB_INVALID_TRANSITION', { status: 'approved' }))).toMatch(/changed since you opened it: it is live now/)
        expect(jobErrorMessage(err(409, 'JOB_INVALID_TRANSITION'))).toMatch(/changed since you opened it/)
    })

    it('hands over the current copy a stale answer carries', () => {
        expect(staleCurrent(err(409, 'JOB_STALE', { current: { _id: 'j1', title: 'New' } }))).toEqual({ _id: 'j1', title: 'New' })
        expect(staleCurrent(err(409, 'COMPANY_STALE', { current: { _id: 'c1' } }))).toEqual({ _id: 'c1' })
        expect(staleCurrent(err(409, 'JOB_STALE'))).toBeNull()
        expect(staleCurrent(err(409, 'JOB_INVALID_TRANSITION', { current: { _id: 'j1' } }))).toBeNull()
        expect(staleCurrent(new Error('x'))).toBeNull()
    })

    it('has a message for every new code', () => {
        expect(jobErrorMessage(err(403, 'SELF_REVIEW'))).toMatch(/own job or company/)
        expect(jobErrorMessage(err(409, 'COMPANY_INVALID_TRANSITION'))).toMatch(/already decided/)
        expect(jobErrorMessage(err(409, 'JOB_EXPIRED'))).toMatch(/Reopen/)
        expect(jobErrorMessage(err(400, 'JOB_SALARY_INVALID'))).toMatch(/lowest pay cannot be higher/)
        expect(jobErrorMessage(err(409, 'COMPANY_CONFLICT'))).toMatch(/at the same time/)
        expect(jobErrorMessage(err(409, 'COMPANY_NOT_REJECTED'))).toMatch(/turned down/)
    })

    it('shows when a rejected company may ask again, in the viewer\'s own zone', () => {
        const at = '2030-03-10T15:30:00.000Z'
        const text = retryAtText(err(409, 'COMPANY_RESUBMIT_TOO_SOON', { retryAt: at }))
        expect(text).toBe(new Date(at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))
        expect(jobErrorMessage(err(409, 'COMPANY_RESUBMIT_TOO_SOON', { retryAt: at }))).toContain(`from ${text}`)
        expect(jobErrorMessage(err(409, 'COMPANY_RESUBMIT_TOO_SOON'))).toMatch(/ask for a new review later/)
        expect(retryAtText(err(409, 'COMPANY_RESUBMIT_TOO_SOON', { retryAt: 'not a date' }))).toBeNull()
    })

    it('sends a rejected company to the new review action, not to a save', () => {
        const message = jobErrorMessage(err(403, 'COMPANY_REJECTED', { reason: 'No site' }))
        expect(message).toMatch(/ask for a new review/)
        expect(message).not.toMatch(/reviewed again/)
    })

    it('reads the wait of a 429 from meta.retryAfter, which the API client fills from the header too', () => {
        expect(jobErrorMessage(err(429, 'RATE_LIMIT_EXCEEDED', { retryAfter: 120 }))).toMatch(/about 2 minutes/)
    })
})
