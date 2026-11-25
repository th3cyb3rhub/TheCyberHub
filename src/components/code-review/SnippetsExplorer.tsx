'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Code2, Loader2, Search, Settings, X } from 'lucide-react';
import { btnPrimary, btnSecondary, focusRing, input, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useCodeReviewStats, useCodeSnippets } from '@/hooks/queries/useCodeReview';
import { DIFFICULTY_LABELS, SORT_CHOICES, STATUS_LABELS, categoryLabel, languageLabel } from '@/lib/codeReview/constants';
import {
    apiFilters, effectiveQuery, filtersFromParams, hasActiveFilters, isDefaultList, paramsWithChanges, SEARCH_DEBOUNCE_MS, SEARCH_MAX, SEARCH_MIN,
    type UrlFilters,
} from '@/lib/codeReview/filters';
import { isCrReader } from '@/lib/codeReview/roles';
import { CR_CATEGORIES, CR_DIFFICULTIES, CR_LANGUAGES, CR_VIEWER_STATUSES, type CrCard, type CrPage, type CrStats } from '@/types/codeReview';
import { ErrorState, GridSkeleton } from './ListStates';
import { SnippetCard } from './SnippetCard';
import { StatsHeader } from './StatsHeader';

const chipClass = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${active
    ? 'border-orange-700 bg-orange-700 text-white'
    : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`;

/**
 * The options of a filter: what the API counts (from the totals), or the known values before they
 * arrive. Only values the list accepts are offered: an old value in the totals would be an option
 * that filters nothing.
 */
function options(known: readonly string[], counted: { id: string; count: number }[] | undefined, current: string, label: (id: string) => string) {
    const usable = counted?.filter((c) => known.includes(c.id));
    const counts = new Map((usable ?? []).map((c) => [c.id, c.count]));
    const ids = usable ? usable.map((c) => c.id) : [...known];
    if (current && !ids.includes(current) && known.includes(current)) ids.push(current);
    return ids.map((id) => ({ id, label: counts.has(id) ? `${label(id)} (${counts.get(id)})` : label(id) }));
}

interface ExplorerProps {
    initialPage: CrPage<CrCard> | null;
    initialStats: CrStats | null;
    /** When the server built them (ms): the copy is as old as that, not as old as the page load */
    initialUpdatedAt?: number;
}

/** Search, filters, progress header and the grid. The filters live in the address, so a reload or a shared link shows the same list. */
export function SnippetsExplorer({ initialPage, initialStats, initialUpdatedAt }: ExplorerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const { user } = useAuth();
    const signedIn = !!user;
    const url: UrlFilters = filtersFromParams(new URLSearchParams(search.toString()));

    const update = (changes: Partial<Record<keyof UrlFilters, string | null>>) => {
        const qs = paramsWithChanges(new URLSearchParams(search.toString()), changes);
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    // The search box: typing is local; the address follows 300 ms after the last key
    const [text, setText] = useState(url.q);
    const pushed = useRef(url.q);
    useEffect(() => {
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
    const query = useCodeSnippets(filters, plain ? initialPage : null, initialUpdatedAt);
    const stats = useCodeReviewStats(initialStats, initialUpdatedAt);

    const snippets = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((c) => !seen.has(c._id) && !!seen.add(c._id));
    }, [query.data]);

    const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
    const total = query.data?.pages[0]?.pagination.total ?? null;
    const active = hasActiveFilters(url, signedIn);
    const clear = () => { setText(''); pushed.current = ''; update({ category: null, difficulty: null, language: null, status: null, q: null, sort: null }); };
    const shortSearch = text.trim().length > 0 && text.trim().length < SEARCH_MIN;

    const facets = stats.data?.facets;
    const categoryOptions = useMemo(() => options(CR_CATEGORIES, facets?.categories.map((c) => ({ id: c.category, count: c.count })), url.category, categoryLabel), [facets, url.category]);
    const languageOptions = useMemo(() => options(CR_LANGUAGES, facets?.languages.map((c) => ({ id: c.language, count: c.count })), url.language, languageLabel), [facets, url.language]);
    const difficultyCounts = new Map((facets?.difficulties ?? []).map((d) => [d.difficulty, d.count]));
    const isStaff = isCrReader(user?.role);

    return (
        <div>
            <StatsHeader stats={stats.data} />

            {isStaff && (
                <nav aria-label="Code review shortcuts" className="mb-6 flex flex-wrap gap-2">
                    <Link href="/admin/code-review" className={btnPrimary}><Settings className="h-4 w-4" aria-hidden="true" /> Manage exercises</Link>
                </nav>
            )}

            <div className="mb-6 space-y-4" role="search" aria-label="Filter exercises">
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                    <div className="relative sm:col-span-2 lg:col-span-1">
                        <label htmlFor="cr-search" className="sr-only">Search exercises</label>
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                        <input
                            id="cr-search" type="search" value={text} maxLength={SEARCH_MAX} autoComplete="off"
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Search by title, tag or topic"
                            aria-describedby={shortSearch ? 'cr-search-hint' : undefined}
                            className={`${input} pl-10`}
                        />
                    </div>
                    <div>
                        <label htmlFor="cr-category" className="sr-only">Category</label>
                        <select id="cr-category" value={url.category} onChange={(e) => update({ category: e.target.value || null })} className={`${input} lg:!w-auto`}>
                            <option value="">All categories</option>
                            {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="cr-language" className="sr-only">Language</label>
                        <select id="cr-language" value={url.language} onChange={(e) => update({ language: e.target.value || null })} className={`${input} lg:!w-auto`}>
                            <option value="">All languages</option>
                            {languageOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="cr-sort" className="sr-only">Sort by</label>
                        <select id="cr-sort" value={url.sort} onChange={(e) => update({ sort: e.target.value })} className={`${input} lg:!w-auto`}>
                            {SORT_CHOICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                    </div>
                </div>
                {shortSearch && <p id="cr-search-hint" className={`-mt-2 text-xs ${muted}`}>Type at least {SEARCH_MIN} characters to search.</p>}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div role="group" aria-label="Difficulty" className="flex flex-wrap gap-2">
                        <button type="button" aria-pressed={!url.difficulty} onClick={() => update({ difficulty: null })} className={chipClass(!url.difficulty)}>All levels</button>
                        {CR_DIFFICULTIES.map((d) => (
                            <button key={d} type="button" aria-pressed={url.difficulty === d} onClick={() => update({ difficulty: d })} className={chipClass(url.difficulty === d)}>
                                {DIFFICULTY_LABELS[d]}{difficultyCounts.has(d) ? ` (${difficultyCounts.get(d)})` : ''}
                            </button>
                        ))}
                    </div>
                    {signedIn && (
                        <div role="group" aria-label="My progress" className="flex flex-wrap gap-2">
                            <button type="button" aria-pressed={!url.status} onClick={() => update({ status: null })} className={chipClass(!url.status)}>Any progress</button>
                            {CR_VIEWER_STATUSES.map((s) => (
                                <button key={s} type="button" aria-pressed={url.status === s} onClick={() => update({ status: s })} className={chipClass(url.status === s)}>{STATUS_LABELS[s]}</button>
                            ))}
                        </div>
                    )}
                    {active && <button type="button" onClick={clear} className={btnSecondary}><X className="h-4 w-4" aria-hidden="true" /> Clear filters</button>}
                </div>
            </div>

            {query.isLoading ? (
                <GridSkeleton />
            ) : query.isError && snippets.length === 0 ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the exercises" />
            ) : snippets.length === 0 ? (
                <EmptyState
                    icon={Code2}
                    title={active ? 'No exercises match these filters' : 'No exercises are published yet'}
                    description={active ? 'Try another category or difficulty, or clear the filters.' : 'New exercises are added by the team. Check back soon.'}
                    actionLabel={active ? 'Clear filters' : undefined}
                    onAction={active ? clear : undefined}
                />
            ) : (
                <div aria-busy={query.isPlaceholderData || undefined}>
                    <p className={`mb-4 text-sm ${muted}`} aria-live="polite" data-testid="cr-count">
                        {total !== null && total > snippets.length ? `Showing ${snippets.length} of ${total} exercises` : `${snippets.length} ${snippets.length === 1 ? 'exercise' : 'exercises'}`}
                        {effectiveQuery(url.q) && <> matching &ldquo;{effectiveQuery(url.q)}&rdquo;</>}
                    </p>
                    <div className={`grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2 lg:grid-cols-3 ${query.isPlaceholderData ? 'opacity-60' : ''}`} data-testid="cr-grid">
                        {snippets.map((s) => <SnippetCard key={s._id} snippet={s} />)}
                    </div>
                    {query.isError && (
                        <p role="alert" className="mt-4 text-center text-sm text-red-800 dark:text-red-300">Could not load more exercises. <button type="button" className="underline" onClick={() => void fetchNextPage()}>Try again</button></p>
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
        </div>
    );
}
