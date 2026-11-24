import Link from 'next/link';
import { Code2, Lightbulb, Search, Star, Users } from 'lucide-react';
import { card, focusRing, muted } from '@/components/events/styles';
import { languageLabel } from '@/lib/codeReview/constants';
import { plural } from '@/lib/codeReview/display';
import type { CrCard } from '@/types/codeReview';
import { CategoryChip, DifficultyBadge, StatusBadge } from './Badges';

/** What the member's own progress comes to on a card, in words */
export function progressText(p: NonNullable<CrCard['progress']>): string {
    if (p.status === 'passed') return p.pointsEarned > 0 ? `Passed: ${p.pointsEarned} points earned` : 'Passed';
    if (p.status === 'in-progress') return `Best ${p.bestPercent}% in ${plural(p.attempts, 'attempt')}`;
    return '';
}

/** One exercise in the list. No hooks, so the server can render it too. The title link covers the card. */
export function SnippetCard({ snippet }: { snippet: CrCard }) {
    const tags = snippet.tags.slice(0, 3);
    const p = snippet.progress;
    const text = p ? progressText(p) : '';
    return (
        <article className={`${card} relative flex flex-col gap-3 p-5 transition-colors focus-within:ring-2 focus-within:ring-orange-500 hover:border-orange-400 dark:hover:border-orange-500/60`} data-testid="cr-card" data-slug={snippet.slug} data-status={p?.status ?? 'none'}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <DifficultyBadge difficulty={snippet.difficulty} />
                {p && <StatusBadge status={p.status} />}
            </div>
            <div className="min-w-0">
                <h2 className="break-words text-base font-semibold leading-snug text-gray-900 dark:text-white">
                    <Link href={`/code-review/${encodeURIComponent(snippet.slug)}`} className={`rounded after:absolute after:inset-0 after:rounded-2xl ${focusRing} focus-visible:ring-0 focus-visible:ring-offset-0`}>{snippet.title}</Link>
                </h2>
                <p className="mt-2 flex flex-wrap items-center gap-1.5">
                    <CategoryChip category={snippet.category} />
                    <span className={`text-xs ${muted}`}>{languageLabel(snippet.language)}</span>
                </p>
            </div>
            {snippet.summary && <p className={`line-clamp-3 break-words text-sm ${muted}`}>{snippet.summary}</p>}
            {tags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                    {tags.map((t) => <li key={t} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-neutral-800 dark:text-gray-300">{t}</li>)}
                </ul>
            )}
            {text && <p className="text-sm font-medium text-gray-900 dark:text-white" data-testid="card-progress">{text}</p>}
            <ul className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-700 dark:border-neutral-800 dark:text-gray-300" aria-label="Exercise details">
                <li className="inline-flex items-center gap-1 font-semibold text-gray-900 dark:text-white"><Star className="h-3.5 w-3.5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> {snippet.points} pts</li>
                <li className="inline-flex items-center gap-1"><Search className="h-3.5 w-3.5" aria-hidden="true" /> {plural(snippet.findingCount, 'issue')}</li>
                <li className="inline-flex items-center gap-1"><Code2 className="h-3.5 w-3.5" aria-hidden="true" /> {plural(snippet.lineCount, 'line')}</li>
                <li className="inline-flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5" aria-hidden="true" /> {plural(snippet.hintCount, 'hint')}</li>
                <li className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" /> {snippet.solveCount} passed</li>
            </ul>
        </article>
    );
}
