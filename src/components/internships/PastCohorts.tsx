'use client';

import { ExternalLink, Github, Loader2, Trophy } from 'lucide-react';
import { btnSecondary, card, chip, focusRing, muted } from '@/components/events/styles';
import { usePastInternships } from '@/hooks/queries/useInternships';
import { excerpt, hostOf, safeHref, TYPE_LABELS } from '@/lib/internships/display';
import type { PastCohort, ShowcaseProject } from '@/types/internship';
import { ErrorState, ListSkeleton } from './ListStates';
import { ViewerTime } from './ViewerTime';

/** Links come from members of staff but are still untrusted: http(s) only, no referrer, no ranking credit */
export const EXTERNAL_REL = 'noopener noreferrer nofollow ugc';

export function ShowcaseLink({ url, label, kind }: { url?: string | null; label: string; kind: 'demo' | 'repo' }) {
    const href = safeHref(url);
    if (!href) return null;
    const Icon = kind === 'repo' ? Github : ExternalLink;
    return (
        <a href={href} target="_blank" rel={EXTERNAL_REL} className={`inline-flex items-center gap-1 rounded text-sm font-medium text-orange-800 underline hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-200 ${focusRing}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
            <span className="sr-only"> ({hostOf(href)}, opens in a new tab)</span>
        </a>
    );
}

export function ShowcaseList({ projects }: { projects: ShowcaseProject[] }) {
    if (projects.length === 0) return null;
    return (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Showcase projects">
            {projects.map((p, i) => (
                <li key={`${p.title}-${i}`} className="rounded-xl border border-gray-200 p-4 dark:border-neutral-800" data-testid="showcase-project">
                    <h4 className="font-semibold text-gray-900 dark:text-white">{p.title}</h4>
                    {p.description && <p className={`mt-1 text-sm ${muted}`}>{excerpt(p.description, 240)}</p>}
                    {!!p.teamMembers?.length && <p className={`mt-2 text-xs ${muted}`}>By {p.teamMembers.join(', ')}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                        <ShowcaseLink url={p.demoLink} label="Demo" kind="demo" />
                        <ShowcaseLink url={p.repoLink} label="Code" kind="repo" />
                    </div>
                </li>
            ))}
        </ul>
    );
}

function PastCard({ cohort }: { cohort: PastCohort }) {
    return (
        <article className={`${card} p-5`} data-testid="past-cohort">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`${chip} bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-300`}><Trophy className="h-3 w-3" aria-hidden="true" /> Completed</span>
                <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{TYPE_LABELS[cohort.type] ?? cohort.type}</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{cohort.title}</h3>
            <p className={`mb-1 text-sm ${muted}`}><ViewerTime iso={cohort.startDate} /> to <ViewerTime iso={cohort.endDate} /></p>
            <p className={`mb-4 text-sm ${muted}`}>{excerpt(cohort.description, 240)}</p>
            {cohort.technologies.length > 0 && (
                <ul className="mb-4 flex flex-wrap gap-1.5" aria-label="Technologies">
                    {cohort.technologies.slice(0, 8).map((t) => <li key={t} className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{t}</li>)}
                </ul>
            )}
            <ShowcaseList projects={cohort.showcaseProjects} />
        </article>
    );
}

/** Completed cohorts and what they built. Hidden while there is nothing to show. */
export function PastCohorts() {
    const query = usePastInternships();
    const cohorts = query.data?.pages.flatMap((p) => p.data) ?? [];

    if (query.isLoading) return <section aria-labelledby="past-heading" className="mt-16"><h2 id="past-heading" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Past programs</h2><ListSkeleton count={2} label="Loading past programs" /></section>;
    if (query.isError) return <section aria-labelledby="past-heading" className="mt-16"><h2 id="past-heading" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Past programs</h2><ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load past programs" /></section>;
    if (cohorts.length === 0) return null;

    return (
        <section aria-labelledby="past-heading" className="mt-16" data-testid="past-section">
            <h2 id="past-heading" className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">Past programs</h2>
            <p className={`mb-5 text-sm ${muted}`}>What earlier cohorts built.</p>
            <div className="grid gap-5 lg:grid-cols-2">
                {cohorts.map((c) => <PastCard key={c._id} cohort={c} />)}
            </div>
            {query.hasNextPage && (
                <div className="mt-6 text-center">
                    <button type="button" className={btnSecondary} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                        {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Show more past programs
                    </button>
                </div>
            )}
        </section>
    );
}
