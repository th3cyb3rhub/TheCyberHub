'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap, Map as MapIcon, Search, X } from 'lucide-react';
import { TabBar } from '@/components/events/TabBar';
import { useAuth } from '@/context/AuthContext';
import { useLearningList, useLearningSummary } from '@/hooks/queries/useLearningPaths';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, plural } from '@/lib/learning/display';
import { DIFFICULTIES, PATH_CATEGORIES, type CatalogueFilters, type Difficulty, type PathCategory, type PathKind } from '@/types/learning';
import { LearningCardView } from './LearningCard';
import { CompletedList, ContinueList } from './ProgressList';
import { CardGridSkeleton, EmptyBlock, ErrorState, LoadMore, SignInNote } from './shared';
import { btnPrimary, btnSecondary, input, muted, pageBg } from '@/components/events/styles';

const SORTS = [{ id: 'popular', label: 'Most popular' }, { id: 'new', label: 'Newest' }, { id: 'title', label: 'Title A to Z' }] as const;

const COPY: Record<PathKind, { title: string; eyebrow: string; blurb: string; other: { href: string; label: string }; empty: string }> = {
    roadmap: {
        title: 'Roadmaps',
        eyebrow: 'Career tracks and specialisations',
        blurb: 'Staged maps from first steps to specialist skills. Tick off each step, follow the links to practice and reading, and pick up where you left off on any device.',
        other: { href: '/learning-paths', label: 'Learning paths' },
        empty: 'No roadmaps are published yet. Check back soon.',
    },
    path: {
        title: 'Learning paths',
        eyebrow: 'Guided courses',
        blurb: 'Step-by-step courses with prerequisites, from your first lab to advanced technique. Finish one to earn a certificate.',
        other: { href: '/roadmaps', label: 'Roadmaps' },
        empty: 'No learning paths are published yet. Check back soon.',
    },
};

const isCategory = (v: string | null): v is PathCategory => !!v && (PATH_CATEGORIES as readonly string[]).includes(v);
const isDifficulty = (v: string | null): v is Difficulty => !!v && (DIFFICULTIES as readonly string[]).includes(v);

/** The filters live in the URL, so a reload or a shared link shows the same list */
export function filtersFromParams(params: URLSearchParams): {
    tab: 'browse' | 'mine'; category: PathCategory | ''; difficulty: Difficulty | ''; sort: 'popular' | 'new' | 'title'; search: string;
} {
    const category = params.get('category');
    const difficulty = params.get('difficulty');
    const sort = params.get('sort');
    return {
        tab: params.get('tab') === 'mine' ? 'mine' : 'browse',
        category: isCategory(category) ? category : '',
        difficulty: isDifficulty(difficulty) ? difficulty : '',
        sort: sort === 'new' || sort === 'title' ? sort : 'popular',
        search: (params.get('q') ?? '').slice(0, 100),
    };
}

