import { IntentLink } from '@/components/ui/IntentLink';
import { Clock, FileText, Lightbulb, Star, Users } from 'lucide-react';
import { card, focusRing, muted } from '@/components/events/styles';
import { categoryLabel, minutesLabel } from '@/lib/labs/display';
import type { LabCard as LabCardData } from '@/types/lab';
import { DifficultyBadge, ViewerStatusBadge } from './StatusBadges';

/** One lab in the list. No hooks, so the server can render it too. The title link covers the card. */
export function LabCard({ lab }: { lab: LabCardData }) {
    const time = minutesLabel(lab.estimatedMinutes);
    const tags = lab.tags.slice(0, 3);
    return (
        <article className={`${card} relative flex flex-col gap-3 p-5 transition-colors focus-within:ring-2 focus-within:ring-orange-500 hover:border-orange-400 dark:hover:border-orange-500/60`} data-testid="lab-card" data-slug={lab.slug} data-my-status={lab.myStatus ?? 'none'}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <DifficultyBadge difficulty={lab.difficulty} />
                {lab.myStatus && <ViewerStatusBadge status={lab.myStatus} />}
            </div>
            <div className="min-w-0">
                <h2 className="break-words text-base font-semibold leading-snug text-gray-900 dark:text-white">
                    <IntentLink href={`/labs/${lab.slug}`} className={`rounded after:absolute after:inset-0 after:rounded-2xl ${focusRing} focus-visible:ring-0 focus-visible:ring-offset-0`}>{lab.title}</IntentLink>
                </h2>
                <p className={`mt-1 text-xs ${muted}`}>
                    {categoryLabel(lab.category)}
                    {time && <> {'·'} <Clock className="-mt-0.5 inline h-3 w-3" aria-hidden="true" /> {time}</>}
                </p>
            </div>
            {lab.summary && <p className={`line-clamp-3 text-sm ${muted}`}>{lab.summary}</p>}
            {tags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                    {tags.map((t) => <li key={t} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-neutral-800 dark:text-gray-300">{t}</li>)}
                </ul>
            )}
            <ul className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-700 dark:border-neutral-800 dark:text-gray-300" aria-label="Lab details">
                <li className="inline-flex items-center gap-1 font-semibold text-gray-900 dark:text-white"><Star className="h-3.5 w-3.5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> {lab.points} pts</li>
                <li className="inline-flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5" aria-hidden="true" /> {lab.hintCount} {lab.hintCount === 1 ? 'hint' : 'hints'}</li>
                {lab.fileCount > 0 && <li className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" aria-hidden="true" /> {lab.fileCount} {lab.fileCount === 1 ? 'file' : 'files'}</li>}
                <li className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" /> {lab.completionCount} solved</li>
            </ul>
        </article>
    );
}
