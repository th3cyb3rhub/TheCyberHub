'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Loader2, Plus, Search, Sparkles, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useEventList, useEventPage } from '@/hooks/queries/useEvents';
import { useNow } from '@/lib/events/clock';
import { CATEGORY_LABELS, FORMAT_LABELS } from '@/lib/events/form';
import { EVENT_CATEGORIES, EVENT_FORMATS, type EventCategory, type EventFormat, type EventListFilters, type EventType } from '@/types/event';
import { EventCard } from './EventCard';
import { ErrorState, GridSkeleton } from './ListStates';
import { TabBar } from './TabBar';
import { btnPrimary, btnSecondary, focusRing, input, muted, pageBg } from './styles';

const SCOPES = [{ id: 'upcoming', label: 'Upcoming' }, { id: 'past', label: 'Past' }];
const TYPES: { id: '' | EventType; label: string }[] = [{ id: '', label: 'All' }, { id: 'official', label: 'Official' }, { id: 'community', label: 'Community' }];

const isCategory = (v: string | null): v is EventCategory => !!v && (EVENT_CATEGORIES as readonly string[]).includes(v);
const isFormat = (v: string | null): v is EventFormat => !!v && (EVENT_FORMATS as readonly string[]).includes(v);

/** The filters live in the URL, so a reload or a shared link shows the same list */
export function filtersFromParams(params: URLSearchParams): EventListFilters & { tab: 'upcoming' | 'past' } {
    const category = params.get('category');
    const format = params.get('format');
    const type = params.get('type');
    return {
        tab: params.get('tab') === 'past' ? 'past' : 'upcoming',
        category: isCategory(category) ? category : '',
        format: isFormat(format) ? format : '',
        eventType: type === 'official' || type === 'community' ? type : '',
        q: (params.get('q') ?? '').slice(0, 100),
    };
}

