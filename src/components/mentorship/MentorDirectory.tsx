'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, SearchX, UserPlus, X } from 'lucide-react';
import { useMentorList } from '@/hooks/queries/useMentorship';
import { EXPERTISE_AREAS, expertiseLabel } from '@/lib/mentorship/display';
import { filtersFromParams, filtersToParams, hasActiveFilters, MIN_RATINGS, SORTS } from '@/lib/mentorship/filters';
import type { ExpertiseArea, MentorListFilters } from '@/types/mentorship';
import { MentorCard } from './MentorCard';
import { CardSkeleton, EmptyBlock, ErrorState, LoadMore } from './shared';
import { btnGhost, btnPrimary, btnSecondary, card, input, label, muted } from './styles';

/** Filters live in the URL, so a filtered directory can be shared and the back button works */
export function MentorDirectory() {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const filters = useMemo(() => filtersFromParams(params), [params]);
    const [draft, setDraft] = useState(filters.search ?? '');

    const apply = (next: MentorListFilters) => router.replace(`${pathname}${filtersToParams(next)}`, { scroll: false });

    // The URL is the truth: keep the box in step when the filters change from outside (back button, clear)
    useEffect(() => { setDraft(filters.search ?? ''); }, [filters.search]);
    useEffect(() => {
        const id = window.setTimeout(() => {
            const next = draft.trim();
            if (next !== (filters.search ?? '') && (next.length === 0 || next.length >= 2)) apply({ ...filters, search: next || undefined });
        }, 350);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);

    const query = useMentorList(filters);
    const mentors = query.data?.pages.flatMap((p) => p.data) ?? [];
    const total = query.data?.pages[0]?.pagination.total ?? 0;
    const active = hasActiveFilters(filters);

    const toggleArea = (area: ExpertiseArea) => {
        const current = filters.expertise ?? [];
        const expertise = current.includes(area) ? current.filter((a) => a !== area) : [...current, area];
        apply({ ...filters, expertise: expertise.length ? expertise : undefined });
    };

    return (
        <section aria-labelledby="directory-heading" id="directory">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="directory-heading" className="text-xl font-bold text-gray-900 dark:text-white">Find a mentor</h2>
                    <p className={`text-sm ${muted}`} aria-live="polite">
                        {query.isSuccess ? `${total} ${total === 1 ? 'mentor' : 'mentors'}${active ? ' match your filters' : ' listed'}` : ' '}
                    </p>
                </div>
            </div>

            <div className={`${card} mb-6 space-y-4 p-4`}>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                    <div>
                        <label htmlFor="mentor-search" className="sr-only">Search mentors</label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                            <input id="mentor-search" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search by name, topic or bio" maxLength={100} className={`${input} pl-9`} />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="mentor-rating" className="sr-only">Minimum rating</label>
                        <select id="mentor-rating" className={input} value={filters.minRating ?? 0} onChange={(e) => apply({ ...filters, minRating: Number(e.target.value) || undefined })}>
                            {MIN_RATINGS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="mentor-sort" className="sr-only">Sort by</label>
                        <select id="mentor-sort" className={input} value={filters.sort ?? 'relevance'} onChange={(e) => apply({ ...filters, sort: e.target.value as MentorListFilters['sort'] })}>
                            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>
                </div>

                <fieldset>
                    <legend className={label}>Topics</legend>
                    <div className="flex flex-wrap gap-2">
                        {EXPERTISE_AREAS.map((area) => {
                            const on = filters.expertise?.includes(area) ?? false;
                            return (
                                <label key={area} className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm transition-colors focus-within:ring-2 focus-within:ring-orange-500 ${on ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>
                                    <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleArea(area)} />
                                    {expertiseLabel(area)}
                                </label>
                            );
                        })}
                    </div>
                </fieldset>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={filters.hasCapacity !== false} onChange={(e) => apply({ ...filters, hasCapacity: e.target.checked ? undefined : false })} />
                        Only mentors with a free spot
                    </label>
                    {active && (
                        <button type="button" className={`${btnGhost} !py-1.5`} onClick={() => { setDraft(''); apply({}); }}>
                            <X className="h-4 w-4" aria-hidden="true" /> Clear filters
                        </button>
                    )}
                </div>
            </div>

            {query.isLoading ? (
                <CardSkeleton count={6} label="Loading mentors" />
            ) : query.isError ? (
                <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load mentors" />
            ) : mentors.length === 0 ? (
                active ? (
                    <EmptyBlock icon={SearchX} title="No mentors match" action={<button type="button" className={btnSecondary} onClick={() => { setDraft(''); apply({}); }}>Clear filters</button>}>
                        Try fewer filters, or let us suggest mentors for you with Match me.
                    </EmptyBlock>
                ) : (
                    <EmptyBlock icon={UserPlus} title="Mentors are joining" action={<Link href="/mentorship/become-mentor" className={btnPrimary}>Apply to be the first</Link>}>
                        No mentor is listed yet. If you have experience to share, apply: the team reviews every application.
                    </EmptyBlock>
                )
            ) : (
                <>
                    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="mentor-list">
                        {mentors.map((m) => <MentorCard key={m._id} mentor={m} />)}
                    </ul>
                    <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} label="Show more mentors" />
                </>
            )}
        </section>
    );
}
