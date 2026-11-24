'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Loader2, Settings, Trophy } from 'lucide-react';
import { btnPrimary, btnSecondary, focusRing, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useCtfCompetitions } from '@/hooks/queries/useCtf';
import { LIST_FILTER_LABELS } from '@/lib/ctf/constants';
import { isCtfWriter } from '@/lib/ctf/roles';
import { effectiveCtfStatus } from '@/lib/ctf/status';
import { useNow } from '@/lib/events/clock';
import { CTF_LIST_FILTERS, type CtfCompetitionCard, type CtfListFilter, type CtfPage } from '@/types/ctf';
import { CompetitionCard } from './CompetitionCard';
import { ErrorState, GridSkeleton } from './ListStates';

const chipClass = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${active
    ? 'border-orange-700 bg-orange-700 text-white'
    : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`;

export const filterHref = (filter: CtfListFilter) => (filter === 'all' ? '/ctf/competitions' : `/ctf/competitions?status=${filter}`);

const EMPTY: Record<CtfListFilter, { title: string; description: string }> = {
    all: { title: 'No competitions yet', description: 'Competitions are announced here before they start. Check back soon.' },
    live: { title: 'Nothing is running right now', description: 'See what is coming up, or look at past competitions.' },
    upcoming: { title: 'No competition is scheduled', description: 'New dates are announced here as soon as they are set.' },
    ended: { title: 'No past competitions yet', description: 'Results of finished competitions appear here.' },
};

/** The status tabs. Links, so the list works without scripts and the address is the state. */
export function FilterTabs({ filter }: { filter: CtfListFilter }) {
    return (
        <nav aria-label="Filter competitions by status" className="flex flex-wrap gap-2">
            {CTF_LIST_FILTERS.map((f) => (
                <Link key={f} href={filterHref(f)} scroll={false} aria-current={filter === f ? 'page' : undefined} className={chipClass(filter === f)} data-testid={`filter-${f}`}>
                    {LIST_FILTER_LABELS[f]}
                </Link>
            ))}
        </nav>
    );
}

interface Props {
    filter: CtfListFilter;
    initialPage: CtfPage<CtfCompetitionCard> | null;
    initialUpdatedAt?: number;
}

/** Featured competition first when one is running or coming, then the cards, with "load more" */
export function CompetitionsExplorer({ filter, initialPage, initialUpdatedAt }: Props) {
    const { user } = useAuth();
    const query = useCtfCompetitions({ status: filter }, initialPage, initialUpdatedAt);
    const now = useNow(30_000);

    const items = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((c) => !seen.has(c._id) && !!seen.add(c._id));
    }, [query.data]);
    const withStatus = items.map((c) => ({ c, status: now ? effectiveCtfStatus(c, now) : c.status }));
    const highlight = filter === 'ended' ? undefined : withStatus.find((x) => x.c.isFeatured && x.status !== 'ended' && x.status !== 'cancelled');
    const rest = highlight ? withStatus.filter((x) => x !== highlight) : withStatus;
    const total = query.data?.pages[0]?.pagination.total ?? null;

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <FilterTabs filter={filter} />
                {isCtfWriter(user?.role) && <Link href="/admin/ctf" className={btnPrimary}><Settings className="h-4 w-4" aria-hidden="true" /> Manage competitions</Link>}
            </div>

            {query.isLoading ? (
                <GridSkeleton />
            ) : query.isError && items.length === 0 ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load competitions" />
            ) : items.length === 0 ? (
                <EmptyState icon={Trophy} title={EMPTY[filter].title} description={EMPTY[filter].description} actionLabel={filter === 'all' ? 'Practice challenges' : 'Show all competitions'} actionHref={filter === 'all' ? '/ctf' : '/ctf/competitions'} />
            ) : (
                <div aria-busy={query.isPlaceholderData || undefined}>
                    <p className={`mb-4 text-sm ${muted}`} aria-live="polite" data-testid="ctf-count">
                        {total !== null && total > items.length ? `Showing ${items.length} of ${total} competitions` : `${items.length} ${items.length === 1 ? 'competition' : 'competitions'}`}
                    </p>
                    {highlight && <div className="mb-5" data-testid="featured"><CompetitionCard competition={highlight.c} status={highlight.status} featured /></div>}
                    <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${query.isPlaceholderData ? 'opacity-60' : ''}`} data-testid="ctf-grid">
                        {rest.map(({ c, status }) => <CompetitionCard key={c._id} competition={c} status={status} />)}
                    </div>
                    {query.isError && (
                        <p role="alert" className="mt-4 text-center text-sm text-red-800 dark:text-red-300">Could not load more competitions. <button type="button" className="underline" onClick={() => void query.fetchNextPage()}>Try again</button></p>
                    )}
                    {query.hasNextPage && (
                        <div className="mt-8 text-center">
                            <button type="button" className={btnSecondary} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                                {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
