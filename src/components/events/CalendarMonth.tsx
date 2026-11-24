'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Repeat } from 'lucide-react';
import {
    addDays, addMonths, bucketByDay, countLabel, dayLong, gridWeekdays, monthGrid, monthOf, monthTitle, type DayItem, type DayKey,
} from '@/lib/events/calendar';
import { CATEGORY_LABELS } from '@/lib/events/form';
import { formatClock } from '@/lib/events/time';
import type { CalendarItem } from '@/types/event';
import { CalendarItemRow } from './CalendarItemRow';
import { DialogShell } from './DialogShell';
import { btnSecondary } from './styles';

/** Items a cell shows before "+N more" */
export const CELL_LIMIT = 3;

interface Props {
    /** Any day of the month to show; it is also where focus starts */
    date: DayKey;
    today: DayKey;
    items: CalendarItem[];
    zone: string;
    /** Move the calendar to this day (another month, from the keyboard) */
    onNavigate: (day: DayKey) => void;
}

const CATEGORY_SWATCH: Record<string, string> = {
    ctf: 'bg-red-600',
    webinar: 'bg-blue-600',
    workshop: 'bg-emerald-600',
    meetup: 'bg-purple-600',
    conference: 'bg-amber-600',
    hackathon: 'bg-pink-600',
};

const CATEGORY_BAR: Record<string, string> = {
    ctf: 'border-l-red-600',
    webinar: 'border-l-blue-600',
    workshop: 'border-l-emerald-600',
    meetup: 'border-l-purple-600',
    conference: 'border-l-amber-600',
    hackathon: 'border-l-pink-600',
};

function CellItem({ entry, zone }: { entry: DayItem; zone: string }) {
    const { item, continued } = entry;
    const cancelled = item.status === 'cancelled';
    const live = item.status === 'live';
    return (
        <Link
            href={`/events/${item.slug}`}
            tabIndex={-1}
            data-testid="month-item"
            className={`flex min-w-0 items-center gap-1 rounded border-l-4 bg-gray-100 px-1.5 py-0.5 text-xs text-gray-900 hover:bg-orange-100 dark:bg-neutral-800 dark:text-gray-100 dark:hover:bg-neutral-700 ${CATEGORY_BAR[item.category] ?? 'border-l-gray-500'} ${cancelled ? 'text-gray-600 line-through dark:text-gray-400' : ''}`}
        >
            {cancelled && <Ban className="h-3 w-3 shrink-0" aria-hidden="true" />}
            {live && <span className="shrink-0 rounded bg-green-100 px-1 text-[10px] font-semibold uppercase leading-4 text-green-900 dark:bg-green-500/20 dark:text-green-200" aria-hidden="true" data-testid="live-mark">Live</span>}
            {item.seriesId && <Repeat className="h-3 w-3 shrink-0 text-purple-700 dark:text-purple-300" aria-hidden="true" />}
            {!item.isAllDay && !continued && <span className="shrink-0 font-medium">{formatClock(item.startDate, zone)}</span>}
            <span className="truncate">{item.title}</span>
            <span className="sr-only">, {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? item.category}</span>
            {cancelled && <span className="sr-only"> (cancelled)</span>}
            {live && <span className="sr-only"> (live now)</span>}
            {item.seriesId && <span className="sr-only"> (recurring)</span>}
        </Link>
    );
}

/**
 * The month as a 7 by 6 grid. One cell is in the tab order (roving tabindex); the arrow keys move
 * between days, Home and End go to the start and end of the week, Page Up and Page Down change month,
 * Enter or Space opens the day. Events are links for the mouse; the keyboard reaches them through the
 * day dialog so the grid stays a single tab stop.
 */