export function EventsExplorer() {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const { user } = useAuth();
    const now = useNow();
    const parsed = filtersFromParams(new URLSearchParams(search.toString()));
    const { tab, ...filters } = parsed;

    // The box edits a local copy and writes `?q=` after the typing pauses
    const [draft, setDraft] = useState(filters.q ?? '');
    const lastWritten = useRef(filters.q ?? '');
    useEffect(() => {
        // Back and forward buttons change the URL under the box
        if ((filters.q ?? '') !== lastWritten.current) {
            lastWritten.current = filters.q ?? '';
            setDraft(filters.q ?? '');
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
        if (draft.trim() === (filters.q ?? '').trim()) return;
        const id = window.setTimeout(() => {
            lastWritten.current = draft.trim();
            update({ q: draft.trim() || null });
        }, 300);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);

    const listFilters: EventListFilters = {
        scope: tab,
        category: filters.category || undefined,
        format: filters.format || undefined,
        eventType: filters.eventType || undefined,
        q: filters.q || undefined,
    };
    const query = useEventList(listFilters);
    const unfiltered = tab === 'upcoming' && !filters.category && !filters.format && !filters.eventType && !filters.q;
    const featuredQuery = useEventPage({ scope: 'upcoming', featured: true, limit: 3 }, { enabled: unfiltered, key: 'featured' });
    const featured = useMemo(() => (unfiltered ? featuredQuery.data?.data ?? [] : []), [unfiltered, featuredQuery.data]);

    const events = useMemo(() => {
        const featuredIds = new Set(featured.map((e) => e._id));
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((e) => !featuredIds.has(e._id) && !seen.has(e._id) && !!seen.add(e._id));
    }, [query.data, featured]);
    const total = query.data?.pages[0]?.pagination.total;
    const hasFilters = !!(filters.category || filters.format || filters.eventType || filters.q);

    const clear = () => {
        setDraft('');
        lastWritten.current = '';
        update({ category: null, format: null, type: null, q: null });
    };

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-orange-800 dark:text-orange-400">
                            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Community events
                        </p>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">Events</h1>
                        <p className={`mt-1 max-w-xl text-sm ${muted}`}>CTF nights, workshops, webinars and meetups from the community. Times are shown in the event&apos;s zone and in yours.</p>
                    </div>
                    <nav aria-label="Events shortcuts" className="flex flex-wrap gap-2">
                        <Link href="/events/calendar" className={btnSecondary}><CalendarDays className="h-4 w-4" aria-hidden="true" /> Calendar</Link>
                        {user && <Link href="/my-events" className={btnSecondary}>My events</Link>}
                        <Link href="/events/submit" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> Host an event</Link>
                    </nav>
                </header>

                <div className="mb-6 space-y-4">
                    <TabBar tabs={SCOPES} active={tab} onChange={(id) => update({ tab: id === 'upcoming' ? null : id })} label="Show events" idPrefix="events-scope" />

                    <form role="search" aria-label="Filter events" onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                        <div className="relative">
                            <label htmlFor="events-q" className="sr-only">Search events</label>
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                            <input id="events-q" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search events" maxLength={100} className={`${input} pl-9`} />
                        </div>
                        <div>
                            <label htmlFor="events-category" className="sr-only">Category</label>
                            <select id="events-category" value={filters.category ?? ''} onChange={(e) => update({ category: e.target.value || null })} className={input}>
                                <option value="">All categories</option>
                                {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="events-format" className="sr-only">Format</label>
                            <select id="events-format" value={filters.format ?? ''} onChange={(e) => update({ format: e.target.value || null })} className={input}>
                                <option value="">Any format</option>
                                {EVENT_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="events-type" className="sr-only">Hosted by</label>
                            <select id="events-type" value={filters.eventType ?? ''} onChange={(e) => update({ type: e.target.value || null })} className={input}>
                                {TYPES.map((t) => <option key={t.id} value={t.id}>{t.id ? `${t.label} events` : 'Official and community'}</option>)}
                            </select>
                        </div>
                        {hasFilters && (
                            <button type="button" onClick={clear} className={`${btnSecondary} sm:col-span-2 lg:col-span-1`}><X className="h-4 w-4" aria-hidden="true" /> Clear</button>
                        )}
                    </form>
                </div>

                <div id="events-scope-panel" role="tabpanel" aria-labelledby={`events-scope-${tab}`}>
                    {featured.length > 0 && (
                        <section aria-labelledby="featured-heading" className="mb-10">
                            <h2 id="featured-heading" className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                                <Sparkles className="h-5 w-5 text-yellow-600 dark:text-yellow-400" aria-hidden="true" /> Featured
                            </h2>
                            <div className="grid gap-5 lg:grid-cols-2">
                                {featured.map((e) => <EventCard key={e._id} event={e} now={now} />)}
                            </div>
                        </section>
                    )}

                    {query.isLoading ? (
                        <GridSkeleton />
                    ) : query.isError ? (
                        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
                    ) : events.length === 0 && featured.length === 0 ? (
                        <EmptyState
                            icon={CalendarDays}
                            title={hasFilters ? 'No events match these filters' : tab === 'upcoming' ? 'No upcoming events' : 'No past events yet'}
                            description={hasFilters ? 'Try another category or clear the filters.' : tab === 'upcoming' ? 'Nothing is scheduled right now. Host one for the community.' : 'Events that are over appear here, with recordings and slides when the organizer shares them.'}
                            actionLabel={hasFilters ? 'Clear filters' : tab === 'upcoming' ? 'Host an event' : undefined}
                            actionHref={!hasFilters && tab === 'upcoming' ? '/events/submit' : undefined}
                            onAction={hasFilters ? clear : undefined}
                        />
                    ) : (
                        <>
                            {featured.length > 0 && events.length > 0 && <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">{tab === 'upcoming' ? 'More events' : 'Events'}</h2>}
                            {typeof total === 'number' && <p className={`mb-4 text-sm ${muted}`} aria-live="polite">{total} {total === 1 ? 'event' : 'events'}</p>}
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                {events.map((e) => <EventCard key={e._id} event={e} now={now} />)}
                            </div>
                            {query.hasNextPage && (
                                <div className="mt-8 text-center">
                                    <button type="button" className={`${btnSecondary} ${focusRing}`} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                                        {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
