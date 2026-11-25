'use client';

import { forwardRef } from 'react';
import { Award, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { cardPad, chip, muted } from '@/components/events/styles';
import { CR_RULES } from '@/lib/codeReview/constants';
import { formatScore, plural, pointsText } from '@/lib/codeReview/display';
import { describeRange } from '@/lib/codeReview/selection';
import type { CrAttemptResult, CrMark } from '@/types/codeReview';
import { FindingCard } from './FindingCard';

const VERDICT = {
    matched: { text: 'Matched a finding', icon: CheckCircle2, className: 'text-green-800 dark:text-green-300' },
    duplicate: { text: 'Repeat of a mark that already matched (free)', icon: MinusCircle, className: 'text-gray-700 dark:text-gray-300' },
    unmatched: { text: `Matched nothing (costs ${CR_RULES.falseMarkPenalty} points)`, icon: XCircle, className: 'text-red-800 dark:text-red-300' },
} as const;

/** Why a first pass paid nothing, in words. The API decides; this only explains the two cases it documents. */
function zeroPointsReason({ solutionViewed, staff }: { solutionViewed: boolean; staff: boolean }): string {
    if (staff) return 'Staff accounts are graded like everybody else but never earn points.';
    if (solutionViewed) return 'You opened the solution before passing, so this pass pays 0 points. Points are paid once, on the first pass.';
    return 'This pass paid 0 points.';
}

/**
 * What the server graded: the score and whether it passes, what was paid, the findings the member
 * found with their explanation, and how many were missed and how many marks were wrong. The missed
 * findings are never shown (only counted): they stay in the solution.
 */
export const ResultView = forwardRef<HTMLDivElement, {
    result: CrAttemptResult;
    /** The marks that were sent, in the order they were sent */
    marks: CrMark[];
    findingCount: number;
    staff: boolean;
    solutionViewed: boolean;
}>(function ResultView({ result, marks, findingCount, staff, solutionViewed }, ref) {
    const passLine = Math.min(100, Math.max(0, result.passPercent));
    const percent = Math.min(100, Math.max(0, result.percent));
    const found = result.matched.length;
    const total = findingCount || found + result.missedCount;
    return (
        <section aria-labelledby="cr-result" className={`${cardPad} outline-none`} tabIndex={-1} ref={ref} data-testid="result" data-passed={result.passed ? 'true' : 'false'}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 id="cr-result" className="text-xl font-semibold text-gray-900 dark:text-white">Result</h2>
                <span className={`${chip} text-sm ${result.passed ? 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300'}`} data-testid="pass-state">
                    {result.passed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                    {result.passed ? 'Passed' : 'Not passed yet'}
                </span>
            </div>

            <p className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="score">
                {formatScore(result.score)} <span className="text-lg font-medium text-gray-600 dark:text-gray-400">of {formatScore(result.maxScore)} points ({result.percent}%)</span>
            </p>
            <div className="relative mt-3 h-3 rounded-full bg-gray-200 dark:bg-neutral-800" role="img" aria-label={`Score ${result.percent} percent. A pass needs ${result.passPercent} percent.`}>
                <div className={`h-3 rounded-full ${result.passed ? 'bg-green-600 dark:bg-green-500' : 'bg-orange-600 dark:bg-orange-500'}`} style={{ width: `${percent}%` }} />
                <div className="absolute -top-1 bottom-[-4px] w-0.5 bg-gray-900 dark:bg-white" style={{ left: `${passLine}%` }} aria-hidden="true" />
            </div>
            <p className={`mt-2 text-xs ${muted}`}>A pass needs {result.passPercent}% of the best possible score (the line on the bar).</p>

            <dl className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-neutral-800/60" data-testid="found-count">
                    <dt className={muted}>Findings found</dt>
                    <dd className="text-lg font-semibold text-gray-900 dark:text-white">{found} of {total}</dd>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-neutral-800/60" data-testid="missed-count">
                    <dt className={muted}>Still hidden</dt>
                    <dd className="text-lg font-semibold text-gray-900 dark:text-white">{result.missedCount}</dd>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-neutral-800/60" data-testid="false-count">
                    <dt className={muted}>Marks that matched nothing</dt>
                    <dd className="text-lg font-semibold text-gray-900 dark:text-white">{result.falsePositives}</dd>
                </div>
            </dl>
            {result.missedCount > 0 && (
                <p className={`mt-2 text-sm ${muted}`}>The findings you missed are not shown. Look at the code again, or open a hint.</p>
            )}

            <div className="mt-5 rounded-xl border border-gray-200 p-4 text-sm dark:border-neutral-800" data-testid="points-line">
                {result.firstPass && result.pointsAwarded > 0 && (
                    <p className="flex items-center gap-2 font-semibold text-green-800 dark:text-green-300"><Award className="h-5 w-5" aria-hidden="true" /> You earned {pointsText(result.pointsAwarded)} for this first pass.</p>
                )}
                {result.firstPass && result.pointsAwarded === 0 && (
                    <p className="text-gray-800 dark:text-gray-200">{zeroPointsReason({ solutionViewed, staff })}</p>
                )}
                {!result.firstPass && result.passed && (
                    <p className="text-gray-800 dark:text-gray-200">You passed again. Points are paid once, on the first pass, so this one pays nothing more.</p>
                )}
                {!result.passed && (
                    <p className="text-gray-800 dark:text-gray-200">
                        {result.pointsAvailable > 0
                            ? <>A pass would pay up to <strong>{pointsText(result.pointsAvailable)}</strong> now. Every graded attempt before the passing one takes {CR_RULES.attemptDecayPercent}% off, up to {CR_RULES.attemptDecayMaxPercent}%.</>
                            : 'No points can be earned on this exercise any more, but you can still pass it.'}
                    </p>
                )}
                <p className={`mt-1 ${muted}`}>
                    {plural(result.attempts, 'graded attempt')} so far, {result.attemptsLeftToday} left today. Best score: {result.bestPercent}%.
                    {result.hintsUsed > 0 && <> {plural(result.hintsUsed, 'hint')} opened.</>}
                </p>
            </div>

            {result.newBadges.length > 0 && (
                <div className="mt-4" data-testid="new-badges">
                    <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">New {result.newBadges.length === 1 ? 'badge' : 'badges'}</h3>
                    <ul className="flex flex-wrap gap-2">
                        {result.newBadges.map((b) => (
                            <li key={b.code || b.name} className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>
                                <Award className="h-3 w-3" aria-hidden="true" /> {b.name}{b.rarity ? ` (${b.rarity})` : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {marks.length > 0 && (
                <div className="mt-5">
                    <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">What happened to each mark</h3>
                    <ul className="space-y-1.5 text-sm" data-testid="mark-verdicts">
                        {marks.map((m, i) => {
                            const verdict = result.marks.find((v) => v.index === i)?.result ?? 'unmatched';
                            const v = VERDICT[verdict];
                            const Icon = v.icon;
                            return (
                                <li key={`${m.lineStart}-${m.lineEnd}-${i}`} className={`flex items-start gap-2 ${v.className}`} data-verdict={verdict}>
                                    <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span><strong>{describeRange({ start: m.lineStart, end: m.lineEnd }).replace(/^./, (c) => c.toUpperCase())}:</strong> {v.text}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {result.matched.length > 0 && (
                <div className="mt-5">
                    <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">Findings you found</h3>
                    <ul className="space-y-3">
                        {result.matched.map((f) => (
                            <FindingCard
                                key={`${f.findingIndex}-${f.markIndex}`}
                                finding={f}
                                index={f.findingIndex}
                                note={(
                                    <p className="mb-2 text-xs text-gray-700 dark:text-gray-300" data-testid="finding-points">
                                        +{formatScore(f.points)} points
                                        {f.typeCorrect === true && ' (type correct)'}
                                        {f.typeCorrect === false && ` (a different type than the one you named: it earns ${CR_RULES.wrongTypeFactor}% of the points)`}
                                    </p>
                                )}
                            />
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
});
