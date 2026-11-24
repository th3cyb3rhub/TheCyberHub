import { ApiError } from '@/lib/api';
import { labErrorMessage, lockedUntilFromError } from './errors';
import { lockEndsAt } from './lock';
import { flagSchema } from './schemas';
import type { LabBadge, SubmitResult } from '@/types/lab';

/**
 * The flag form as a small state machine, so each answer of the API has one place where it is read.
 * The flag text itself is never part of this state: the screen keeps it in an input, clears it the
 * moment it is sent, and the machine only knows what the server answered.
 *
 * - idle:        the box is open; `notice` says what the last send came to (wrong, busy, error)
 * - submitting:  one request is in flight; a second send is ignored
 * - locked:      the lab is locked until `until` (an instant on the browser clock, worked out from a
 *                number of seconds counted from when the answer arrived); the box is off
 * - success:     the flag was right
 * - completed:   the lab was already completed (409): nothing more to send
 */
export type FlagNotice =
    | { kind: 'wrong'; attempts: number; attemptsLeft: number }
    | { kind: 'busy'; message: string }
    | { kind: 'error'; message: string }
    | { kind: 'invalid'; message: string };

export type FlagState =
    | { phase: 'idle'; notice: FlagNotice | null }
    | { phase: 'submitting' }
    | { phase: 'locked'; until: number; attempts?: number }
    | { phase: 'success'; pointsEarned: number; badges: LabBadge[]; attempts: number }
    /** `pointsEarned` is what the 409 says the member earned, or null when it did not say */
    | { phase: 'completed'; pointsEarned: number | null };

export type FlagAction =
    | { type: 'invalid'; message: string }
    | { type: 'submit' }
    | { type: 'result'; result: SubmitResult; now?: number }
    | { type: 'failed'; error: unknown; now?: number }
    | { type: 'unlocked' }
    | { type: 'lock'; until: number };

export const initialFlagState = (lockedUntil: number | null = null, now: number = Date.now()): FlagState =>
    lockedUntil !== null && lockedUntil > now ? { phase: 'locked', until: lockedUntil } : { phase: 'idle', notice: null };

export function flagReducer(state: FlagState, action: FlagAction): FlagState {
    switch (action.type) {
        case 'invalid':
            return state.phase === 'idle' ? { phase: 'idle', notice: { kind: 'invalid', message: action.message } } : state;
        case 'submit':
            // One send at a time, and none once the lab is done or locked
            return state.phase === 'idle' ? { phase: 'submitting' } : state;
        case 'result': {
            if (state.phase !== 'submitting') return state;
            const r = action.result;
            if (r.correct) return { phase: 'success', pointsEarned: r.pointsEarned, badges: r.newBadges ?? [], attempts: r.attempts };
            // `now` is when the answer arrived. The lock is a wait counted from it, never a server instant.
            const now = action.now ?? Date.now();
            const until = lockEndsAt(r, now);
            if (until !== null && until > now) return { phase: 'locked', until, attempts: r.attempts };
            return { phase: 'idle', notice: { kind: 'wrong', attempts: r.attempts, attemptsLeft: r.attemptsLeft } };
        }
        case 'failed': {
            if (state.phase !== 'submitting') return state;
            const err = action.error;
            if (err instanceof ApiError) {
                if (err.code === 'LAB_ALREADY_COMPLETED') {
                    const earned = err.meta?.pointsEarned;
                    return { phase: 'completed', pointsEarned: typeof earned === 'number' && Number.isFinite(earned) && earned >= 0 ? earned : null };
                }
                if (err.code === 'LAB_LOCKED') {
                    const until = lockedUntilFromError(err, action.now);
                    if (until) return { phase: 'locked', until };
                }
                if (err.code === 'LAB_BUSY') return { phase: 'idle', notice: { kind: 'busy', message: labErrorMessage(err) } };
            }
            return { phase: 'idle', notice: { kind: 'error', message: labErrorMessage(err) } };
        }
        case 'unlocked':
            return state.phase === 'locked' ? { phase: 'idle', notice: null } : state;
        case 'lock':
            // A lock already counting down is kept: a later copy of the same fact must not move it
            return state.phase === 'idle' ? { phase: 'locked', until: action.until } : state;
        default:
            return state;
    }
}

/** The flag as it is sent, or the message to show when it cannot be sent */
export function checkFlag(raw: string): { ok: true; flag: string } | { ok: false; message: string } {
    const parsed = flagSchema.safeParse(raw);
    return parsed.success ? { ok: true, flag: parsed.data } : { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter the flag before you send it' };
}
