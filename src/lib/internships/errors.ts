import { ApiError } from '@/lib/api';

/**
 * What a person should read for each error the internships API answers with. The server message is
 * the fallback, so a new code never shows a blank toast.
 */
const MESSAGES: Record<string, string> = {
    INTERNSHIP_NOT_FOUND: 'This program could not be found. It may have been removed or not published yet.',
    INTERNSHIP_APPLICATION_NOT_FOUND: 'This application could not be found.',
    INTERNSHIP_CLOSED: 'Applications for this program are closed.',
    INTERNSHIP_ALREADY_APPLIED: 'You have already applied to this program.',
    INTERNSHIP_FULL: 'This program has no seats left, so this application cannot be accepted. You can still reject it.',
    INTERNSHIP_CAPACITY_TOO_LOW: 'The capacity cannot be lower than the number of applicants already accepted.',
    INTERNSHIP_SELF_REVIEW: 'You cannot review your own application. Another reviewer has to do it.',
};

const STATUS_WORDS: Record<string, string> = {
    pending: 'pending', reviewing: 'in review', accepted: 'accepted', rejected: 'rejected', withdrawn: 'withdrawn',
};
const word = (s: unknown) => (typeof s === 'string' ? STATUS_WORDS[s] ?? s : '');

export function internshipErrorCode(err: unknown): string | undefined {
    return err instanceof ApiError ? err.code : undefined;
}

/** The message to show for a failed internships call */
export function internshipErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (err instanceof ApiError) {
        if (err.code === 'INTERNSHIP_INVALID_TRANSITION') {
            const from = word(err.meta?.from);
            const allowed = Array.isArray(err.meta?.allowed) ? (err.meta.allowed as unknown[]).map(word).filter(Boolean) : [];
            if (!from) return 'This application cannot be moved to that status.';
            const next = allowed.length ? ` It can only be moved to: ${allowed.join(', ')}.` : ' It cannot be changed any more.';
            return `This application is already ${from}.${next} Someone else may have reviewed it just now.`;
        }
        if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
        if (err.status === 401) return 'Sign in to do that.';
        if (err.status === 403) return 'You are not allowed to do that.';
        if (err.status === 404) return MESSAGES.INTERNSHIP_NOT_FOUND;
        if (err.status === 429) return 'Too many requests. Try again in a moment.';
        if (err.code === 'VALIDATION_ERROR' && err.details?.length) return err.details.map((d) => d.message).join(' ');
        return err.message || fallback;
    }
    return err instanceof Error && err.message ? err.message : fallback;
}

/** Field level problems from a 400, keyed by the API field name (`title`, `answers.<fieldId>`) */
export function fieldErrors(err: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (err instanceof ApiError && err.details) {
        for (const d of err.details) {
            if (d.field && !out[d.field]) out[d.field] = d.message;
        }
    }
    return out;
}

/** Whether the error means "sign in again" rather than "you may not" */
export function isAuthError(err: unknown): boolean {
    return err instanceof ApiError && err.status === 401;
}

/**
 * The form field a server field path belongs to. A list of plain strings (`requirements.3`,
 * `syllabus.0.topics.2`) is one text box, so its index is dropped; a row of an object list
 * (`customFields.0.label`) keeps its path.
 */
export function formFieldPath(path: string): string {
    const parts = path.split('.');
    const ROWS = new Set(['customFields', 'syllabus', 'showcaseProjects', 'answers']);
    while (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1]) && !(parts.length === 2 && ROWS.has(parts[0]))) {
        parts.pop();
    }
    return parts.join('.');
}

/** `fieldErrors` with each path mapped to the form field that shows it */
export function formErrors(err: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, message] of Object.entries(fieldErrors(err))) {
        const key = formFieldPath(path);
        if (!out[key]) out[key] = message;
    }
    return out;
}
