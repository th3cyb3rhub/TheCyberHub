import { ApiError } from '@/lib/api';

/**
 * What a person should read for each error the labs API answers with. The server message is the
 * fallback, so a new code never shows a blank toast.
 */
const MESSAGES: Record<string, string> = {
    LAB_NOT_FOUND: 'This lab could not be found. It may have been removed or not published yet.',
    LAB_NOT_STARTED: 'Start the lab first, then you can open hints and send a flag.',
    LAB_ALREADY_STARTED: 'You already started this lab.',
    LAB_ALREADY_COMPLETED: 'You have already completed this lab. Points are paid once.',
    LAB_NO_FLAGS: 'This lab has no flag yet, so it cannot be completed. An administrator has to add one.',
    LAB_BUSY: 'Your progress changed while the flag was being checked. Please send it again.',
    LAB_HINT_NOT_FOUND: 'This hint does not exist any more. Reload the page to see the current hints.',
    LAB_SLUG_TAKEN: 'Another lab already uses this slug. Choose a different one.',
    LAB_NOT_READY: 'Add at least one flag before you publish this lab.',
    LAB_HAS_COMPLETIONS: 'Members have completed this lab, so it cannot be deleted. Archive it instead.',
};

export function labErrorCode(err: unknown): string | undefined {
    return err instanceof ApiError ? err.code : undefined;
}

/** "14 minutes", "1 minute", "45 seconds" for a wait */
export function waitText(seconds: number): string {
    const s = Math.max(1, Math.ceil(seconds));
    if (s < 60) return `${s} ${s === 1 ? 'second' : 'seconds'}`;
    const m = Math.ceil(s / 60);
    return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/** Seconds to wait from a 429: the API's `meta.retryAfter`, or the time left to `meta.lockedUntil` */
export function retryAfterSeconds(err: unknown, now: number = Date.now()): number | null {
    if (!(err instanceof ApiError)) return null;
    const retry = err.meta?.retryAfter;
    if (typeof retry === 'number' && Number.isFinite(retry) && retry > 0) return Math.ceil(retry);
    const until = err.meta?.lockedUntil;
    if (typeof until === 'string') {
        const ms = new Date(until).getTime() - now;
        if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms / 1000);
    }
    return null;
}

/**
 * When a lab is locked until, as a client clock instant. The wait is taken relative to the moment
 * the error arrived (the API's `retryAfter`), so a browser clock that is off does not shorten or
 * stretch the lock; the absolute `lockedUntil` is the fallback.
 */
export function lockedUntilFromError(err: unknown, now: number = Date.now()): number | null {
    if (!(err instanceof ApiError) || err.code !== 'LAB_LOCKED') return null;
    const seconds = retryAfterSeconds(err, now);
    return seconds === null ? null : now + seconds * 1000;
}

export function isLockedError(err: unknown): boolean {
    return err instanceof ApiError && err.code === 'LAB_LOCKED';
}

export function isBusyError(err: unknown): boolean {
    return err instanceof ApiError && err.code === 'LAB_BUSY';
}

/** The message to show for a failed labs call */
export function labErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (err instanceof ApiError) {
        if (err.code === 'LAB_LOCKED') {
            const seconds = retryAfterSeconds(err);
            return seconds
                ? `Too many wrong flags for this lab. You can try again in about ${waitText(seconds)}.`
                : 'Too many wrong flags for this lab. Wait a few minutes before you try again.';
        }
        if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
        if (err.status === 401) return 'Sign in to do that.';
        if (err.status === 403) return 'You are not allowed to do that.';
        if (err.status === 404) return MESSAGES.LAB_NOT_FOUND;
        if (err.status === 429) {
            const seconds = retryAfterSeconds(err);
            return seconds ? `Too many requests. Try again in about ${waitText(seconds)}.` : 'Too many requests. Wait a moment and try again.';
        }
        if (err.code === 'VALIDATION_ERROR' && err.details?.length) return err.details.map((d) => d.message).join(' ');
        return err.message || fallback;
    }
    return err instanceof Error && err.message ? err.message : fallback;
}

/** Field level problems from a 400, keyed by the API field path (`title`, `hints.0.text`, `files.1.url`) */
export function fieldErrors(err: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (err instanceof ApiError && err.details) {
        for (const d of err.details) {
            if (d.field && !out[d.field]) out[d.field] = d.message;
        }
    }
    return out;
}

/** The server detail messages that carry no field, so the form can still show them */
export function unattachedDetails(err: unknown): string[] {
    return err instanceof ApiError ? (err.details ?? []).filter((d) => !d.field && d.message).map((d) => d.message) : [];
}

/** Whether the error means "sign in again" rather than "you may not" */
export function isAuthError(err: unknown): boolean {
    return err instanceof ApiError && err.status === 401;
}
