'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Plus, Search, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useResourceFacets, useResourceList } from '@/hooks/queries/useResources';
import { DIFFICULTY_LABELS, RESOURCE_TOPIC_LABELS, RESOURCE_TYPE_LABELS, plural } from '@/lib/learning/display';
import { DIFFICULTIES, type Difficulty } from '@/types/learning';
import { RESOURCE_TOPICS, RESOURCE_TYPES, type FacetRow, type ResourceFilters, type ResourceTopic, type ResourceType } from '@/types/resource';
import { CardGridSkeleton, EmptyBlock, ErrorState, LoadMore } from '@/components/learning/shared';
import { ResourceCard } from './ResourceCard';
import { btnPrimary, btnSecondary, input, muted, pageBg } from '@/components/events/styles';

const SORTS = [{ id: 'top', label: 'Top rated' }, { id: 'new', label: 'Newest' }, { id: 'views', label: 'Most viewed' }, { id: 'relevance', label: 'Best match' }] as const;

type Sort = (typeof SORTS)[number]['id'];

export interface ExplorerFilters {
    q: string;
    type: ResourceType | '';
    topic: ResourceTopic | '';
    difficulty: Difficulty | '';
    free: '' | 'free' | 'paid';
    tag: string;
    sort: Sort;
}

const oneOf = <T extends string>(list: readonly T[], v: string | null): T | '' => (v && (list as readonly string[]).includes(v) ? (v as T) : '');

/** The filters live in the URL, so a reload or a shared link shows the same list */
export function filtersFromParams(params: URLSearchParams): ExplorerFilters {
    const sort = params.get('sort');
    const free = params.get('free');
    const q = (params.get('q') ?? '').slice(0, 100);
    return {
        q,
        type: oneOf(RESOURCE_TYPES, params.get('type')),
        topic: oneOf(RESOURCE_TOPICS, params.get('topic')),
        difficulty: oneOf(DIFFICULTIES, params.get('difficulty')),
        free: free === 'free' || free === 'paid' ? free : '',
        tag: (params.get('tag') ?? '').toLowerCase().slice(0, 30),
        sort: SORTS.some((s) => s.id === sort) ? (sort as Sort) : q.trim().length >= 2 ? 'relevance' : 'top',
    };
}

/** What the API is asked for. Relevance needs a search text; a one-letter search is not sent. */
export function apiFilters(f: ExplorerFilters): ResourceFilters {
    const q = f.q.trim().length >= 2 ? f.q.trim() : undefined;
    return {
        q,
        type: f.type || undefined,
        topic: f.topic || undefined,
        difficulty: f.difficulty || undefined,
        isFree: f.free === 'free' ? true : f.free === 'paid' ? false : undefined,
        tag: f.tag || undefined,
        sort: f.sort === 'relevance' && !q ? 'top' : f.sort,
    };
}

const withCount = (text: string, rows: FacetRow[] | undefined, value: string) => {
    const row = rows?.find((r) => r.value === value);
    return row ? `${text} (${row.count})` : text;
};

