'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, Globe2, Info } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useEventsCalendar } from '@/hooks/queries/useEventCalendar';
import {
    calendarSearch, dayShort, monthTitle, parseCalendarParams, shiftDay, todayIn, visibleRange, weekOf, weekTitle,
    type CalendarState, type CalendarView,
} from '@/lib/events/calendar';
import { useIsPhone, useViewerZone } from '@/lib/events/clock';
import { CATEGORY_LABELS } from '@/lib/events/form';
import { zoneAbbreviation } from '@/lib/events/time';
import { EVENT_CATEGORIES, type EventCategory } from '@/types/event';
import { CalendarAgenda } from './CalendarAgenda';
import { CalendarFeedPanel } from './CalendarFeedPanel';
import { CalendarMonth } from './CalendarMonth';
import { CalendarSubscribe } from './CalendarSubscribe';
import { CalendarWeek } from './CalendarWeek';
import { ErrorState } from './ListStates';
import { TabBar } from './TabBar';
import { btnSecondary, input, muted, pageBg } from './styles';

const VIEW_LABELS: Record<CalendarView, string> = { month: 'Month', week: 'Week', agenda: 'Agenda' };

export function CalendarSkeleton({ view = 'month' }: { view?: CalendarView }) {
    return (
        <div role="status" aria-label="Loading the calendar" className={`animate-pulse rounded-2xl bg-gray-200 dark:bg-neutral-800 ${view === 'month' ? 'h-[36rem]' : 'h-80'}`} />
    );
}

/**
 * The calendar of public events: month, week and agenda over one range of the API, kept in the
 * address bar (`view`, `date`, `category`) so refresh, back and shared links agree. Days are the
 * viewer's own, because that is the clock on their wall; each event also names its own zone.
 */
export function EventsCalendar() {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const { user } = useAuth();
    const zone = useViewerZone();
    const phone = useIsPhone();

    const ready = !!zone && phone !== null;
    const env = useMemo(() => (ready ? { today: todayIn(zone), phone } : null), [ready, zone, phone]);
    const state: CalendarState | null = env ? parseCalendarParams(new URLSearchParams(search.toString()), env) : null;
    const range = state && zone ? visibleRange(state.view, state.date, zone) : null;
    const query = useEventsCalendar(range ? { from: range.from, to: range.to } : null, state?.category ?? '');

    const go = (changes: Partial<CalendarState>) => {
        if (!state || !env) return;
        const qs = calendarSearch({ ...state, ...changes }, env);
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    if (!state || !env || !zone || !range) {
        return (
            <div className={pageBg}>
                <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
                    <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">Event calendar</h1>
                    <CalendarSkeleton />
                </div>
            </div>
        );
    }

    const { view, date, category } = state;
    const items = query.data?.items ?? [];
    const truncated = !!query.data?.meta.truncated;
    const title = view === 'week' ? weekTitle(weekOf(date)) : monthTitle(date);
    const unit = view === 'week' ? 'week' : 'month';
    const views = (env.phone ? ['week', 'agenda'] : ['month', 'week', 'agenda']) as CalendarView[];
    const rangeLabel = `${dayShort(range.first)} to ${dayShort(range.last)}`;
    const abbreviation = zoneAbbreviation(new Date(), zone);

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
                <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Event calendar</h1>
                        <p className={`mt-1 flex items-center gap-1.5 text-sm ${muted}`} data-testid="zone-label">
                            <Globe2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>Times are in your time zone, {zone} ({abbreviation}). An event hosted in another zone shows its own time too.</span>
                        </p>
                    </div>
                    <Link href="/events" className={btnSecondary}>All events</Link>
                </header>

                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2" role="group" aria-label={`Change ${unit}`}>
                        <button type="button" className={`${btnSecondary} !px-3`} onClick={() => go({ date: shiftDay(view, date, -1) })} aria-label={`Previous ${unit}`}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" className={`${btnSecondary} !px-3`} onClick={() => go({ date: shiftDay(view, date, 1) })} aria-label={`Next ${unit}`}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" className={btnSecondary} onClick={() => go({ date: env.today })}>Today</button>
                    </div>
                    <h2 className="order-first basis-full text-xl font-semibold text-gray-900 dark:text-white sm:order-none sm:basis-auto" aria-live="polite" data-testid="calendar-title">{title}</h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <TabBar
                            tabs={views.map((v) => ({ id: v, label: VIEW_LABELS[v] }))}
                            active={view}
                            onChange={(id) => go({ view: id as CalendarView })}
                            label="Calendar view"
                            idPrefix="calendar-view"
                        />
                        <div>
                            <label htmlFor="calendar-category" className="sr-only">Category</label>
                            <select id="calendar-category" value={category} onChange={(e) => go({ category: e.target.value as EventCategory | '' })} className={`${input} !w-auto`}>
                                <option value="">All categories</option>
                                {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="mb-6">
                    <CalendarSubscribe query={{ from: range.from, to: range.to, category }} rangeLabel={rangeLabel} />
                </div>

                <div id="calendar-view-panel" role="tabpanel" aria-labelledby={`calendar-view-${view}`} aria-busy={query.isLoading}>
                    {query.isLoading ? (
                        <CalendarSkeleton view={view} />
                    ) : query.isError ? (
                        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the calendar" />
                    ) : (
                        <>
                            {truncated && (
                                <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="truncated-note">
                                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    This range has more events than can be shown ({query.data?.meta.count} are listed). Pick a category or a shorter view to see the rest.
                                </p>
                            )}
                            {items.length === 0 && view === 'agenda' ? (
                                <EmptyState icon={CalendarDays} title={`Nothing scheduled in ${monthTitle(date)}`} description="Try another month or category, or host an event yourself." actionLabel="Host an event" actionHref="/events/submit" />
                            ) : (
                                <>
                                    {items.length === 0 && (
                                        <p role="status" className={`mb-4 text-sm ${muted}`} data-testid="empty-range">
                                            No events from {rangeLabel}. <Link href="/events/submit" className="font-medium text-orange-800 underline dark:text-orange-300">Host one</Link>
                                        </p>
                                    )}
                                    {view === 'month' && <CalendarMonth date={date} today={env.today} items={items} zone={zone} onNavigate={(day) => go({ date: day })} />}
                                    {view === 'week' && <CalendarWeek date={date} today={env.today} items={items} zone={zone} />}
                                    {view === 'agenda' && <CalendarAgenda date={date} today={env.today} items={items} zone={zone} />}
                                </>
                            )}
                        </>
                    )}
                </div>

                {user && <div className="mt-10"><CalendarFeedPanel /></div>}
            </div>
        </div>
    );
}
