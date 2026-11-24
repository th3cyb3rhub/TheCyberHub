'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Archive, CalendarDays, Loader2, Presentation, Search, Star, Users, Video, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEventArchives } from '@/hooks/queries/useEventCalendar';
import { archiveRangeInvalid, archiveSearch, parseArchiveParams, toArchiveFilters, type ArchiveState } from '@/lib/events/archive';
import { safeHref } from '@/lib/events/display';
import { CATEGORY_LABELS, FORMAT_LABELS } from '@/lib/events/form';
import { formatDayYear, toLocalParts } from '@/lib/events/time';
import { EVENT_CATEGORIES, type ArchiveItem } from '@/types/event';
import { ErrorState } from './ListStates';
import { SeriesChip } from './SeriesChip';
import { btnSecondary, card, chip, focusRing, input, muted, pageBg } from './styles';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ArchiveCard({ item }: { item: ArchiveItem }) {
    const image = safeHref(item.image);
    const [, month, day] = toLocalParts(item.startDate, item.timezone).date.split('-');
    return (
        <article className={`${card} group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md`} data-testid="archive-card">
            {image && (
                <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-gray-100 dark:bg-neutral-800">
                    <Image src={image} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" unoptimized />
                </div>
            )}
            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-center dark:border-neutral-700 dark:bg-neutral-800" aria-hidden="true">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">{MONTHS[Number(month) - 1]}</span>
                        <span className="text-lg font-bold leading-none text-gray-900 dark:text-white">{Number(day)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{CATEGORY_LABELS[item.category] ?? item.category}</span>
                            <span className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}>{FORMAT_LABELS[item.format] ?? item.format}</span>
                            <SeriesChip seriesId={item.seriesId} className="relative z-10" />
                        </div>
                        <h3 className="text-base font-semibold leading-snug text-gray-900 dark:text-white">
                            <Link href={`/events/${item.slug}`} className="rounded after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{item.title}</Link>
                        </h3>
                    </div>
                </div>
                {item.shortDescription && <p className={`line-clamp-2 text-sm ${muted}`}>{item.shortDescription}</p>}
                <p className={`text-xs ${muted}`}>{formatDayYear(item.startDate, item.timezone)}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                    {item.hasRecording && <span className={`${chip} bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300`}><Video className="h-3 w-3" aria-hidden="true" /> Recording</span>}
                    {item.hasSlides && <span className={`${chip} bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-300`}><Presentation className="h-3 w-3" aria-hidden="true" /> Slides</span>}
                    {item.ratingCount > 0 && item.averageRating !== null && (
                        <span className={`${chip} bg-yellow-100 text-yellow-900 dark:bg-yellow-500/15 dark:text-yellow-300`}>
                            <Star className="h-3 w-3" aria-hidden="true" /> {item.averageRating.toFixed(1)} <span className="font-normal">({item.ratingCount} {item.ratingCount === 1 ? 'rating' : 'ratings'})</span>
                        </span>
                    )}
                    {item.attendedCount > 0 && (
                        <span className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}><Users className="h-3 w-3" aria-hidden="true" /> {item.attendedCount} attended</span>
                    )}
                </div>
            </div>
        </article>
    );
}

export function ArchiveSkeleton() {
    return (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading past events">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`${card} space-y-3 p-4`} aria-hidden="true">
                    <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                    <div className="h-5 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                    <div className="h-4 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                </div>
            ))}
        </div>
    );
}