function MyProgress({ kind }: { kind: PathKind }) {
    const { user } = useAuth();
    const summary = useLearningSummary();
    if (!user) return <SignInNote>Sign in to see the {kind === 'roadmap' ? 'roadmaps' : 'paths'} you have started.</SignInNote>;
    if (summary.isLoading) return <CardGridSkeleton count={2} label="Loading your progress" />;
    if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} title="Could not load your progress" />;
    const data = summary.data;
    const active = (data?.continue ?? []).filter((c) => c.path.kind === kind);
    const done = (data?.recentlyCompleted ?? []).filter((c) => c.path.kind === kind);
    if (active.length === 0 && done.length === 0) {
        return (
            <EmptyBlock icon={kind === 'roadmap' ? MapIcon : GraduationCap} title="Nothing started yet" action={<Link href={kind === 'roadmap' ? '/roadmaps' : '/learning-paths'} className={btnPrimary}>Browse {COPY[kind].title.toLowerCase()}</Link>}>
                Tick off the first step of any {kind === 'roadmap' ? 'roadmap' : 'path'} and it shows up here with the next step to do.
            </EmptyBlock>
        );
    }
    return (
        <div className="space-y-8">
            {data && (
                <p className={`text-sm ${muted}`} aria-live="polite">
                    {plural(data.totals.inProgress, 'path')} in progress, {data.totals.completed} completed.
                </p>
            )}
            {active.length > 0 && <section aria-labelledby="in-progress-heading"><h2 id="in-progress-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Continue</h2><ContinueList items={active} /></section>}
            {done.length > 0 && <section aria-labelledby="completed-heading"><h2 id="completed-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Recently completed</h2><CompletedList items={done} /></section>}
        </div>
    );
}

export function LearningCatalog({ kind }: { kind: PathKind }) {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const { user } = useAuth();
    const copy = COPY[kind];
    const parsed = filtersFromParams(new URLSearchParams(search.toString()));
    const { tab, ...filters } = parsed;

    // The box edits a local copy and writes `?q=` after the typing pauses
    const [draft, setDraft] = useState(filters.search);
    const lastWritten = useRef(filters.search);
    useEffect(() => {
        // Back and forward buttons change the URL under the box
        if (filters.search !== lastWritten.current) {
            lastWritten.current = filters.search;
            setDraft(filters.search);
        }
    }, [filters.search]);

    const update = (changes: Record<string, string | null>) => {
        const params = new URLSearchParams(search.toString());
        for (const [key, value] of Object.entries(changes)) {
            if (value) params.set(key, value); else params.delete(key);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    useEffect(() => {
        if (draft.trim() === filters.search.trim()) return;
        const id = window.setTimeout(() => {
            lastWritten.current = draft.trim();
            update({ q: draft.trim() || null });
        }, 300);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);

    const listFilters: CatalogueFilters = {
        kind,
        category: filters.category || undefined,
        difficulty: filters.difficulty || undefined,
        // The API needs at least two characters to search
        search: filters.search.trim().length >= 2 ? filters.search.trim() : undefined,
        sort: filters.sort,
    };
    const query = useLearningList(listFilters, { enabled: tab === 'browse' });
    const cards = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((c) => !seen.has(c.id) && !!seen.add(c.id));
    }, [query.data]);
    const total = query.data?.pages[0]?.pagination.total;
    const hasFilters = !!(filters.category || filters.difficulty || filters.search);

    const clear = () => {
        setDraft('');
        lastWritten.current = '';
        update({ category: null, difficulty: null, q: null, sort: null });
    };

    const tabs = [{ id: 'browse', label: 'Browse' }, ...(user ? [{ id: 'mine', label: 'My progress' }] : [])];
    const Icon = kind === 'roadmap' ? MapIcon : GraduationCap;

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-orange-800 dark:text-orange-400">
                            <Icon className="h-4 w-4" aria-hidden="true" /> {copy.eyebrow}
                        </p>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">{copy.title}</h1>
                        <p className={`mt-1 max-w-2xl text-sm ${muted}`}>{copy.blurb}</p>
                    </div>
                    <nav aria-label="Learning shortcuts" className="flex flex-wrap gap-2">
                        <Link href={copy.other.href} className={btnSecondary}>{copy.other.label}</Link>
                        <Link href="/resources" className={btnSecondary}>Resource library</Link>
                    </nav>
                </header>

                {tabs.length > 1 && (
                    <div className="mb-6"><TabBar tabs={tabs} active={tab} onChange={(id) => update({ tab: id === 'browse' ? null : id })} label={`${copy.title} view`} idPrefix="learning-view" /></div>
                )}

                <div id="learning-view-panel" role="tabpanel" aria-labelledby={`learning-view-${tab}`}>
                    {tab === 'mine' ? <MyProgress kind={kind} /> : (
                        <>
                            <form role="search" aria-label={`Filter ${copy.title.toLowerCase()}`} onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                                <div className="relative">
                                    <label htmlFor="learning-q" className="sr-only">Search {copy.title.toLowerCase()}</label>
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                                    <input id="learning-q" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Search ${copy.title.toLowerCase()}`} maxLength={100} className={`${input} pl-9`} />
                                </div>
                                <div>
                                    <label htmlFor="learning-category" className="sr-only">Category</label>
                                    <select id="learning-category" value={filters.category} onChange={(e) => update({ category: e.target.value || null })} className={input}>
                                        <option value="">All categories</option>
                                        {PATH_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="learning-difficulty" className="sr-only">Difficulty</label>
                                    <select id="learning-difficulty" value={filters.difficulty} onChange={(e) => update({ difficulty: e.target.value || null })} className={input}>
                                        <option value="">Any difficulty</option>
                                        {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="learning-sort" className="sr-only">Sort by</label>
                                    <select id="learning-sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value === 'popular' ? null : e.target.value })} className={input}>
                                        {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                </div>
                                {hasFilters && <button type="button" onClick={clear} className={`${btnSecondary} sm:col-span-2 lg:col-span-1`}><X className="h-4 w-4" aria-hidden="true" /> Clear</button>}
                            </form>

                            {query.isLoading ? (
                                <CardGridSkeleton label={`Loading ${copy.title.toLowerCase()}`} />
                            ) : query.isError ? (
                                <ErrorState error={query.error} onRetry={() => void query.refetch()} title={`Could not load ${copy.title.toLowerCase()}`} />
                            ) : cards.length === 0 ? (
                                <EmptyBlock
                                    icon={Icon}
                                    title={hasFilters ? `No ${copy.title.toLowerCase()} match these filters` : `No ${copy.title.toLowerCase()} yet`}
                                    action={hasFilters ? <button type="button" onClick={clear} className={btnPrimary}>Clear filters</button> : undefined}
                                >
                                    {hasFilters ? 'Try another category or clear the filters.' : copy.empty}
                                </EmptyBlock>
                            ) : (
                                <>
                                    {typeof total === 'number' && <p className={`mb-4 text-sm ${muted}`} aria-live="polite">{plural(total, kind === 'roadmap' ? 'roadmap' : 'path')}</p>}
                                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                        {cards.map((c) => <LearningCardView key={c.id} path={c} />)}
                                    </div>
                                    <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
