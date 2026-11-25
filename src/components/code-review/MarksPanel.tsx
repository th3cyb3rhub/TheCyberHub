'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Loader2, LogIn, Send, Trash2 } from 'lucide-react';
import { btnPrimary, btnSecondary, cardPad, input, muted } from '@/components/events/styles';
import { CR_FINDING_TYPES } from '@/types/codeReview';
import { CR_LIMITS, findingTypeLabel, type MarkLimits } from '@/lib/codeReview/constants';
import { waitText } from '@/lib/codeReview/errors';
import { describeRange, markedLines, removeMarkAt, setMarkType, type MarkDraft } from '@/lib/codeReview/selection';

/** Seconds left until `until` (a browser clock instant), ticking once a second. Null once it has passed. */
export function useCountdown(until: number | null): number | null {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (until === null) return;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [until]);
    if (until === null) return null;
    const left = Math.ceil((until - now) / 1000);
    return left > 0 ? left : null;
}

/**
 * What a screen reader hears while a wait runs: once at the start, then every 10 seconds, and when
 * it is over. The visible countdown ticks every second but is not a live region.
 */
export function useWaitAnnouncement(seconds: number | null): string {
    const [text, setText] = useState('');
    const running = useRef(false);
    useEffect(() => {
        if (seconds === null) {
            if (running.current) { running.current = false; setText('You can submit again now.'); }
            return;
        }
        if (!running.current || seconds % 10 === 0) setText(`You can submit again in ${waitText(seconds)}.`);
        running.current = true;
    }, [seconds]);
    return text;
}

export type SubmitBlock =
    | { kind: 'signed-out'; href: string }
    | { kind: 'loading' }
    | { kind: 'no-attempts' }
    | { kind: 'not-gradable' };

/** The marks the member has put on the list, with a type for each, and the button that sends them */
export function MarksPanel({ marks, onMarksChange, onSubmit, submitting, block, error, waitSeconds, attemptsLeft, hasResult, limits }: {
    marks: MarkDraft[];
    onMarksChange: (marks: MarkDraft[]) => void;
    onSubmit: () => void;
    submitting: boolean;
    block: SubmitBlock | null;
    error: string | null;
    /** A 429 wait still running, in seconds */
    waitSeconds: number | null;
    attemptsLeft: number | null;
    hasResult: boolean;
    /** What an attempt may hold: shown as the marks and lines used so far */
    limits?: MarkLimits;
}) {
    const waiting = waitSeconds !== null;
    const announcement = useWaitAnnouncement(waitSeconds);
    const maxMarks = limits?.maxMarks ?? CR_LIMITS.marks;
    const lineTotal = markedLines(marks);
    const over = marks.length > maxMarks || (!!limits && lineTotal > limits.maxLines);
    const disabled = marks.length === 0 || over || submitting || waiting || (block !== null && block.kind !== 'signed-out');
    return (
        <section aria-labelledby="cr-marks" className={cardPad} data-testid="marks-panel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="cr-marks" className="text-xl font-semibold text-gray-900 dark:text-white">Your marks</h2>
                <p className={`text-sm ${over ? 'font-medium text-red-800 dark:text-red-300' : muted}`} data-testid="marks-count">
                    {marks.length} of {maxMarks} marks{limits ? `, ${lineTotal} of ${limits.maxLines} lines` : ''}
                </p>
            </div>

            {marks.length === 0 ? (
                <p className={`mb-4 text-sm ${muted}`} data-testid="no-marks">
                    You have not marked anything yet. Select the lines you think are vulnerable in the code above, then press &ldquo;Mark selection&rdquo;.
                    Marking the whole file earns nothing: each mark has to be close to one issue.
                    {limits && <> An answer can hold at most {limits.maxMarks} marks covering at most {limits.maxLines} lines.</>}
                </p>
            ) : (
                <ul className="mb-4 space-y-2" aria-label="Marked lines">
                    {marks.map((m, i) => {
                        const text = describeRange({ start: m.lineStart, end: m.lineEnd });
                        return (
                            <li key={`${m.lineStart}-${m.lineEnd}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 p-2.5 dark:border-neutral-800" data-testid="mark-item">
                                <span className="min-w-[7.5rem] text-sm font-medium text-gray-900 dark:text-white">{text.charAt(0).toUpperCase() + text.slice(1)}</span>
                                <div className="min-w-[10rem] flex-1">
                                    <label htmlFor={`mark-type-${i}`} className="sr-only">Vulnerability type for {text}</label>
                                    <select id={`mark-type-${i}`} value={m.vulnerabilityType ?? ''} onChange={(e) => onMarksChange(setMarkType(marks, i, e.target.value || undefined))} className={`${input} !py-2`}>
                                        <option value="">No type</option>
                                        {CR_FINDING_TYPES.map((c) => <option key={c} value={c}>{findingTypeLabel(c)}</option>)}
                                    </select>
                                </div>
                                <button type="button" className={`${btnSecondary} !px-3 !py-2`} onClick={() => onMarksChange(removeMarkAt(marks, i))} aria-label={`Remove mark on ${text}`}>
                                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {block?.kind === 'signed-out' && (
                <div className="mb-4 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-950 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100" data-testid="signin-prompt">
                    <p className="mb-3">You can read the exercise and try the marking without an account. Sign in to submit your marks, get graded, earn points and open the solution.</p>
                    <Link href={block.href} className={btnPrimary}><LogIn className="h-4 w-4" aria-hidden="true" /> Sign in to submit</Link>
                </div>
            )}
            {block?.kind === 'no-attempts' && (
                <p role="note" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="no-attempts">
                    You have used all {CR_LIMITS.attemptsPerDay} graded attempts on this exercise for the last 24 hours. Come back later: the limit moves with the day.
                </p>
            )}
            {block?.kind === 'not-gradable' && (
                <p role="note" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    This exercise has no findings to grade yet, so it cannot be attempted. An administrator has to add them.
                </p>
            )}
            <p role="status" className="sr-only" data-testid="wait-announce">{announcement}</p>
            {waiting && (
                <p aria-hidden="true" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="wait-notice">
                    Too many attempts too quickly. You can submit again in {waitText(waitSeconds)}.
                </p>
            )}
            {over && limits && (
                <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300" data-testid="over-limit">
                    Too many marks or lines for one answer: at most {limits.maxMarks} marks covering at most {limits.maxLines} lines. Remove some before you submit.
                </p>
            )}
            {error && <p role="alert" className="mb-4 text-sm text-red-800 dark:text-red-300" data-testid="submit-error">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
                {block?.kind === 'signed-out' ? null : (
                    <button type="button" className={btnPrimary} disabled={disabled} onClick={onSubmit} aria-busy={submitting || undefined} data-testid="submit-marks">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        {hasResult ? 'Submit again' : 'Submit marks'}{marks.length > 0 ? ` (${marks.length})` : ''}
                    </button>
                )}
                {marks.length > 0 && (
                    <button type="button" className={btnSecondary} onClick={() => onMarksChange([])} disabled={submitting}>Clear all marks</button>
                )}
                {attemptsLeft !== null && block?.kind !== 'signed-out' && (
                    <p className={`text-sm ${muted}`} data-testid="attempts-left">{attemptsLeft} graded {attemptsLeft === 1 ? 'attempt' : 'attempts'} left today on this exercise</p>
                )}
            </div>
        </section>
    );
}
