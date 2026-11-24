import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { duplicateOf, fieldErrors, isAuthError, isConflict, isNotFound, learningErrorMessage, waitText } from '../errors';

const err = (code: string | undefined, status = 400, meta?: Record<string, unknown>, details?: { field?: string; message: string }[]) => new ApiError('server text', status, code, details, meta);

describe('learningErrorMessage', () => {
    it('maps the roadmap and resource codes', () => {
        expect(learningErrorMessage(err('PATH_VERSION_REQUIRED'))).toMatch(/Reload this roadmap before saving/);
        expect(learningErrorMessage(err('PATH_CONFLICT', 409))).toMatch(/Someone else saved/);
        expect(learningErrorMessage(err('RESOURCE_DUPLICATE', 409))).toMatch(/already in the library/);
        expect(learningErrorMessage(err('RESOURCE_SELF_VOTE', 403))).toMatch(/cannot vote/);
        expect(learningErrorMessage(err('RESOURCE_SELF_REVIEW', 403))).toMatch(/another moderator/i);
        expect(learningErrorMessage(err('PATH_NOT_PUBLISHABLE', 422))).toMatch(/not ready to publish/);
    });
    it('explains an unknown step as a change by someone else', () => {
        expect(learningErrorMessage(err('PATH_NODE_UNKNOWN', 400))).toMatch(/someone else removed it.*Load the latest version/)
    })
    it('names the unfinished prerequisites', () => {
        expect(learningErrorMessage(err('PATH_PREREQUISITES_NOT_MET', 403, { missing: [{ title: 'Linux basics' }, { title: 'Networking' }] }))).toBe('Finish Linux basics, Networking before starting this one.');
        expect(learningErrorMessage(err('PATH_PREREQUISITES_NOT_MET', 403))).toMatch(/prerequisite/);
    });
    it('explains why an account cannot submit', () => {
        expect(learningErrorMessage(err('RESOURCE_ACCOUNT_NOT_ELIGIBLE', 403, { reason: 'email_not_verified' }))).toMatch(/Verify your email/);
        expect(learningErrorMessage(err('RESOURCE_ACCOUNT_NOT_ELIGIBLE', 403, { reason: 'account_too_new', retryAfter: 7200 }))).toMatch(/2 hours/);
    });
    it('joins the field messages of a validation error', () => {
        expect(learningErrorMessage(err('VALIDATION_ERROR', 400, undefined, [{ field: 'title', message: 'Too short.' }, { field: 'url', message: 'Bad link.' }]))).toBe('Too short. Bad link.');
    });
    it('falls back by status and then to the server text', () => {
        expect(learningErrorMessage(err(undefined, 401))).toBe('Sign in to do that.');
        expect(learningErrorMessage(err(undefined, 404))).toMatch(/could not be found/);
        expect(learningErrorMessage(err(undefined, 429))).toMatch(/too quickly/);
        expect(learningErrorMessage(err('SOMETHING_NEW', 500))).toBe('server text');
        expect(learningErrorMessage('boom')).toBe('Something went wrong. Please try again.');
        expect(learningErrorMessage(new Error('offline'))).toBe('offline');
    });
});

describe('error helpers', () => {
    it('reads field errors and keeps the first per field', () => {
        expect(fieldErrors(err('VALIDATION_ERROR', 400, undefined, [{ field: 'modules.0.title', message: 'A' }, { field: 'modules.0.title', message: 'B' }, { message: 'no field' }]))).toEqual({ 'modules.0.title': 'A' });
        expect(fieldErrors(new Error('x'))).toEqual({});
    });
    it('returns the entry a duplicate points at', () => {
        expect(duplicateOf(err('RESOURCE_DUPLICATE', 409, { existing: { slug: 'owasp', status: 'approved' } }))).toEqual({ slug: 'owasp', status: 'approved' });
        expect(duplicateOf(err('RESOURCE_DUPLICATE', 409))).toEqual({});
        expect(duplicateOf(err('OTHER'))).toBeNull();
    });
    it('classifies errors', () => {
        expect(isAuthError(err(undefined, 401))).toBe(true);
        expect(isNotFound(err(undefined, 404))).toBe(true);
        expect(isConflict(err('PATH_CONFLICT', 409))).toBe(true);
        expect(isConflict(err('PATH_INVALID_STATE', 409))).toBe(false);
    });
    it('formats waits', () => {
        expect(waitText(30)).toBe('a minute');
        expect(waitText(600)).toBe('10 minutes');
        expect(waitText(3600)).toBe('an hour');
        expect(waitText(undefined)).toBe('a little while');
    });
});
