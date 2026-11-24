'use client';

import { History } from 'lucide-react';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { cardPad, chip, muted } from '@/components/events/styles';
import { useAttempts } from '@/hooks/queries/useCodeReview';
import { formatScore, plural } from '@/lib/codeReview/display';
import { crErrorMessage } from '@/lib/codeReview/errors';

/** My last graded attempts on this exercise, newest first (the API keeps the last 20) */
export function AttemptHistory({ slug, enabled }: { slug: string; enabled: boolean }) {
    const query = useAttempts(slug, enabled);
    if (!enabled) return null;
    return (
        <section aria-labelledby="cr-history" className={cardPad} data-testid="attempt-history">
            <h2 id="cr-history" className="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
                <History className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Your attempts
            </h2>
            {query.isLoading ? (
                <p className={`text-sm ${muted}`} role="status">Loading your attempts.</p>
            ) : query.isError ? (
                <p role="alert" className="text-sm text-red-800 dark:text-red-300">
                    {crErrorMessage(query.error)} <button type="button" className="underline" onClick={() => void query.refetch()}>Try again</button>
                </p>
            ) : (query.data ?? []).length === 0 ? (
                <p className={`text-sm ${muted}`}>No graded attempts yet. Your first one opens the solution.</p>
            ) : (
                <ol className="space-y-2" aria-label="Attempts, newest first">
                    {(query.data ?? []).map((a) => (
                        <li key={a.attemptId || a.createdAt} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-neutral-800" data-testid="attempt-row">
                            <span className="font-semibold text-gray-900 dark:text-white">{a.percent}%</span>
                            <span className={muted}>{formatScore(a.score)} of {formatScore(a.maxScore)}</span>
                            <span className={`${chip} ${a.passed ? 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200'}`}>{a.passed ? 'Passed' : 'Not passed'}</span>
                            <span className={muted}>{plural(a.matchedCount, 'found', 'found')}, {plural(a.falsePositives, 'false mark')}, {plural(a.marks.length, 'mark')}</span>
                            <ViewerTime iso={a.createdAt} kind="moment" className={`ml-auto text-xs ${muted}`} />
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
