'use client';

import { useState } from 'react';
import { Eye, Lightbulb, Lock } from 'lucide-react';
import { btnSecondary, cardPad, chip, muted } from '@/components/events/styles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useUnlockHint } from '@/hooks/queries/useLabs';
import { hintCost, pointsAfterHint, pointsText } from '@/lib/labs/display';
import { labErrorMessage } from '@/lib/labs/errors';
import type { LabDetail, LabHint } from '@/types/lab';
import { LabMarkdown } from './LabMarkdown';

type Reason = 'signed-out' | 'not-started' | 'completed' | null;

/** Why hints cannot be opened right now, or null when they can */
function lockedReason(lab: LabDetail, signedIn: boolean): Reason {
    if (!signedIn) return 'signed-out';
    const status = lab.viewer?.myStatus;
    if (status === 'completed') return 'completed';
    if (status !== 'in-progress') return 'not-started';
    return null;
}

const REASON_TEXT: Record<Exclude<Reason, null>, string> = {
    'signed-out': 'Sign in and start the lab to open hints.',
    'not-started': 'Start the lab to open hints.',
    completed: 'This lab is completed, so hints that were not opened stay closed.',
};

/** What opening a hint comes to, in words: the one place the confirm dialog and the button read from */
export function hintPrice(available: number, penalty: number) {
    const cost = hintCost(available, penalty);
    return { cost, after: pointsAfterHint(available, penalty) };
}

export function LabHints({ lab, signedIn }: { lab: LabDetail; signedIn: boolean }) {
    const unlock = useUnlockHint();
    const [confirming, setConfirming] = useState<LabHint | null>(null);
    const [error, setError] = useState<{ index: number; message: string } | null>(null);
    const [openingIndex, setOpeningIndex] = useState<number | null>(null);
    const reason = lockedReason(lab, signedIn);
    const available = lab.viewer?.pointsAvailable ?? lab.points;

    if (lab.hints.length === 0) return null;

    const open = (hint: LabHint) => {
        setConfirming(null);
        setError(null);
        setOpeningIndex(hint.index);
        unlock.mutate({ slug: lab.slug, hintIndex: hint.index }, {
            onError: (err) => setError({ index: hint.index, message: labErrorMessage(err) }),
            onSettled: () => setOpeningIndex(null),
        });
    };

    const price = confirming ? hintPrice(available, confirming.penalty) : null;

    return (
        <section aria-labelledby="lab-hints" className={cardPad}>
            <h2 id="lab-hints" className="mb-1 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
                <Lightbulb className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Hints
            </h2>
            <p className={`mb-4 text-sm ${muted}`}>
                Stuck? A hint takes its cost off the points this lab pays. You pay for each hint once, and can read an opened hint again for free.
                {reason && <> <span data-testid="hints-locked-note">{REASON_TEXT[reason]}</span></>}
            </p>
            <ol className="space-y-3">
                {lab.hints.map((hint) => {
                    const opened = hint.unlocked;
                    const staffPreview = !opened && typeof hint.text === 'string';
                    const showText = (opened || staffPreview) && typeof hint.text === 'string';
                    const busy = openingIndex === hint.index;
                    const rowError = error?.index === hint.index ? error.message : null;
                    return (
                        <li key={hint.index} className="rounded-xl border border-gray-200 p-4 dark:border-neutral-800" data-testid="lab-hint" data-opened={opened ? 'true' : 'false'}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                                    Hint {hint.index + 1}
                                    <span className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>
                                        {hint.penalty === 0 ? 'Free' : `Costs ${pointsText(hint.penalty)}`}
                                    </span>
                                    {opened && <span className={`${chip} bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300`}><Eye className="h-3 w-3" aria-hidden="true" /> Opened</span>}
                                    {staffPreview && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300`}>Staff preview</span>}
                                </h3>
                                {!opened && (
                                    <button
                                        type="button"
                                        className={`${btnSecondary} !px-3 !py-1.5`}
                                        disabled={reason !== null || busy || unlock.isPending}
                                        onClick={() => setConfirming(hint)}
                                    >
                                        {reason ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Lightbulb className="h-4 w-4" aria-hidden="true" />}
                                        Open hint {hint.index + 1}
                                    </button>
                                )}
                            </div>
                            {showText && <div className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800"><LabMarkdown content={hint.text as string} /></div>}
                            {rowError && <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300">{rowError}</p>}
                        </li>
                    );
                })}
            </ol>

            <ConfirmDialog
                open={!!confirming}
                variant="warning"
                title={confirming ? `Open hint ${confirming.index + 1}?` : 'Open this hint?'}
                description={price && confirming
                    ? (price.cost === 0
                        ? 'There are no points left to take off, so this hint costs nothing. You can read it again at any time.'
                        : `This takes ${pointsText(price.cost)} off this lab: you would earn ${price.after} instead of ${available}. You pay once, and can read the hint again for free.`)
                    : ''}
                confirmText={price && price.cost > 0 ? `Open for ${pointsText(price.cost)}` : 'Open hint'}
                cancelText="Keep it closed"
                onCancel={() => setConfirming(null)}
                onConfirm={() => confirming && open(confirming)}
            />
        </section>
    );
}
