import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import {
    companyRejectedReason, formErrors, formFieldPath, isAlreadyReported, isAuthError, isStaleJobState, jobErrorMessage, reportErrorMessage,
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
