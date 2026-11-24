'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Bookmark, Info, Loader2 } from 'lucide-react';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { btnSecondary, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSavedJobs } from '@/hooks/queries/useJobs';
import { JobCard } from './JobCard';
import { ErrorState, ListSkeleton } from './ListStates';
import { SaveJobButton } from './SaveJobButton';

/** The jobs a member saved, newest save first. A saved job that closed or ended since is not listed; the count says so. */
export function SavedJobsView() {
    const { user, ready } = useRequireLogin('/jobs/saved');
    const query = useSavedJobs();

    const items = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((j) => !seen.has(j._id) && !!seen.add(j._id));
    }, [query.data]);
    // The API counts these per page; the pages loaded so far add up
    const unavailable = query.data?.pages.reduce((sum, p) => sum + (p.unavailable ?? 0), 0) ?? 0;

    if (!ready || !user) return <FullPageSpinner />;

    return (
        <PageShell title="Saved jobs" subtitle="Jobs you bookmarked. Save a job from its page or from the list." backHref="/jobs" backLabel="All jobs" wide>
            {query.isLoading ? (
                <ListSkeleton label="Loading saved jobs" />
            ) : query.isError && items.length === 0 ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load your saved jobs" />
            ) : (
                <>
                    {unavailable > 0 && (
                        <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-gray-200" data-testid="unavailable-note">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            {unavailable === 1 ? '1 saved job is' : `${unavailable} saved jobs are`} no longer available: closed, ended or removed.
                        </p>
                    )}
                    {items.length === 0 ? (
                        <EmptyState icon={Bookmark} title="No saved jobs" description="Use the bookmark on a job to keep it here." actionLabel="Browse jobs" actionHref="/jobs" />
                    ) : (
                        <>
                            <p className={`mb-4 text-sm ${muted}`}>{items.length} saved {items.length === 1 ? 'job' : 'jobs'}</p>
                            <ul className="space-y-4" aria-label="Saved jobs" data-testid="saved-list">
                                {items.map((job) => (
                                    <li key={job._id}><JobCard job={job} saveSlot={<SaveJobButton id={job._id} title={job.title} saved variant="icon" />} /></li>
                                ))}
                            </ul>
                            {query.hasNextPage && (
                                <div className="mt-8 text-center">
                                    <button type="button" className={btnSecondary} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                                        {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                    <p className={`mt-8 text-sm ${muted}`}><Link href="/jobs" className="text-orange-800 underline dark:text-orange-400">Browse all jobs</Link></p>
                </>
            )}
        </PageShell>
    );
}
