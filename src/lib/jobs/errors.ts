import { ApiError } from '@/lib/api';
import { retryAfterSeconds, waitText } from '@/lib/labs/errors';
import { JOB_LIMITS } from './constants';

export { fieldErrors, retryAfterSeconds, waitText } from '@/lib/labs/errors';

/**
 * What a person should read for each error the jobs API answers with. The server message is the
 * fallback, so a new code never shows a blank toast.
 */
const MESSAGES: Record<string, string> = {
    JOB_NOT_FOUND: 'This job is not available. It may have been closed, expired or removed.',
    COMPANY_NOT_FOUND: 'This company could not be found.',
    JOB_HAS_REPORTS: 'This job has open reports, so it cannot be deleted. Close it instead.',
    JOB_SLUG_TAKEN: 'Another job already uses that address. Choose a different one.',
    JOB_COMPANY_REQUIRED: 'Enter the company name this job is posted for.',
    JOB_OWN_REPORT: 'You cannot report your own job.',
    COMPANY_REQUIRED: 'Set up your company profile before you post a job.',
    EMAIL_NOT_VERIFIED: 'Confirm your email address first: open the link we sent you, then try again.',
    EMPLOYER_EMAIL_NOT_ORG: 'Employer accounts need an email address on your organisation\'s own domain. Free mail providers such as Gmail or Outlook are not accepted. Sign in with your work address and try again.',
    AUTHZ_FORBIDDEN: 'Your account is not allowed to do that.',
    JOB_STALE: 'This job changed since you opened it. It was reloaded: check it again before you decide.',
    COMPANY_STALE: 'This company changed since you opened it. It was reloaded: check it again before you decide.',
    SELF_REVIEW: 'You cannot decide on your own job or company. Another reviewer has to do it.',
    COMPANY_INVALID_TRANSITION: 'Someone else already decided on this company. Reload to see where it stands.',
    JOB_EXPIRED: 'This job\'s end date has already passed, so it cannot be edited. Reopen it to give it a new end date.',
    JOB_SALARY_INVALID: 'The pay does not fit the pay already saved: the lowest pay cannot be higher than the highest. Fill in both figures, or clear the pay.',
    COMPANY_CONFLICT: 'Your company profile was changed at the same time. Reload it and try again.',
    COMPANY_NOT_REJECTED: 'Only a company that was turned down can ask for a new review. Reload to see where it stands.',
};

export function jobErrorCode(err: unknown): string | undefined {
    return err instanceof ApiError ? err.code : undefined;
}

const STATUS_WORDS: Record<string, string> = {
    draft: 'a draft', pending: 'waiting for review', approved: 'live', rejected: 'rejected', closed: 'closed', expired: 'expired',
};

