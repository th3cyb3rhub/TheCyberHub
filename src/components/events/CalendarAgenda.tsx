'use client';

import { useMemo } from 'react';
import { bucketByDay, dayTitle, firstOfMonth, lastOfMonth, type DayKey } from '@/lib/events/calendar';
import type { CalendarItem } from '@/types/event';
import { CalendarItemRow } from './CalendarItemRow';
import { chip } from './styles';

/** The month as a list of days that have events, each with its events in time order */
export function CalendarAgenda({ date, today, items, zone }: { date: DayKey; today: DayKey; items: CalendarItem[]; zone: string }) {
    const days = useMemo(() => {
        const map = bucketByDay(items, zone, firstOfMonth(date), lastOfMonth(date));
        return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
    }, [items, zone, date]);

    return (
        <ol className="space-y-6" aria-label="Events by day" data-testid="agenda-list">
            {days.map(([day, entries]) => (
                <li key={day} data-day={day}>
                    <h3 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${day === today ? 'text-orange-800 dark:text-orange-300' : 'text-gray-900 dark:text-white'}`}>
                        {dayTitle(day)}
                        {day === today && <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>Today</span>}
                    </h3>
                    <ul className="space-y-2">
                        {entries.map((entry) => (
                            <li key={`${day}-${entry.item.id}`}><CalendarItemRow item={entry.item} zone={zone} continued={entry.continued} /></li>
                        ))}
                    </ul>
                </li>
            ))}
        </ol>
    );
}
