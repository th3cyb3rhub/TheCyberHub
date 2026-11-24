'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FlaskConical, Loader2, Search, Settings, X } from 'lucide-react';
import { btnPrimary, btnSecondary, focusRing, input, muted } from '@/components/events/styles';
import { TabBar } from '@/components/events/TabBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useLabCategories, useLabs } from '@/hooks/queries/useLabs';
import { categoryLabel, DIFFICULTY_LABELS, SORT_LABELS, VIEWER_STATUS_LABELS } from '@/lib/labs/display';
import {
    apiFilters, effectiveQuery, filtersFromParams, hasActiveFilters, isDefaultList, paramsWithChanges, SEARCH_DEBOUNCE_MS, SEARCH_MAX, SEARCH_MIN,
    type UrlFilters,
} from '@/lib/labs/filters';
import {
    LAB_CATEGORIES, LAB_DIFFICULTIES, LAB_SORTS, LAB_VIEWER_STATUSES, type LabCard as LabCardData, type LabCategory, type LabFacets, type Page,
} from '@/types/lab';
import { LabCard } from './LabCard';
import { LabsLeaderboard, LabsStatsCard } from './LeaderboardViews';
import { ErrorState, GridSkeleton } from './ListStates';

const chipClass = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${active
    ? 'border-orange-700 bg-orange-700 text-white'
    : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`;

interface ExplorerProps {
    initialPage: Page<LabCardData> | null;
    initialFacets: LabFacets | null;
    /** When the server built them (ms): the copy is as old as that, not as old as the page load */
    initialUpdatedAt?: number;
}

/** Search, filters and the grid. The filters live in the address, so a reload or a shared link shows the same list. */
export function LabsExplorer({ initialPage, initialFacets, initialUpdatedAt }: ExplorerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const { user } = useAuth();
    const signedIn = !!user;
    const isAdmin = !!user && (user.role === 'admin' || user.role === 'owner');
    const url: UrlFilters = filtersFromParams(new URLSearchParams(search.toString()));

    const update = (changes: Partial<Record<keyof UrlFilters, string | null>>) => {
        const qs = paramsWithChanges(new URLSearchParams(search.toString()), changes);
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    // The search box: typing is local; the address follows 300 ms after the last key
    const [text, setText] = useState(url.q);
    const pushed = useRef(url.q);
    useEffect(() => {
        // The address changed on its own (Clear, back button): the box follows it
        if (url.q !== pushed.current) { pushed.current = url.q; setText(url.q); }
    }, [url.q]);
    useEffect(() => {
        if (text === pushed.current) return;
        const timer = window.setTimeout(() => {
            pushed.current = text;
            const params = paramsWithChanges(new URLSearchParams(window.location.search), { q: text.trim() ? text : null });
            router.replace(params ? `${pathname}?${params}` : pathname, { scroll: false });
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [text, pathname, router]);

    const filters = apiFilters(url, signedIn);
    // The server renders the plain list only: any narrowing asks the API
    const plain = isDefaultList(url, signedIn);
    const query = useLabs(filters, plain ? initialPage : null, initialUpdatedAt);
    const facets = useLabCategories(initialFacets, initialUpdatedAt);

    const labs = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((c) => !seen.has(c._id) && !!seen.add(c._id));
    }, [query.data]);

    const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
    // `total` is counted on page 1 only: later pages say null, so read it from the first
    const total = query.data?.pages[0]?.pagination.total ?? null;
    const active = hasActiveFilters(url, signedIn);
    const clear = () => { setText(''); pushed.current = ''; update({ category: null, difficulty: null, status: null, q: null, sort: null }); };
    const shortSearch = text.trim().length > 0 && text.trim().length < SEARCH_MIN;

    const categoryOptions = useMemo(() => {
        const counts = new Map((facets.data?.categories ?? []).map((c) => [c.category, c.count]));
        const known: string[] = facets.data ? facets.data.categories.map((c) => c.category) : [...LAB_CATEGORIES];
        // A category in the address that has no published lab still has to be selectable
        if (url.category && !known.includes(url.category)) known.push(url.category);
        return known.map((c) => ({ id: c, label: counts.has(c) ? `${categoryLabel(c)} (${counts.get(c)})` : categoryLabel(c) }));
    }, [facets.data, url.category]);
    const difficultyCounts = new Map((facets.data?.difficulties ?? []).map((d) => [d.difficulty, d.count]));

    return (
        <div>
            {signedIn && <LabsStatsCard />}

            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <TabBar
                    label="Labs views"
                    idPrefix="labs-tab"
                    active={url.tab}
                    onChange={(id) => update({ tab: id })}
                    tabs={[{ id: 'labs', label: 'Labs' }, { id: 'leaderboard', label: 'Leaderboard' }]}
                />
                <nav aria-label="Labs shortcuts" className="flex flex-wrap gap-2">
                    {isAdmin && <Link href="/admin/labs" className={btnPrimary}><Settings className="h-4 w-4" aria-hidden="true" /> Manage labs</Link>}
                </nav>
            </div>

            <div id="labs-tab-panel" role="tabpanel" aria-labelledby={`labs-tab-${url.tab}`}>
            {url.tab === 'leaderboard' ? (
                <LabsLeaderboard category={url.category} onCategoryChange={(c: LabCategory | '') => update({ category: c || null })} />
            ) : (
            <>

            <div className="mb-6 space-y-4" role="search" aria-label="Filter labs">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="relative">
                        <label htmlFor="labs-search" className="sr-only">Search labs</label>
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                        <input
                            id="labs-search" type="search" value={text} maxLength={SEARCH_MAX} autoComplete="off"
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Search by title, tag or topic"
                            aria-describedby={shortSearch ? 'labs-search-hint' : undefined}
                            className={`${input} pl-10`}
                        />
                    </div>
                    <div>
                        <label htmlFor="labs-category" className="sr-only">Category</label>
                        <select id="labs-category" value={url.category} onChange={(e) => update({ category: e.target.value || null })} className={`${input} sm:!w-auto`}>
                            <option value="">All categories</option>
                            {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="labs-sort" className="sr-only">Sort by</label>
                        <select id="labs-sort" value={url.sort} onChange={(e) => update({ sort: e.target.value })} className={`${input} sm:!w-auto`}>
                            {LAB_SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
                        </select>
                    </div>
                </div>
                {shortSearch && <p id="labs-search-hint" className={`-mt-2 text-xs ${muted}`}>Type at least {SEARCH_MIN} characters to search.</p>}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div role="group" aria-label="Difficulty" className="flex flex-wrap gap-2">
                        <button type="button" aria-pressed={!url.difficulty} onClick={() => update({ difficulty: null })} className={chipClass(!url.difficulty)}>All levels</button>
                        {LAB_DIFFICULTIES.map((d) => (
                            <button key={d} type="button" aria-pressed={url.difficulty === d} onClick={() => update({ difficulty: d })} className={chipClass(url.difficulty === d)}>
                                {DIFFICULTY_LABELS[d]}{difficultyCounts.has(d) ? ` (${difficultyCounts.get(d)})` : ''}
                            </button>
                        ))}
                    </div>
                    {signedIn && (
                        <div role="group" aria-label="My progress" className="flex flex-wrap gap-2">
                            <button type="button" aria-pressed={!url.status} onClick={() => update({ status: null })} className={chipClass(!url.status)}>Any progress</button>
                            {LAB_VIEWER_STATUSES.map((s) => (
                                <button key={s} type="button" aria-pressed={url.status === s} onClick={() => update({ status: s })} className={chipClass(url.status === s)}>{VIEWER_STATUS_LABELS[s]}</button>
                            ))}
                        </div>
                    )}
                    {active && <button type="button" onClick={clear} className={btnSecondary}><X className="h-4 w-4" aria-hidden="true" /> Clear filters</button>}
                </div>
            </div>

            {query.isLoading ? (
                <GridSkeleton />
            ) : query.isError && labs.length === 0 ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load labs" />
            ) : labs.length === 0 ? (
                <EmptyState
                    icon={FlaskConical}
                    title={active ? 'No labs match these filters' : 'No labs are published yet'}
                    description={active ? 'Try another category or difficulty, or clear the filters.' : 'New exercises are added by the team. Check back soon.'}
                    actionLabel={active ? 'Clear filters' : undefined}
                    onAction={active ? clear : undefined}
                />
            ) : (
                <div aria-busy={query.isPlaceholderData || undefined}>
                    <p className={`mb-4 text-sm ${muted}`} aria-live="polite" data-testid="lab-count">
                        {total !== null && total > labs.length ? `Showing ${labs.length} of ${total} labs` : `${labs.length} ${labs.length === 1 ? 'lab' : 'labs'}`}
                        {effectiveQuery(url.q) && <> matching &ldquo;{effectiveQuery(url.q)}&rdquo;</>}
                    </p>
                    <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${query.isPlaceholderData ? 'opacity-60' : ''}`} data-testid="lab-grid">
                        {labs.map((lab) => <LabCard key={lab._id} lab={lab} />)}
                    </div>
                    {query.isError && (
                        <p role="alert" className="mt-4 text-center text-sm text-red-800 dark:text-red-300">Could not load more labs. <button type="button" className="underline" onClick={() => void fetchNextPage()}>Try again</button></p>
                    )}
                    {hasNextPage && (
                        <div className="mt-8 text-center">
                            <button type="button" className={btnSecondary} disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                                {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                            </button>
                        </div>
                    )}
                </div>
            )}
            </>
            )}
            </div>
        </div>
    );
}
