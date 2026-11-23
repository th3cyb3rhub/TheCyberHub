'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, MapPin } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEventList } from '@/hooks/queries/useEvents';
import { useViewerZone } from '@/lib/events/clock';
import { availability } from '@/lib/events/display';
import { CATEGORY_LABELS } from '@/lib/events/form';
import { formatClock, monthRange, toLocalParts } from '@/lib/events/time';
import { EVENT_CATEGORIES, type EventCategory, type EventSummary } from '@/types/event';
import { ErrorState, GridSkeleton } from './ListStates';
import { StatusBadge } from './StatusBadge';
import { btnSecondary, card, chip, focusRing, input, muted, pageBg } from './styles';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface Month { year: number; month: number }

export function parseMonth(value: string | null, fallback: Month): Month {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? '');
    return m ? { year: Number(m[1]), month: Number(m[2]) - 1 } : fallback;
}
export const monthParam = (m: Month) => `${m.year}-${String(m.month + 1).padStart(2, '0')}`;
export const shiftMonth = (m: Month, delta: number): Month => {
    const index = m.year * 12 + m.month + delta;
    return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
};

/** Group events by the day they start in the viewer's zone, in time order */
export function groupByDay(events: EventSummary[], zone: string): { day: string; events: EventSummary[] }[] {
    const days = new Map<string, EventSummary[]>();
    for (const e of [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())) {
        const { date } = toLocalParts(e.startDate, zone);
        days.set(date, [...(days.get(date) ?? []), e]);
    }
    return Array.from(days.entries()).map(([day, list]) => ({ day, events: list }));
}

function dayHeading(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    // Noon UTC keeps the weekday right in every zone
    const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
    return `${weekday}, ${MONTH_NAMES[m - 1]} ${d}`;
}

/**
 * A month as an agenda: real events from the API, grouped by day in the visitor's own time zone.
 * (Week and grid views, ICS feeds and subscriptions come later.)
 */
export function EventsCalendar() {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const zone = useViewerZone();

    const today = useMemo(() => {
        const t = toLocalParts(new Date(), zone ?? 'UTC').date.split('-').map(Number);
        return { year: t[0], month: t[1] - 1 };
    }, [zone]);
    const month = parseMonth(search.get('month'), today);
    const category = (EVENT_CATEGORIES as readonly string[]).includes(search.get('category') ?? '') ? (search.get('category') as EventCategory) : '';

    const range = zone ? monthRange(month.year, month.month, zone) : null;
    const query = useEventList(
        { scope: 'all', from: range?.from, to: range?.to, category: category || undefined, sort: 'startDate', limit: 50 },
        { enabled: !!range },
    );
    const events = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((e) => !seen.has(e._id) && !!seen.add(e._id));
    }, [query.data]);
    const days = useMemo(() => (zone ? groupByDay(events, zone) : []), [events, zone]);
    const todayKey = zone ? toLocalParts(new Date(), zone).date : '';

    const go = (changes: Record<string, string | null>) => {
        const params = new URLSearchParams(search.toString());
        for (const [k, v] of Object.entries(changes)) { if (v) params.set(k, v); else params.delete(k); }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
    const goMonth = (m: Month) => go({ month: monthParam(m) === monthParam(today) ? null : monthParam(m) });

    const loading = !zone || query.isLoading;

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6">
                <header className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Event calendar</h1>
                    <p className={`mt-1 text-sm ${muted}`}>
                        {zone ? `Everything happening this month, in your time zone (${zone}).` : 'Everything happening this month.'}
                    </p>
                </header>

                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2" role="group" aria-label="Month">
                        <button type="button" className={`${btnSecondary} !px-3`} onClick={() => goMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
                        <h2 className="min-w-40 text-center text-lg font-semibold text-gray-900 dark:text-white" aria-live="polite">{MONTH_NAMES[month.month]} {month.year}</h2>
                        <button type="button" className={`${btnSecondary} !px-3`} onClick={() => goMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" className={btnSecondary} onClick={() => goMonth(today)}>Today</button>
                    </div>
                    <div>
                        <label htmlFor="calendar-category" className="sr-only">Category</label>
                        <select id="calendar-category" value={category} onChange={(e) => go({ category: e.target.value || null })} className={`${input} !w-auto`}>
                            <option value="">All categories</option>
                            {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <GridSkeleton count={3} />
                ) : query.isError ? (
                    <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the calendar" />
                ) : days.length === 0 ? (
                    <EmptyState icon={CalendarDays} title={`Nothing scheduled in ${MONTH_NAMES[month.month]}`} description="Try another month, or host an event yourself." actionLabel="Host an event" actionHref="/events/submit" />
                ) : (
                    <>
                        <ol className="space-y-6" aria-label={`Events in ${MONTH_NAMES[month.month]} ${month.year}`}>
                            {days.map(({ day, events: list }) => (
                                <li key={day} data-day={day}>
                                    <h3 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${day === todayKey ? 'text-orange-800 dark:text-orange-300' : 'text-gray-900 dark:text-white'}`}>
                                        {dayHeading(day)}
                                        {day === todayKey && <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>Today</span>}
                                    </h3>
                                    <ul className="space-y-2">
                                        {list.map((e) => {
                                            const avail = availability(e);
                                            return (
                                                <li key={e._id}>
                                                    <Link href={`/events/${e.slug}`} className={`${card} flex flex-wrap items-center gap-x-4 gap-y-1 p-3 transition-colors hover:border-orange-400 ${focusRing}`}>
                                                        <span className="w-20 shrink-0 text-sm font-medium text-gray-900 dark:text-white">{formatClock(e.startDate, zone!)}</span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate font-medium text-gray-900 dark:text-white">{e.title}</span>
                                                            <span className={`flex items-center gap-2 text-xs ${muted}`}>
                                                                <span>{CATEGORY_LABELS[e.category]}</span>
                                                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{e.location || e.locationType}</span>
                                                            </span>
                                                        </span>
                                                        {(e.status === 'live' || e.status === 'cancelled') && <StatusBadge status={e.status} />}
                                                        {e.status !== 'cancelled' && e.status !== 'ended' && (avail.kind === 'full' || avail.kind === 'waitlist') && <span className={`${chip} bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300`}>Full</span>}
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </li>
                            ))}
                        </ol>
                        {query.hasNextPage && (
                            <div className="mt-8 text-center">
                                <button type="button" className={btnSecondary} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
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