export function ResourceExplorer() {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const { user } = useAuth();
    const filters = filtersFromParams(new URLSearchParams(search.toString()));
    const facets = useResourceFacets();

    // The box edits a local copy and writes `?q=` after the typing pauses
    const [draft, setDraft] = useState(filters.q);
    const lastWritten = useRef(filters.q);
    useEffect(() => {
        if (filters.q !== lastWritten.current) {
            lastWritten.current = filters.q;
            setDraft(filters.q);
        }
    }, [filters.q]);

    const update = (changes: Record<string, string | null>) => {
        const params = new URLSearchParams(search.toString());
        for (const [key, value] of Object.entries(changes)) {
            if (value) params.set(key, value); else params.delete(key);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    useEffect(() => {
        if (draft.trim() === filters.q.trim()) return;
        const id = window.setTimeout(() => {
            lastWritten.current = draft.trim();
            update({ q: draft.trim() || null });
        }, 300);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);

    const query = useResourceList(apiFilters(filters));
    const items = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((r) => !seen.has(r.id) && !!seen.add(r.id));
    }, [query.data]);
    const total = query.data?.pages[0]?.pagination.total;
    const hasFilters = !!(filters.q || filters.type || filters.topic || filters.difficulty || filters.free || filters.tag);

    const clear = () => {
        setDraft('');
        lastWritten.current = '';
        update({ q: null, type: null, topic: null, difficulty: null, free: null, tag: null, sort: null });
    };

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-orange-800 dark:text-orange-400">
                            <BookOpen className="h-4 w-4" aria-hidden="true" /> Community library
                        </p>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">Resource library</h1>
                        <p className={`mt-1 max-w-2xl text-sm ${muted}`}>Courses, write-ups, tools and videos shared by the community and reviewed by moderators. Every link is checked by a person before it is listed.</p>
                    </div>
                    <nav aria-label="Library shortcuts" className="flex flex-wrap gap-2">
                        <Link href="/roadmaps" className={btnSecondary}>Roadmaps</Link>
                        {user && <Link href="/resources/my" className={btnSecondary}>My submissions</Link>}
                        <Link href="/resources/submit" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> Suggest a resource</Link>
                    </nav>
                </header>

                <form role="search" aria-label="Filter resources" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="relative sm:col-span-2">
                        <label htmlFor="res-q" className="sr-only">Search resources</label>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                        <input id="res-q" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search the library" maxLength={100} className={`${input} pl-9`} />
                    </div>
                    <div>
                        <label htmlFor="res-sort" className="sr-only">Sort by</label>
                        <select id="res-sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value })} className={input}>
                            {SORTS.filter((s) => s.id !== 'relevance' || filters.q.trim().length >= 2).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="res-type" className="sr-only">Type</label>
                        <select id="res-type" value={filters.type} onChange={(e) => update({ type: e.target.value || null })} className={input}>
                            <option value="">All types</option>
                            {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{withCount(RESOURCE_TYPE_LABELS[t], facets.data?.types, t)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="res-topic" className="sr-only">Topic</label>
                        <select id="res-topic" value={filters.topic} onChange={(e) => update({ topic: e.target.value || null })} className={input}>
                            <option value="">All topics</option>
                            {RESOURCE_TOPICS.map((t) => <option key={t} value={t}>{withCount(RESOURCE_TOPIC_LABELS[t], facets.data?.topics, t)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="res-difficulty" className="sr-only">Difficulty</label>
                        <select id="res-difficulty" value={filters.difficulty} onChange={(e) => update({ difficulty: e.target.value || null })} className={input}>
                            <option value="">Any difficulty</option>
                            {DIFFICULTIES.map((d) => <option key={d} value={d}>{withCount(DIFFICULTY_LABELS[d], facets.data?.difficulties, d)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="res-free" className="sr-only">Price</label>
                        <select id="res-free" value={filters.free} onChange={(e) => update({ free: e.target.value || null })} className={input}>
                            <option value="">Free and paid</option>
                            <option value="free">{facets.data ? `Free (${facets.data.free.free})` : 'Free'}</option>
                            <option value="paid">{facets.data ? `Paid (${facets.data.free.paid})` : 'Paid'}</option>
                        </select>
                    </div>
                </form>

                {(filters.tag || hasFilters) && (
                    <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
                        {filters.tag && (
                            <button type="button" onClick={() => update({ tag: null })} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm text-orange-900 hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:bg-orange-500/15 dark:text-orange-300">
                                #{filters.tag} <X className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">Remove tag filter</span>
                            </button>
                        )}
                        {hasFilters && <button type="button" onClick={clear} className={`${btnSecondary} !px-3 !py-1 !text-sm`}><X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters</button>}
                    </div>
                )}

                {query.isLoading ? (
                    <CardGridSkeleton label="Loading resources" />
                ) : query.isError ? (
                    <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the library" />
                ) : items.length === 0 ? (
                    <EmptyBlock
                        icon={BookOpen}
                        title={hasFilters ? 'No resources match these filters' : 'The library is empty'}
                        action={hasFilters
                            ? <button type="button" onClick={clear} className={btnPrimary}>Clear filters</button>
                            : <Link href="/resources/submit" className={btnPrimary}>Be the first to add one</Link>}
                    >
                        {hasFilters ? 'Try another topic or clear the filters.' : 'Nothing has been approved yet. Share a link you trust and a moderator will review it.'}
                    </EmptyBlock>
                ) : (
                    <>
                        {typeof total === 'number' && <p className={`mb-4 text-sm ${muted}`} aria-live="polite">{plural(total, 'resource')}</p>}
                        <ul className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {items.map((r) => <li key={r.id}><ResourceCard resource={r} /></li>)}
                        </ul>
                        <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
                    </>
                )}
            </div>
        </div>
    );
}
