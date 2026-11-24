'use client';

import Link from 'next/link';
import { useEffect, useReducer, useRef, useState } from 'react';
import { CheckCircle2, Flag, Loader2, Lock, Send, Sparkles, Trophy, Users } from 'lucide-react';
import { btnPrimary, btnSecondary, input, inputError, muted } from '@/components/events/styles';
import { useSubmitCtfFlag } from '@/hooks/queries/useCtf';
import { attemptsText, checkFlag, flagReducer, initialFlagState } from '@/lib/ctf/flagForm';
import { CTF_LIMITS } from '@/lib/ctf/constants';
import { formatClock, useCountdown } from '@/lib/labs/countdown';
import type { CtfChallenge, CtfStatus } from '@/types/ctf';

export interface TeamIssue { reason: 'team-required' | 'team-too-small'; message: string }

interface Props {
    slug: string;
    challenge: Pick<CtfChallenge, '_id' | 'title' | 'flagFormat' | 'solved'>;
    status: CtfStatus;
    signedIn: boolean;
    /** A problem the client already knows about: no team, or a team that is too small */
    teamIssue: TeamIssue | null;
    onTeamTab: () => void;
}

const panel = 'rounded-xl border p-3 text-sm';

/** How long a "not started yet" answer keeps the box closed */
export const NOT_STARTED_RECHECK_MS = 5000;

/**
 * Where a member sends a flag for one challenge. The text lives in one input and is cleared the
 * moment it is sent: it is never kept in state, a cache, storage or an event. The server decides
 * what is right and what it is worth.
 */
