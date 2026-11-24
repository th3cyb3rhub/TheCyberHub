'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Loader2, LogIn, Play, RotateCcw } from 'lucide-react';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { btnPrimary, btnSecondary, cardPad, muted } from '@/components/events/styles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { useStartLab, useStopLab } from '@/hooks/queries/useLabs';
import { labErrorMessage } from '@/lib/labs/errors';
import { canStop } from '@/lib/labs/display';
import type { LabDetail } from '@/types/lab';

/** Start, progress and reset. Everything a visitor or a member does about the lab as a whole. */
export function LabActionPanel({ lab, signedIn, viewerKnown, onRetry }: { lab: LabDetail; signedIn: boolean; viewerKnown: boolean; onRetry: () => void }) {
    const start = useStartLab();
    const stop = useStopLab();
    const { addToast } = useToast();
    const [confirmingStop, setConfirmingStop] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const viewer = lab.viewer;

    if (!signedIn) {
        const redirect = encodeURIComponent(`/labs/${lab.slug}`);
        return (
            <section aria-labelledby="lab-progress" className={cardPad} data-testid="signin-prompt">
                <h2 id="lab-progress" className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Sign in to take this lab</h2>
                <p className={`mb-4 text-sm ${muted}`}>
                    You can read the brief, the files and what each hint costs without an account. Signing in lets you start the lab, open hints and send flags, and puts your name on the leaderboard.
                </p>
                <Link href={`/auth?redirect=${redirect}`} className={`${btnPrimary} w-full sm:w-auto`}><LogIn className="h-4 w-4" aria-hidden="true" /> Sign in to start</Link>
            </section>
        );
    }

    if (!viewerKnown || !viewer) {
        return (
            <section aria-labelledby="lab-progress" className={cardPad} aria-busy="true" data-testid="progress-pending">
                <h2 id="lab-progress" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Your progress</h2>
                <div className="space-y-2" role="status" aria-label="Loading your progress">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                </div>
                {!viewer && (
                    <button type="button" onClick={onRetry} className={`${btnSecondary} mt-4`}>Reload my progress</button>
                )}
            </section>
        );
    }

    const doStart = () => {
        setError(null);
        start.mutate({ slug: lab.slug }, { onError: (err) => setError(labErrorMessage(err)) });
    };

    const doStop = () => {
        setConfirmingStop(false);
        setError(null);
        stop.mutate({ slug: lab.slug }, {
            onSuccess: (result) => addToast(result.reset
                ? { variant: 'success', message: 'Your start was taken back. You can start this lab again whenever you like.' }
                : { variant: 'info', message: 'Your progress was kept, because you already opened a hint or sent a flag.' }),
            onError: (err) => setError(labErrorMessage(err)),
        });
    };

    return (
        <section aria-labelledby="lab-progress" className={cardPad} data-testid="progress-panel" data-status={viewer.myStatus}>
            <h2 id="lab-progress" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Your progress</h2>

            {viewer.myStatus === 'not-started' && (
                <>
                    <p className={`mb-4 text-sm ${muted}`}>
                        Starting only records that you began, so hints and flags count. Nothing is launched for you: the target is shared and public, and you work on it in your own tools.
                    </p>
                    <button type="button" className={`${btnPrimary} w-full sm:w-auto`} disabled={start.isPending} onClick={doStart}>
                        {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />} Start lab
                    </button>
                </>
            )}

            {viewer.myStatus === 'in-progress' && (
                <>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div><dt className={`text-xs ${muted}`}>Points if you finish now</dt><dd className="font-semibold text-gray-900 dark:text-white" data-testid="points-now">{viewer.pointsAvailable} of {lab.points}</dd></div>
                        <div><dt className={`text-xs ${muted}`}>Hints opened</dt><dd className="font-semibold text-gray-900 dark:text-white">{viewer.hintsUsed} of {lab.hintCount}</dd></div>
                        <div><dt className={`text-xs ${muted}`}>Wrong flags</dt><dd className="font-semibold text-gray-900 dark:text-white">{viewer.attempts}</dd></div>
                        <div><dt className={`text-xs ${muted}`}>Started</dt><dd className="font-semibold text-gray-900 dark:text-white"><ViewerTime iso={viewer.startedAt} kind="moment" /></dd></div>
                    </dl>
                    {canStop(viewer) ? (
                        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-neutral-800">
                            <button type="button" className={btnSecondary} disabled={stop.isPending} onClick={() => setConfirmingStop(true)}>
                                {stop.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />} Reset my start
                            </button>
                            <p className={`mt-2 text-xs ${muted}`}>Possible until you open a hint or send a flag.</p>
                        </div>
                    ) : (
                        <p className={`mt-4 border-t border-gray-100 pt-4 text-xs dark:border-neutral-800 ${muted}`}>Your progress cannot be reset once you have opened a hint or sent a flag.</p>
                    )}
                </>
            )}

            {viewer.myStatus === 'completed' && (
                <p className="flex items-start gap-2 text-sm text-green-900 dark:text-green-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Completed{viewer.completedAt && <> on <ViewerTime iso={viewer.completedAt} kind="moment" /></>}. You earned {viewer.pointsAwarded} {viewer.pointsAwarded === 1 ? 'point' : 'points'}.</span>
                </p>
            )}

            {error && <p role="alert" className="mt-3 text-sm text-red-800 dark:text-red-300">{error}</p>}

            <ConfirmDialog
                open={confirmingStop}
                variant="warning"
                title="Reset your start?"
                description="Your start is removed and this lab goes back to not started. You can start it again later. This only works while you have opened no hint and sent no flag."
                confirmText="Reset my start"
                cancelText="Keep going"
                onCancel={() => setConfirmingStop(false)}
                onConfirm={doStop}
            />
        </section>
    );
}
