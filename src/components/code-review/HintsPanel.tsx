'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, Lightbulb, Lock } from 'lucide-react';
import { btnSecondary, cardPad, chip, muted } from '@/components/events/styles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useUnlockHint } from '@/hooks/queries/useCodeReview';
import { crErrorMessage } from '@/lib/codeReview/errors';
import { hintPrice, nextClosedHint, pointsText } from '@/lib/codeReview/display';
import type { CrDetail, CrHintView } from '@/types/codeReview';
import { CrMarkdown } from './CrMarkdown';

type Reason = 'signed-out' | 'loading' | null;

/**
 * The hints. They open one at a time, in order, and each costs its points once: the cost is shown
 * before it is opened, and a dialog asks first. Staff read them for free (nothing is recorded).
 */
export function HintsPanel({ snippet, signedIn, staff, loading = false }: { snippet: CrDetail; signedIn: boolean; staff: boolean; loading?: boolean }) {
    const unlock = useUnlockHint();
    const [confirming, setConfirming] = useState<CrHintView | null>(null);
    const [error, setError] = useState<{ order: number; message: string } | null>(null);
    const [openingOrder, setOpeningOrder] = useState<number | null>(null);
    const [focusOrder, setFocusOrder] = useState<number | null>(null);
    const [announcement, setAnnouncement] = useState('');
    const textRefs = useRef<Record<number, HTMLDivElement | null>>({});

    const hints = [...snippet.hints].sort((a, b) => a.order - b.order);
    const viewer = snippet.viewer;
    const reason: Reason = !signedIn ? 'signed-out' : loading || (!viewer && !staff) ? 'loading' : null;
    const available = viewer?.pointsAvailable ?? 0;
    const next = nextClosedHint(hints.map((h) => ({ ...h, unlocked: h.unlocked || (viewer?.hintsUnlocked.includes(h.order) ?? false) })));

    const focused = focusOrder !== null ? hints.find((h) => h.order === focusOrder) : undefined;
    const focusedReady = !!focused?.unlocked && typeof focused.text === 'string';
    useEffect(() => {
        if (focusOrder === null || !focusedReady) return;
        textRefs.current[focusOrder]?.focus();
        setFocusOrder(null);
    }, [focusOrder, focusedReady]);

    if (hints.length === 0) return null;

    const open = (hint: CrHintView) => {
        setConfirming(null);
        setError(null);
        setOpeningOrder(hint.order);
        unlock.mutate({ ref: snippet.slug, order: hint.order }, {
            onSuccess: () => {
                setFocusOrder(hint.order);
                setAnnouncement(`Hint ${hint.order} opened.${hint.cost === 0 ? '' : ` It took ${pointsText(hintPrice(available, hint.cost))} off what a pass pays.`}`);
            },
            onError: (err) => setError({ order: hint.order, message: crErrorMessage(err) }),
            onSettled: () => setOpeningOrder(null),
        });
    };

    const price = confirming ? hintPrice(available, confirming.cost) : 0;
    const dialogText = confirming
        ? (confirming.cost === 0
            ? 'This hint is free: it does not take any points off. You can read it again at any time.'
            : available === 0
                ? 'No points can be earned on this exercise any more, so this hint costs you nothing. You can read it again at any time.'
                : `This takes ${pointsText(price)} off what a pass pays: a perfect pass pays ${pointsText(available)} now. You pay once, and can read the hint again for free.`)
        : '';

    return (
        <section aria-labelledby="cr-hints" className={cardPad} data-testid="hints-panel">
            <h2 id="cr-hints" className="mb-1 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
                <Lightbulb className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Hints
            </h2>
            <p className={`mb-4 text-sm ${muted}`}>
                Stuck? Hints open one at a time, in order. Each takes its cost off what a pass pays, once, and you can read an opened hint again for free.
                {reason === 'signed-out' && <> <span data-testid="hints-locked-note">Sign in to open hints.</span></>}
                {staff && <> <span data-testid="hints-locked-note">As staff you read every hint for free and nothing is recorded.</span></>}
            </p>
            <p role="status" aria-live="polite" className="sr-only" data-testid="hint-announcement">{announcement}</p>
            <ol className="space-y-3">
                {hints.map((hint) => {
                    const opened = hint.unlocked || (viewer?.hintsUnlocked.includes(hint.order) ?? false);
                    const staffPreview = !opened && typeof hint.text === 'string';
                    const showText = (opened || staffPreview) && typeof hint.text === 'string';
                    const isNext = next?.order === hint.order;
                    const busy = openingOrder === hint.order;
                    const rowError = error?.order === hint.order ? error.message : null;
                    return (
                        <li key={hint.order} className="rounded-xl border border-gray-200 p-4 dark:border-neutral-800" data-testid="cr-hint" data-opened={opened ? 'true' : 'false'}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                                    Hint {hint.order}
                                    <span className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{hint.cost === 0 ? 'Free' : `Costs ${pointsText(hint.cost)}`}</span>
                                    {opened && <span className={`${chip} bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300`}><Eye className="h-3 w-3" aria-hidden="true" /> Opened</span>}
                                    {staffPreview && <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300`}>Staff preview</span>}
                                </h3>
                                {!opened && !staffPreview && (
                                    <button
                                        type="button"
                                        className={`${btnSecondary} !px-3 !py-1.5`}
                                        disabled={reason !== null || !isNext || busy || unlock.isPending}
                                        onClick={() => setConfirming(hint)}
                                    >
                                        {reason || !isNext ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Lightbulb className="h-4 w-4" aria-hidden="true" />}
                                        Open hint {hint.order}
                                    </button>
                                )}
                            </div>
                            {!opened && !staffPreview && !isNext && reason === null && (
                                <p className={`mt-2 text-xs ${muted}`}>Opens after hint {next?.order ?? hint.order - 1}.</p>
                            )}
                            {showText && (
                                <div
                                    ref={(el) => { textRefs.current[hint.order] = el; }}
                                    tabIndex={-1}
                                    role="group"
                                    aria-label={`Hint ${hint.order} text`}
                                    className="mt-3 border-t border-gray-100 pt-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 dark:border-neutral-800"
                                    data-testid="hint-text"
                                >
                                    <CrMarkdown content={hint.text as string} />
                                </div>
                            )}
                            {rowError && <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300">{rowError}</p>}
                        </li>
                    );
                })}
            </ol>

            <ConfirmDialog
                open={!!confirming}
                variant="warning"
                title={confirming ? `Open hint ${confirming.order}?` : 'Open this hint?'}
                description={dialogText}
                confirmText={confirming && price > 0 ? `Open for ${pointsText(price)}` : 'Open hint'}
                cancelText="Keep it closed"
                onCancel={() => setConfirming(null)}
                onConfirm={() => confirming && open(confirming)}
            />
        </section>
    );
}