export function CtfFlagForm({ slug, challenge, status, signedIn, teamIssue, onTeamTab }: Props) {
    const submit = useSubmitCtfFlag();
    const [state, dispatch] = useReducer(flagReducer, undefined, initialFlagState);
    const [flag, setFlag] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const inFlight = useRef(false);
    const inputId = `flag-${challenge._id}`;

    const until = state.phase === 'waiting' ? state.until : null;
    const seconds = useCountdown(until, () => dispatch({ type: 'unlocked' }));

    // "Not started" is a disagreement between clocks, not a verdict: let the box open again when the
    // competition's status moves, and every few seconds otherwise
    const notStarted = state.phase === 'blocked' && state.reason === 'not-started';
    useEffect(() => {
        if (!notStarted) return;
        const id = window.setTimeout(() => dispatch({ type: 'recheck' }), NOT_STARTED_RECHECK_MS);
        return () => window.clearTimeout(id);
    }, [notStarted]);
    const lastStatus = useRef(status);
    useEffect(() => {
        if (lastStatus.current === status) return;
        lastStatus.current = status;
        dispatch({ type: 'recheck' });
    }, [status]);

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Double submit: a second press, or Enter while the first is on its way, does nothing
        if (inFlight.current || state.phase !== 'idle') return;
        const checked = checkFlag(flag);
        if (!checked.ok) {
            dispatch({ type: 'invalid', message: checked.message });
            inputRef.current?.focus();
            return;
        }
        inFlight.current = true;
        // The flag leaves the screen at once; only the request holds it from here
        setFlag('');
        dispatch({ type: 'submit' });
        submit.mutate({ slug, challengeId: challenge._id, flag: checked.flag }, {
            onSuccess: (result) => dispatch({ type: 'result', result }),
            onError: (error) => dispatch({ type: 'failed', error }),
            onSettled: () => {
                inFlight.current = false;
                submit.reset();
                window.setTimeout(() => inputRef.current?.focus(), 0);
            },
        });
    };

    // A right flag stays on screen with its points even after the list says "solved"
    if (state.phase === 'success') {
        const r = state.result;
        return (
            <div role="status" aria-live="polite" className={`${panel} border-green-300 bg-green-50 text-green-950 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-100`} data-testid="flag-success">
                <p className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Correct flag</p>
                <p className="mt-1">
                    <strong>+{r.pointsEarned} {r.pointsEarned === 1 ? 'point' : 'points'}</strong> for {r.scope === 'team' ? 'your team' : 'you'}.
                </p>
                {r.firstBlood && <p className="mt-1 flex items-center gap-1.5 font-medium"><Trophy className="h-4 w-4" aria-hidden="true" /> First blood: nobody solved this before you.</p>}
                {r.accountPointsAwarded && <p className="mt-1 flex items-center gap-1.5"><Sparkles className="h-4 w-4" aria-hidden="true" /> The same points were added to your account and the global leaderboard.</p>}
                {r.newBadges.length > 0 && (
                    <p className="mt-1" data-testid="new-badges">New {r.newBadges.length === 1 ? 'badge' : 'badges'}: {r.newBadges.map((b) => b.name || b.code || 'badge').join(', ')}</p>
                )}
            </div>
        );
    }
    if (challenge.solved || state.phase === 'solved') {
        return (
            <p role="status" className={`${panel} border-green-300 bg-green-50 text-green-950 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-100`} data-testid="flag-solved">
                <CheckCircle2 className="-mt-0.5 mr-1.5 inline h-4 w-4" aria-hidden="true" />
                Solved. The points were counted once; nothing more to send here.
            </p>
        );
    }

    if (!signedIn) {
        return (
            <p className={`${panel} border-gray-200 text-gray-800 dark:border-neutral-700 dark:text-gray-200`} data-testid="flag-signin">
                <Link href={`/auth?redirect=${encodeURIComponent(`/ctf/competitions/${slug}`)}`} className="font-semibold text-orange-800 underline dark:text-orange-300">Sign in</Link> to send a flag.
            </p>
        );
    }
    if (status !== 'live' && status !== 'frozen') {
        const text = status === 'upcoming' ? 'Flags are accepted when the competition starts.'
            : status === 'ended' ? 'The competition has ended: flags are closed.'
                : status === 'cancelled' ? 'The competition was cancelled: flags are closed.'
                    : 'This competition is a draft: flags are closed.';
        return <p className={`${panel} border-gray-200 text-gray-800 dark:border-neutral-700 dark:text-gray-200`} data-testid="flag-closed">{text}</p>;
    }

    const blocked = teamIssue ?? (state.phase === 'blocked' ? { reason: state.reason, message: state.message } : null);
    if (blocked) {
        const teamRelated = blocked.reason === 'team-required' || blocked.reason === 'team-too-small';
        return (
            <div className={`${panel} border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100`} role="status" data-testid="flag-blocked" data-reason={blocked.reason}>
                <p>{blocked.message}</p>
                {teamRelated && <button type="button" onClick={onTeamTab} className={`${btnSecondary} mt-2 !px-3 !py-1.5`}><Users className="h-4 w-4" aria-hidden="true" /> Open the team tab</button>}
            </div>
        );
    }

    const waiting = state.phase === 'waiting';
    const submitting = state.phase === 'submitting';
    const notice = state.phase === 'idle' ? state.notice : null;
    const invalid = notice?.kind === 'invalid' ? notice.message : undefined;
    const minutesLeft = Math.max(1, Math.ceil(seconds / 60));

    return (
        <div data-testid="flag-form" data-phase={state.phase}>
            <form onSubmit={onSubmit} noValidate>
                <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">
                    <Flag className="-mt-0.5 mr-1 inline h-4 w-4 text-orange-700 dark:text-orange-400" aria-hidden="true" />Flag
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        ref={inputRef}
                        id={inputId}
                        type="text"
                        value={flag}
                        maxLength={CTF_LIMITS.flagMax}
                        onChange={(e) => setFlag(e.target.value)}
                        disabled={waiting || submitting}
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        data-sentry-mask
                        data-private="true"
                        placeholder={challenge.flagFormat || 'flag{...}'}
                        aria-invalid={invalid ? true : undefined}
                        aria-describedby={invalid ? `${inputId}-error` : undefined}
                        className={`${input} font-mono ${invalid ? inputError : ''}`}
                    />
                    <button type="submit" className={`${btnPrimary} shrink-0`} disabled={waiting || submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : waiting ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        {submitting ? 'Checking' : 'Submit flag'}
                    </button>
                </div>
                {invalid && <p id={`${inputId}-error`} className="mt-1 text-sm text-red-800 dark:text-red-300">{invalid}</p>}
            </form>

            {waiting && (
                <div className={`${panel} mt-3 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100`} data-testid="wait-notice">
                    <p className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4" aria-hidden="true" /> Too many tries</p>
                    <p className="mt-1">You can try again in <span role="timer" aria-live="off" className="font-mono font-semibold" data-testid="wait-clock">{formatClock(seconds)}</span>. Take a breath and check the challenge text.</p>
                </div>
            )}

            {/* One live region for every verdict. The wait is announced per minute, never every second. */}
            <div role="status" aria-live="polite" className={notice || waiting ? 'mt-3' : 'sr-only'} data-testid="flag-status">
                {notice?.kind === 'wrong' && (
                    <p className={`${panel} ${notice.attemptsLeft <= 2 ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100' : 'border-red-200 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100'}`} data-testid="wrong-notice">
                        That is not the flag. {attemptsText(notice)}; {notice.attemptsLeft === 0 ? 'no tries left until the minute passes.' : `${notice.attemptsLeft} left.`}
                    </p>
                )}
                {notice?.kind === 'error' && <p className={`${panel} border-red-200 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100`}>{notice.message}</p>}
                {waiting && <span className="sr-only">Sending is paused for about {minutesLeft} {minutesLeft === 1 ? 'minute' : 'minutes'}.</span>}
                {submitting && <span className="sr-only">Checking your flag.</span>}
            </div>
            <p className={`mt-2 text-xs ${muted}`}>The server checks it. There is a limit on tries per minute.</p>
        </div>
    );
}