/** When a rejected company may ask again (`meta.retryAt`), written for the viewer's own time zone, or null */
export function retryAtText(err: unknown): string | null {
    if (!(err instanceof ApiError)) return null;
    const at = err.meta?.retryAt;
    const ms = typeof at === 'string' || typeof at === 'number' ? new Date(at).getTime() : NaN;
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** The current copy of a job or company a stale decision carries (`error.meta.current`), or null */
export function staleCurrent<T = Record<string, unknown>>(err: unknown): T | null {
    if (!(err instanceof ApiError) || (err.code !== 'JOB_STALE' && err.code !== 'COMPANY_STALE')) return null;
    const current = err.meta?.current;
    return current && typeof current === 'object' && !Array.isArray(current) ? (current as T) : null;
}

/** The reason a company was turned down, as the API sends it, or null */
export function companyRejectedReason(err: unknown): string | null {
    if (!(err instanceof ApiError) || err.code !== 'COMPANY_REJECTED') return null;
    const reason = err.meta?.reason;
    return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

/** The message to show for a failed jobs or companies call */
export function jobErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (err instanceof ApiError) {
        if (err.status === 429 || err.code === 'RATE_LIMIT_EXCEEDED') {
            const seconds = retryAfterSeconds(err);
            return seconds ? `Too many requests. Try again in about ${waitText(seconds)}.` : 'Too many requests. Wait a moment and try again.';
        }
        if (err.code === 'JOB_LIMIT_REACHED') {
            const limit = Number(err.meta?.limit);
            const cap = Number.isFinite(limit) && limit > 0 ? `${limit} open jobs` : 'the number of open jobs your account allows';
            return `You have reached the limit of ${cap}. Close or delete a job you no longer need, then try again. Verified companies can have more.`;
        }
        if (err.code === 'COMPANY_REJECTED') {
            const reason = companyRejectedReason(err);
            return `Your company was not approved${reason ? `: ${reason}` : ''}. Update your company profile, then ask for a new review from the company page.`;
        }
        if (err.code === 'COMPANY_RESUBMIT_TOO_SOON') {
            const at = retryAtText(err);
            return `You can ask for a new review ${at ? `from ${at}` : 'later'}. Until then, update your company profile: a change lets you ask again at once.`;
        }
        if (err.code === 'JOB_STALE' || err.code === 'COMPANY_STALE') return MESSAGES[err.code];
        if (err.code === 'JOB_INVALID_TRANSITION') {
            const from = typeof err.meta?.status === 'string' ? STATUS_WORDS[err.meta.status] ?? err.meta.status : '';
            return from
                ? `This job changed since you opened it: it is ${from} now, so that is not possible. Reload to see its current state.`
                : 'This job changed since you opened it, so that is not possible. Reload to see its current state.';
        }
        if (err.code === 'JOB_EXPIRY_INVALID') {
            return err.message || `The end date must be at least an hour from now and within ${JOB_LIMITS.maxExpiryDays} days.`;
        }
        if (err.code === 'VALIDATION_ERROR' && err.details?.length) return err.details.map((d) => d.message).join(' ');
        if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
        if (err.status === 401) return 'Sign in to do that.';
        if (err.status === 403) return 'You are not allowed to do that.';
        if (err.status === 404) return MESSAGES.JOB_NOT_FOUND;
        return err.message || fallback;
    }
    return err instanceof Error && err.message ? err.message : fallback;
}

/** The message for a failed report: a conflict here always means "you already reported this" */
export function reportErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
        if (err.code === 'JOB_OWN_REPORT') return MESSAGES.JOB_OWN_REPORT;
        if (err.status === 409) return 'You have already reported this job. A moderator will look at it.';
        if (err.status === 404) return 'This job is not available any more, so it cannot be reported.';
        if (err.status === 401) return 'Sign in to report a job.';
        if (err.status === 429) {
            const seconds = retryAfterSeconds(err);
            return seconds ? `You are reporting too fast. Try again in about ${waitText(seconds)}.` : 'You have reached the limit for reports. Try again later.';
        }
    }
    return jobErrorMessage(err, 'The report could not be sent. Please try again.');
}

/** Whether a failed report only repeats a report that already stands */
export const isAlreadyReported = (err: unknown): boolean => err instanceof ApiError && err.status === 409 && err.code !== 'JOB_HAS_REPORTS';

/** Whether the error means "the page shows an old state": the screen should show the truth again */
export const isStaleJobState = (err: unknown): boolean =>
    err instanceof ApiError && (
        err.code === 'JOB_INVALID_TRANSITION' || err.code === 'JOB_STALE' || err.code === 'COMPANY_STALE'
        || err.code === 'COMPANY_INVALID_TRANSITION' || err.code === 'JOB_NOT_FOUND' || err.status === 404
    );

/** The reviewer asked to decide on something they own */
export const isSelfReview = (err: unknown): boolean => err instanceof ApiError && err.code === 'SELF_REVIEW';

/** Whether the error is the "sign in again" kind rather than "you may not" */
export const isAuthError = (err: unknown): boolean => err instanceof ApiError && err.status === 401;

/** The field a server field path belongs to: `requirements.3` is the requirements list, `salary.min` stays */
export function formFieldPath(path: string): string {
    const parts = path.split('.');
    while (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) parts.pop();
    return parts.join('.');
}

/** `fieldErrors` with each path mapped to the form field that shows it */
export function formErrors(err: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (err instanceof ApiError && err.details) {
        for (const d of err.details) {
            if (!d.field) continue;
            const key = formFieldPath(d.field);
            if (!out[key]) out[key] = d.message;
        }
    }
    return out;
}
