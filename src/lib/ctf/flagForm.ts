import { ApiError } from '@/lib/api';
import type { CtfRightFlag, CtfSubmitResult } from '@/types/ctf';
import { ctfErrorMessage, retryAfterSeconds } from './errors';
import { flagSchema } from './schemas';

/**
 * The flag form of one challenge as a small state machine, so each answer of the API has one place
 * where it is read. The flag text itself is never part of this state: the screen keeps it in an
 * input, clears it the moment it is sent, and the machine only knows what the server answered.
 *
 * - idle:        the box is open; `notice` says what the last send came to
 * - submitting:  one request is in flight; a second send is ignored
 * - waiting:     a send limit was hit (10 a minute per challenge, 30 in all); the box is off until `until` (a browser clock
 *                instant, counted from when the answer arrived, never a server instant)
 * - success:     the flag was right
 * - solved:      the challenge was already solved for the member or the team (409)
 * - blocked:     the competition or the team does not allow a send (ended, cancelled, not started, team needed).
 *                `not-started` is not final: the page's clock can be a little ahead of the server's, so `recheck` lets the box open
 *                again (the next send says again if it is still too early). The others stay until the page reloads.
 */
export type BlockReason = 'ended' | 'cancelled' | 'not-started' | 'team-required' | 'team-too-small';

export type FlagNotice =
    | { kind: 'wrong'; attemptsRecent: number; attemptLimit: number; attemptsLeft: number; windowSeconds: number }
    | { kind: 'error'; message: string }
    | { kind: 'invalid'; message: string };

export type FlagState =
    | { phase: 'idle'; notice: FlagNotice | null }
    | { phase: 'submitting' }
    | { phase: 'waiting'; until: number }
    | { phase: 'success'; result: CtfRightFlag }
    | { phase: 'solved' }
    | { phase: 'blocked'; reason: BlockReason; message: string };

export type FlagAction =
    | { type: 'invalid'; message: string }
    | { type: 'submit' }
    | { type: 'result'; result: CtfSubmitResult }
    | { type: 'failed'; error: unknown; now?: number }
    | { type: 'unlocked' }
    | { type: 'recheck' };

export const initialFlagState = (): FlagState => ({ phase: 'idle', notice: null });

const BLOCKS: Record<string, BlockReason> = {
    CTF_ENDED: 'ended',
    CTF_CANCELLED: 'cancelled',
    CTF_NOT_STARTED: 'not-started',
    CTF_TEAM_REQUIRED: 'team-required',
    CTF_TEAM_TOO_SMALL: 'team-too-small',
};

/** The wait of a 429 in whole seconds: what the API says, else a minute (the window) */
export function waitFromError(err: unknown): number {
    return retryAfterSeconds(err) ?? 60;
}

export function flagReducer(state: FlagState, action: FlagAction): FlagState {
    switch (action.type) {
        case 'invalid':
            return state.phase === 'idle' ? { phase: 'idle', notice: { kind: 'invalid', message: action.message } } : state;
        case 'submit':
            // One send at a time, and none once the challenge is done, blocked or waiting
            return state.phase === 'idle' ? { phase: 'submitting' } : state;
        case 'result': {
            if (state.phase !== 'submitting') return state;
            const r = action.result;
            if (r.correct) return { phase: 'success', result: r };
            return {
                phase: 'idle',
                notice: {
                    kind: 'wrong',
                    attemptsRecent: r.attemptsRecent,
                    attemptLimit: r.attemptLimit,
                    attemptsLeft: Math.max(0, r.attemptLimit - r.attemptsRecent),
                    windowSeconds: r.windowSeconds,
                },
            };
        }
        case 'failed': {
            if (state.phase !== 'submitting') return state;
            const err = action.error;
            if (err instanceof ApiError) {
                if (err.status === 429 || err.code === 'RATE_LIMIT_EXCEEDED') {
                    const now = action.now ?? Date.now();
                    return { phase: 'waiting', until: now + waitFromError(err) * 1000 };
                }
                if (err.code === 'CTF_ALREADY_SOLVED') return { phase: 'solved' };
                const reason = err.code ? BLOCKS[err.code] : undefined;
                if (reason) return { phase: 'blocked', reason, message: ctfErrorMessage(err) };
            }
            return { phase: 'idle', notice: { kind: 'error', message: ctfErrorMessage(err) } };
        }
        case 'unlocked':
            return state.phase === 'waiting' ? { phase: 'idle', notice: null } : state;
        case 'recheck':
            return state.phase === 'blocked' && state.reason === 'not-started' ? { phase: 'idle', notice: null } : state;
        default:
            return state;
    }
}

/** The flag as it is sent, or the message to show when it cannot be sent */
export function checkFlag(raw: string): { ok: true; flag: string } | { ok: false; message: string } {
    const parsed = flagSchema.safeParse(raw);
    return parsed.success ? { ok: true, flag: parsed.data } : { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter the flag before you send it' };
}

/** "3 of 10 tries used in the last minute" */
export function attemptsText(notice: Extract<FlagNotice, { kind: 'wrong' }>): string {
    const window = notice.windowSeconds === 60 ? 'minute' : `${notice.windowSeconds} seconds`;
    return `${notice.attemptsRecent} of ${notice.attemptLimit} tries used in the last ${window}`;
}
