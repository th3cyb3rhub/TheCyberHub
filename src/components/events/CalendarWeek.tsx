'use client';

import { useMemo } from 'react';
import { bucketByDay, countLabel, dayLong, dayShort, weekOf, WEEKDAY_NAMES, weekdayOf, type DayKey } from '@/lib/events/calendar';
import type { CalendarItem } from '@/types/event';
import { CalendarItemRow } from './CalendarItemRow';
import { muted } from './styles';

/**
 * Seven days. On a wide screen they are seven columns; on a narrower one the days stack, each with
 * its events as a list, so nothing is squeezed and the page never scrolls sideways.
 */
export function CalendarWeek({ date, today, items, zone }: { date: DayKey; today: DayKey; items: CalendarItem[]; zone: string }) {
    const days = useMemo(() => weekOf(date), [date]);
    const byDay = useMemo(() => bucketByDay(items, zone, days[0], days[6]), [items, zone, days]);

    return (
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-7" aria-label="Days of the week" data-testid="week-grid">
            {days.map((day) => {
                const entries = byDay.get(day) ?? [];
                const isToday = day === today;
                return (
                    <li
                        key={day}
                        data-day={day}
                        aria-label={`${dayLong(day)}, ${countLabel(entries.length)}${isToday ? ', today' : ''}`}
                        className={`min-w-0 rounded-2xl border bg-white p-3 dark:bg-neutral-900/60 ${isToday ? 'border-orange-500' : 'border-gray-200 dark:border-neutral-800'}`}
                    >
                        <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-gray-900 dark:text-white lg:flex-col lg:items-start lg:gap-0">
                            <span>{WEEKDAY_NAMES[weekdayOf(day)]}</span>
                            <span className={`text-xs font-normal ${muted}`}>{dayShort(day)}{isToday && <span className="ml-2 font-semibold text-orange-800 dark:text-orange-300">Today</span>}</span>
                        </h3>
                        {entries.length === 0 ? (
                            <p className={`text-xs ${muted}`}>No events</p>
                        ) : (
                            <ul className="space-y-2">
                                {entries.map((entry) => (
                                    <li key={entry.item.id}><CalendarItemRow item={entry.item} zone={zone} continued={entry.continued} dense /></li>
                                ))}
                            </ul>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