export function CalendarMonth({ date, today, items, zone, onNavigate }: Props) {
    const grid = useMemo(() => monthGrid(date), [date]);
    const byDay = useMemo(() => bucketByDay(items, zone, grid.first, grid.last), [items, zone, grid.first, grid.last]);
    const [focusDay, setFocusDay] = useState<DayKey>(date);
    const [openDay, setOpenDay] = useState<DayKey | null>(null);
    const cells = useRef(new Map<DayKey, HTMLDivElement>());
    const pending = useRef<DayKey | null>(null);

    // When the month changes, focus lands on the day that was asked for, else the day in the URL
    useEffect(() => {
        const requested = pending.current;
        pending.current = null;
        const target = requested ?? date;
        setFocusDay(target >= grid.first && target <= grid.last ? target : date);
        // Only a keyboard move asks for focus; the buttons of the toolbar keep it
        if (requested) cells.current.get(target)?.focus();
    }, [date, grid.first, grid.last]);

    const moveTo = (day: DayKey) => {
        if (day < grid.first || day > grid.last) {
            pending.current = day;
            onNavigate(day);
            return;
        }
        setFocusDay(day);
        cells.current.get(day)?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent, day: DayKey) => {
        const dayOfWeek = grid.rows.findIndex((r) => r.includes(day));
        const row = grid.rows[dayOfWeek];
        let target: DayKey | null = null;
        switch (e.key) {
            case 'ArrowLeft': target = addDays(day, -1); break;
            case 'ArrowRight': target = addDays(day, 1); break;
            case 'ArrowUp': target = addDays(day, -7); break;
            case 'ArrowDown': target = addDays(day, 7); break;
            case 'Home': target = row[0]; break;
            case 'End': target = row[6]; break;
            case 'PageUp': target = addMonths(day, -1); break;
            case 'PageDown': target = addMonths(day, 1); break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                setOpenDay(day);
                return;
            default: return;
        }
        e.preventDefault();
        if (e.key === 'PageUp' || e.key === 'PageDown') {
            pending.current = target;
            onNavigate(target);
            return;
        }
        moveTo(target);
    };

    // Colour is never the only signal: each category on screen is named next to its colour
    const legend = useMemo(() => {
        const seen = new Set<string>();
        for (const entries of Array.from(byDay.values())) for (const entry of entries) seen.add(entry.item.category);
        return Array.from(seen).sort();
    }, [byDay]);

    const weekdays = gridWeekdays();
    const openItems = openDay ? byDay.get(openDay) ?? [] : [];

    return (
        <>
            {legend.length > 0 && (
                <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700 dark:text-gray-300" aria-label="Category colours" data-testid="month-legend">
                    {legend.map((category) => (
                        <li key={category} className="inline-flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-sm ${CATEGORY_SWATCH[category] ?? 'bg-gray-500'}`} aria-hidden="true" />
                            {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
                        </li>
                    ))}
                </ul>
            )}
            <div role="grid" aria-label={monthTitle(date)} aria-rowcount={7} aria-colcount={7} className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/60" data-testid="month-grid">
                <div role="row" aria-rowindex={1} className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900">
                    {weekdays.map((name) => (
                        <div key={name} role="columnheader" aria-label={name} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                            <span aria-hidden="true">{name.slice(0, 3)}</span>
                        </div>
                    ))}
                </div>
                {grid.rows.map((row, r) => (
                    <div key={row[0]} role="row" aria-rowindex={r + 2} className="grid grid-cols-7 border-b border-gray-200 last:border-b-0 dark:border-neutral-800">
                        {row.map((day, c) => {
                            const entries = byDay.get(day) ?? [];
                            const shown = entries.slice(0, CELL_LIMIT);
                            const more = entries.length - shown.length;
                            const inMonth = monthOf(day) === grid.month;
                            const isToday = day === today;
                            const label = `${dayLong(day)}, ${countLabel(entries.length)}${isToday ? ', today' : ''}`;
                            return (
                                <div
                                    key={day}
                                    ref={(el) => { if (el) cells.current.set(day, el); else cells.current.delete(day); }}
                                    role="gridcell"
                                    aria-colindex={c + 1}
                                    aria-label={label}
                                    aria-current={isToday ? 'date' : undefined}
                                    tabIndex={day === focusDay ? 0 : -1}
                                    data-day={day}
                                    data-testid="day-cell"
                                    onKeyDown={(e) => onKeyDown(e, day)}
                                    onFocus={() => setFocusDay(day)}
                                    onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) setOpenDay(day); }}
                                    className={`min-h-[6.5rem] min-w-0 cursor-pointer border-r border-gray-200 p-1.5 last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 dark:border-neutral-800 ${inMonth ? '' : 'bg-gray-50/70 dark:bg-black/30'}`}
                                >
                                    <div className="mb-1 flex items-center justify-between">
                                        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${isToday ? 'bg-orange-700 text-white' : inMonth ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-500'}`} aria-hidden="true">
                                            {Number(day.slice(8))}
                                        </span>
                                    </div>
                                    <div className="space-y-1" aria-hidden="true">
                                        {shown.map((entry) => <CellItem key={entry.item.id} entry={entry} zone={zone} />)}
                                        {more > 0 && (
                                            <button
                                                type="button"
                                                tabIndex={-1}
                                                className="w-full rounded px-1.5 py-0.5 text-left text-xs font-medium text-orange-800 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-neutral-800"
                                                onClick={(e) => { e.stopPropagation(); setOpenDay(day); }}
                                            >
                                                +{more} more
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <DialogShell
                open={!!openDay}
                onOpenChange={(o) => !o && setOpenDay(null)}
                title={openDay ? dayLong(openDay) : ''}
                description={openDay ? `${countLabel(openItems.length)[0].toUpperCase()}${countLabel(openItems.length).slice(1)}. Times are in your time zone (${zone}).` : undefined}
                wide
                footer={<button type="button" className={btnSecondary} onClick={() => setOpenDay(null)}>Close</button>}
            >
                {openItems.length === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">Nothing is scheduled on this day.</p>
                ) : (
                    <ul className="space-y-2" aria-label={`Events on ${openDay ? dayLong(openDay) : ''}`}>
                        {openItems.map((entry) => (
                            <li key={entry.item.id}><CalendarItemRow item={entry.item} zone={zone} continued={entry.continued} dense /></li>
                        ))}
                    </ul>
                )}
            </DialogShell>
        </>
    );
}