/** Past events with recordings, slides and ratings. The filters are in the address bar. */
export function ArchiveView() {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const state = parseArchiveParams(new URLSearchParams(search.toString()));

    // Typing edits a draft; the address bar follows 300 ms after the last change
    const [draft, setDraft] = useState({ q: state.q, from: state.from, to: state.to });
    const written = useRef({ q: state.q, from: state.from, to: state.to });
    useEffect(() => {
        // Back and forward change the address under the fields
        const incoming = { q: state.q, from: state.from, to: state.to };
        if (JSON.stringify(incoming) !== JSON.stringify(written.current)) {
            written.current = incoming;
            setDraft(incoming);
        }
    }, [state.q, state.from, state.to]);

    const write = (next: Partial<ArchiveState>) => {
        const qs = archiveSearch({ ...state, ...next });
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    useEffect(() => {
        const wanted = { q: draft.q.trim(), from: draft.from, to: draft.to };
        if (JSON.stringify(wanted) === JSON.stringify(written.current)) return;
        const id = window.setTimeout(() => {
            written.current = wanted;
            write(wanted);
        }, 300);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);

    const invalid = archiveRangeInvalid(state);
    const query = useEventArchives(toArchiveFilters(state), { enabled: !invalid });
    const items = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((e) => !seen.has(e.id) && !!seen.add(e.id));
    }, [query.data]);
    const hasFilters = !!(state.category || state.from || state.to || state.q);

    const clear = () => {
        const empty = { q: '', from: '', to: '' };
        written.current = empty;
        setDraft(empty);
        router.replace(pathname, { scroll: false });
    };

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
                <header className="mb-8">
                    <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-orange-800 dark:text-orange-400"><Archive className="h-4 w-4" aria-hidden="true" /> Event archive</p>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">Past events</h1>
                    <p className={`mt-1 max-w-xl text-sm ${muted}`}>Everything that already happened, newest first. Find recordings, slides and what attendees thought.</p>
                </header>

                <form role="search" aria-label="Filter past events" onSubmit={(e) => e.preventDefault()} className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                    <div className="relative">
                        <label htmlFor="archive-q" className="sr-only">Search past events</label>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                        <input id="archive-q" type="search" value={draft.q} maxLength={100} placeholder="Search past events" onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} className={`${input} pl-9`} />
                    </div>
                    <div>
                        <label htmlFor="archive-category" className="sr-only">Category</label>
                        <select id="archive-category" value={state.category} onChange={(e) => write({ category: e.target.value as ArchiveState['category'] })} className={input}>
                            <option value="">All categories</option>
                            {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="archive-from" className="mb-1 block text-xs text-gray-700 dark:text-gray-300 lg:sr-only">From</label>
                        <input id="archive-from" type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className={input} />
                    </div>
                    <div>
                        <label htmlFor="archive-to" className="mb-1 block text-xs text-gray-700 dark:text-gray-300 lg:sr-only">To</label>
                        <input id="archive-to" type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className={input} aria-invalid={invalid || undefined} aria-describedby={invalid ? 'archive-range-error' : undefined} />
                    </div>
                    {hasFilters && <button type="button" onClick={clear} className={`${btnSecondary} sm:col-span-2 lg:col-span-1 lg:self-end`}><X className="h-4 w-4" aria-hidden="true" /> Clear</button>}
                </form>
                {invalid && <p id="archive-range-error" role="alert" className="mb-4 text-sm font-medium text-red-700 dark:text-red-400">The end date is before the start date.</p>}

                {invalid ? null : query.isLoading ? (
                    <ArchiveSkeleton />
                ) : query.isError ? (
                    <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load past events" />
                ) : items.length === 0 ? (
                    <EmptyState
                        icon={CalendarDays}
                        title={hasFilters ? 'No past events match these filters' : 'No past events yet'}
                        description={hasFilters ? 'Try another category or a wider date range.' : 'Events that are over appear here, with recordings and slides when the organizer shares them.'}
                        actionLabel={hasFilters ? 'Clear filters' : 'See upcoming events'}
                        actionHref={hasFilters ? undefined : '/events'}
                        onAction={hasFilters ? clear : undefined}
                    />
                ) : (
                    <>
                        <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${query.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={query.isPlaceholderData}>
                            {items.map((item) => <ArchiveCard key={item.id} item={item} />)}
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
    );
}
