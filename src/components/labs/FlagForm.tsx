'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { Flag, Loader2, Lock, Send } from 'lucide-react';
import { btnPrimary, cardPad, input, inputError, muted } from '@/components/events/styles';
import { useSubmitFlag } from '@/hooks/queries/useLabs';
import { formatClock, useCountdown } from '@/lib/labs/countdown';
import { lockEndsAt } from '@/lib/labs/lock';
import { checkFlag, flagReducer, initialFlagState } from '@/lib/labs/flagForm';
import { FLAG_MAX } from '@/lib/labs/schemas';
import { waitText } from '@/lib/labs/errors';
import type { LabDetail } from '@/types/lab';
import { CompletedPanel } from './CompletedPanel';

/**
 * Where a member sends a flag. The text lives in one input and is cleared the moment it is sent:
 * it is never kept in state, a cache, storage or an event. The server decides what is right.
 */
export function FlagForm({ lab, onUnlocked }: { lab: LabDetail; onUnlocked?: () => void }) {
    const submit = useSubmitFlag();
    const viewer = lab.viewer;
    // The lock as the answer stamped it (a wait counted from when it arrived), on the browser clock
    const serverLock = viewer ? lockEndsAt(viewer, Date.now()) : null;
    const [state, dispatch] = useReducer(flagReducer, serverLock, (lock) => initialFlagState(lock));
    const [flag, setFlag] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const inFlight = useRef(false);

    // The lab says it is locked (it was, when the page opened, or another tab found out)
    useEffect(() => {
        if (serverLock !== null && serverLock > Date.now()) dispatch({ type: 'lock', until: serverLock });
    }, [serverLock]);

    const lockedUntil = state.phase === 'locked' ? state.until : null;
    const seconds = useCountdown(lockedUntil, () => {
        dispatch({ type: 'unlocked' });
        onUnlocked?.();
    });

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
        submit.mutate({ slug: lab.slug, flag: checked.flag }, {
            onSuccess: (result) => dispatch({ type: 'result', result }),
            onError: (error) => dispatch({ type: 'failed', error }),
            onSettled: () => {
                inFlight.current = false;
                submit.reset();
                window.setTimeout(() => inputRef.current?.focus(), 0);
            },
        });
    };

    if (state.phase === 'success') {
        return <CompletedPanel lab={lab} pointsEarned={state.pointsEarned} badges={state.badges} justNow />;
    }
    if (state.phase === 'completed' || viewer?.myStatus === 'completed') {
        // After a 409 the screen knows it is done before the refetch brings the points: use what the
        // 409 said, and until then say nothing about the amount rather than "0 points"
        const earned = viewer?.myStatus === 'completed' ? viewer.pointsAwarded : state.phase === 'completed' ? state.pointsEarned : null;
        return <CompletedPanel lab={lab} pointsEarned={earned} />;
    }

    const locked = state.phase === 'locked';
    const submitting = state.phase === 'submitting';
    const notice = state.phase === 'idle' ? state.notice : null;
    const invalid = notice?.kind === 'invalid' ? notice.message : undefined;
    // Screen readers hear the lock once, then once a minute, never every second
    const minutesLeft = Math.ceil(seconds / 60);

    return (
        <section aria-labelledby="lab-flag" className={cardPad} data-testid="flag-form" data-phase={state.phase}>
            <h2 id="lab-flag" className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                <Flag className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Submit the flag
            </h2>
            <p className={`mb-4 text-sm ${muted}`}>The server checks it. Five wrong flags within ten minutes lock this lab for fifteen minutes.</p>

            <form onSubmit={onSubmit} noValidate>
                <label htmlFor="lab-flag-input" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">Flag</label>
                <input
                    ref={inputRef}
                    id="lab-flag-input"
                    type="text"
                    value={flag}
                    maxLength={FLAG_MAX}
                    onChange={(e) => setFlag(e.target.value)}
                    disabled={locked || submitting}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-sentry-mask
                    data-private="true"
                    placeholder="flag{...}"
                    aria-invalid={invalid ? true : undefined}
                    aria-describedby={invalid ? 'lab-flag-error' : undefined}
                    className={`${input} font-mono ${invalid ? inputError : ''}`}
                />
                {invalid && <p id="lab-flag-error" className="mt-1 text-sm text-red-800 dark:text-red-300">{invalid}</p>}
                <button type="submit" className={`${btnPrimary} mt-3 w-full sm:w-auto`} disabled={locked || submitting} aria-disabled={locked || submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : locked ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    {submitting ? 'Checking' : 'Submit flag'}
                </button>
            </form>

            {locked && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="lock-notice">
                    <p className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4" aria-hidden="true" /> Locked after too many wrong flags</p>
                    <p className="mt-1">You can try again in <span role="timer" className="font-mono font-semibold" data-testid="lock-clock">{formatClock(seconds)}</span>. Hints are still open while you wait.</p>
                </div>
            )}

            {/* One live region for every result: the verdict, the lock (announced per minute) and errors */}
            <div role="status" aria-live="polite" className={notice || locked ? 'mt-4' : 'sr-only'} data-testid="flag-status">
                {notice?.kind === 'wrong' && (
                    <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="wrong-notice">
                        That is not the flag. {notice.attempts} {notice.attempts === 1 ? 'attempt' : 'attempts'} so far,
                        {notice.attemptsLeft > 0 ? ` ${notice.attemptsLeft} left before this lab locks.` : ' none left before this lab locks.'}
                    </p>
                )}
                {notice?.kind === 'busy' && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">{notice.message}</p>}
                {notice?.kind === 'error' && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">{notice.message}</p>}
                {locked && <span className="sr-only">This lab is locked for about {waitText(minutesLeft * 60)}.</span>}
                {submitting && <span className="sr-only">Checking your flag.</span>}
            </div>
        </section>
    );
}
