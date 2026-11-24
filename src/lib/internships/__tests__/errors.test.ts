import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api';
import { fieldErrors, formErrors, formFieldPath, internshipErrorMessage, isAuthError } from '../errors';

const err = (status: number, code?: string, message = 'server words', details?: { field?: string; message: string }[], meta?: Record<string, unknown>) =>
    new ApiError(message, status, code, details, meta);

describe('internshipErrorMessage', () => {
    it.each([
        ['INTERNSHIP_CLOSED', /closed/i],
        ['INTERNSHIP_ALREADY_APPLIED', /already applied/i],
        ['INTERNSHIP_FULL', /no seats left/i],
        ['INTERNSHIP_CAPACITY_TOO_LOW', /accepted/i],
        ['INTERNSHIP_SELF_REVIEW', /your own application/i],
        ['INTERNSHIP_NOT_FOUND', /could not be found/i],
        ['INTERNSHIP_APPLICATION_NOT_FOUND', /application could not be found/i],
    ])('explains %s in plain words, not with the server text', (code, expected) => {
        expect(internshipErrorMessage(err(409, code))).toMatch(expected);
        expect(internshipErrorMessage(err(409, code))).not.toBe('server words');
    });

    it('names the state and the allowed moves of an invalid transition', () => {
        const msg = internshipErrorMessage(err(409, 'INTERNSHIP_INVALID_TRANSITION', 'x', undefined, { from: 'reviewing', to: 'pending', allowed: ['accepted', 'rejected'] }));
        expect(msg).toContain('already in review');
        expect(msg).toContain('accepted, rejected');
    });

    it('says a final application cannot change when nothing is allowed', () => {
        const msg = internshipErrorMessage(err(409, 'INTERNSHIP_INVALID_TRANSITION', 'x', undefined, { from: 'accepted', to: 'rejected', allowed: [] }));
        expect(msg).toContain('already accepted');
        expect(msg).toContain('cannot be changed any more');
    });

    it('keeps a message for an invalid transition without meta', () => {
        expect(internshipErrorMessage(err(409, 'INTERNSHIP_INVALID_TRANSITION'))).toMatch(/cannot be moved/);
    });

    it('falls back by status, then to the server text', () => {
        expect(internshipErrorMessage(err(401))).toBe('Sign in to do that.');
        expect(internshipErrorMessage(err(403))).toBe('You are not allowed to do that.');
        expect(internshipErrorMessage(err(404))).toMatch(/could not be found/);
        expect(internshipErrorMessage(err(429))).toBe('Too many requests. Try again in a moment.');
        expect(internshipErrorMessage(err(500, 'SOMETHING_NEW', 'Database is on fire'))).toBe('Database is on fire');
    });

    it('joins the field messages of a validation error', () => {
        expect(internshipErrorMessage(err(400, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'a', message: 'A is bad.' }, { field: 'b', message: 'B is bad.' }]))).toBe('A is bad. B is bad.');
    });

    it('handles plain errors and unknown values', () => {
        expect(internshipErrorMessage(new Error('offline'))).toBe('offline');
        expect(internshipErrorMessage('what', 'fallback')).toBe('fallback');
    });
});

describe('field errors', () => {
    it('reads details[].field and keeps the first message per field', () => {
        const e = err(400, 'VALIDATION_ERROR', 'Validation failed', [
            { field: 'answers.abc', message: 'Required' }, { field: 'answers.abc', message: 'Second' }, { message: 'no field' },
        ]);
        expect(fieldErrors(e)).toEqual({ 'answers.abc': 'Required' });
        expect(fieldErrors(new Error('x'))).toEqual({});
    });

    it('maps a path to the form field that shows it', () => {
        expect(formFieldPath('title')).toBe('title');
        expect(formFieldPath('requirements.3')).toBe('requirements');
        expect(formFieldPath('syllabus.0.topics.2')).toBe('syllabus.0.topics');
        expect(formFieldPath('customFields.1.label')).toBe('customFields.1.label');
        expect(formFieldPath('customFields.1.options.0')).toBe('customFields.1.options');
        expect(formFieldPath('customFields.1')).toBe('customFields.1');
        expect(formFieldPath('showcaseProjects.2.teamMembers.0')).toBe('showcaseProjects.2.teamMembers');
        // An answer id can be all digits: it is still a field, not an index
        expect(formFieldPath(`answers.${'1'.repeat(24)}`)).toBe(`answers.${'1'.repeat(24)}`);
    });

    it('turns server details into form errors', () => {
        const e = err(400, 'VALIDATION_ERROR', 'v', [{ field: 'requirements.4', message: 'Too long' }, { field: 'endDate', message: 'endDate must be after startDate' }]);
        expect(formErrors(e)).toEqual({ requirements: 'Too long', endDate: 'endDate must be after startDate' });
    });

    it('tells a signed-out error from a forbidden one', () => {
        expect(isAuthError(err(401))).toBe(true);
        expect(isAuthError(err(403))).toBe(false);
    });
});
