import { ApiError } from '@/lib/api';
import { CR_LIMITS } from './constants';

/**
 * What a person should read for each error the code review API answers with. The server message is
 * the fallback, so a code this client does not know yet never shows a blank toast.
 */
const MESSAGES: Record<string, string> = {
    CR_NOT_FOUND: 'This exercise could not be found. It may have been removed, or it is not published yet.',
    CR_HINT_NOT_FOUND: 'This hint does not exist any more. Reload the page to see the current hints.',
    CR_SOLUTION_LOCKED: 'The solution opens after your first graded attempt. Submit your marks first.',
    CR_SLUG_TAKEN: 'Another exercise already uses this slug. Choose a different one.',
    CR_NOT_READY: 'An exercise needs at least one finding before it can be published. Add one and try again.',
    CR_NOT_GRADABLE: 'This exercise has no findings to grade yet, so it cannot be attempted. An administrator has to add them.',
    CR_HAS_PROGRESS: 'Members have already passed this exercise, so it cannot be deleted. Unpublish it instead: their progress and points stay.',
    CR_KEY_CHANGE_UNCONFIRMED: 'Members have already solved this exercise. Confirm the change to save it.',
    BAD_RESPONSE: 'The server answered in a way this page does not understand. Please try again later.',
};

export function crErrorCode(err: unknown): string | undefined {
    return err instanceof ApiError ? err.code : undefined;
}

/** "14 minutes", "1 minute", "45 seconds" for a wait */
export function waitText(seconds: number): string {
    const s = Math.max(1, Math.ceil(seconds));
    if (s < 60) return `${s} ${s === 1 ? 'second' : 'seconds'}`;
    if (s < 3600) {
        const m = Math.ceil(s / 60);
        return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
    }
    const h = Math.ceil(s / 3600);
    return `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/** Seconds to wait from a 429: `meta.retryAfter` (the api client also copies the `Retry-After` header there) */
export function retryAfterSeconds(err: unknown): number | null {
    if (!(err instanceof ApiError)) return null;
    const retry = err.meta?.retryAfter;
    return typeof retry === 'number' && Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : null;
}

/** The order of the hint to open first, from CR_HINT_OUT_OF_ORDER, or null */
export function nextHintOrder(err: unknown): number | null {
    if (!(err instanceof ApiError) || err.code !== 'CR_HINT_OUT_OF_ORDER') return null;
    const next = err.meta?.next;
    return typeof next === 'number' && Number.isInteger(next) && next > 0 ? next : null;
}

/** The ceilings the API names in CR_TOO_BROAD (`meta { maxMarks, maxLines }`), or null */
export function tooBroadLimits(err: unknown): { maxMarks: number; maxLines: number } | null {
    if (!(err instanceof ApiError) || err.code !== 'CR_TOO_BROAD') return null;
    const { maxMarks, maxLines } = err.meta ?? {};
    return typeof maxMarks === 'number' && typeof maxLines === 'number' ? { maxMarks, maxLines } : null;
}

export interface KeyChange { solveCount: number; oldFindingCount: number; newFindingCount: number; oldHintCount: number; newHintCount: number }

/** The numbers of CR_KEY_CHANGE_UNCONFIRMED, or null when it is another error. Missing numbers are 0. */
export function keyChangeInfo(err: unknown): KeyChange | null {
    if (!(err instanceof ApiError) || err.code !== 'CR_KEY_CHANGE_UNCONFIRMED') return null;
    const m = err.meta ?? {};
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    return { solveCount: num(m.solveCount), oldFindingCount: num(m.oldFindingCount), newFindingCount: num(m.newFindingCount), oldHintCount: num(m.oldHintCount), newHintCount: num(m.newHintCount) };
}

export const isDailyLimit = (err: unknown): boolean => err instanceof ApiError && err.code === 'CR_ATTEMPT_LIMIT';
export const isRateLimited = (err: unknown): boolean => err instanceof ApiError && err.status === 429;

/** Errors that mean "the page shows an old state": the screens refresh so they show the truth again */
const STALE_STATE_CODES = new Set(['CR_NOT_FOUND', 'CR_HINT_NOT_FOUND', 'CR_HINT_OUT_OF_ORDER', 'CR_NOT_GRADABLE', 'CR_SOLUTION_LOCKED', 'CR_HAS_PROGRESS']);
export const isStaleState = (err: unknown): boolean => err instanceof ApiError && !!err.code && STALE_STATE_CODES.has(err.code);

export function isAuthError(err: unknown): boolean {
    return err instanceof ApiError && err.status === 401;
}

/** The message to show for a failed code review call */
export function crErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (err instanceof ApiError) {
        if (err.code === 'CR_ATTEMPT_LIMIT') {
            const seconds = retryAfterSeconds(err);
            const limit = typeof err.meta?.limit === 'number' ? err.meta.limit : CR_LIMITS.attemptsPerDay;
            return seconds
                ? `You have used all ${limit} graded attempts on this exercise for today. You can try again in about ${waitText(seconds)}.`
                : `You have used all ${limit} graded attempts on this exercise for today. Try again later.`;
        }
        if (err.code === 'CR_TOO_BROAD') {
            const l = tooBroadLimits(err);
            return l
                ? `Too many marks or too many lines marked. An answer can hold at most ${l.maxMarks} marks covering at most ${l.maxLines} lines. Narrow your marks and send them again.`
                : 'Too many marks or too many lines marked. Narrow your marks and send them again.';
        }
        if (err.code === 'CR_HINT_OUT_OF_ORDER') {
            const next = nextHintOrder(err);
            return next ? `Hints open in order. Open hint ${next} first.` : 'Hints open in order. Open the next closed hint first.';
        }
        if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
        if (err.status === 401) return 'Sign in to do that.';
        if (err.status === 403) return 'You are not allowed to do that.';
        if (err.status === 404) return MESSAGES.CR_NOT_FOUND;
        if (err.status === 429) {
            const seconds = retryAfterSeconds(err);
            return seconds ? `Too many requests. Try again in about ${waitText(seconds)}.` : 'Too many requests. Wait a moment and try again.';
        }
        if (err.code === 'VALIDATION_ERROR' && err.details?.length) return err.details.map((d) => d.message).join(' ');
        return err.message || fallback;
    }
    return err instanceof Error && err.message ? err.message : fallback;
}

/** Field level problems from a 400, keyed by the API field path (`title`, `findings.0.lineEnd`) */
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
