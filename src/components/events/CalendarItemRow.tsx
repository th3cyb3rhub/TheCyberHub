import Link from 'next/link';
import { Globe2, MapPin } from 'lucide-react';
import { FORMAT_LABELS, CATEGORY_LABELS } from '@/lib/events/form';
import { formatClock, sameClock, zoneAbbreviation } from '@/lib/events/time';
import type { CalendarItem } from '@/types/event';
import { SeriesChip } from './SeriesChip';
import { StatusBadge } from './StatusBadge';
import { card, chip, focusRing, muted } from './styles';

/**
 * When an item happens on a day, in the viewer's zone: "7:00 PM – 9:00 PM", "All day", or "Continues".
 * Text, never colour alone.
 */
export function itemTimeLabel(item: CalendarItem, zone: string, continued: boolean): string {
    if (item.isAllDay) return 'All day';
    if (continued) return 'Continues';
    return `${formatClock(item.startDate, zone)} – ${formatClock(item.endDate, zone)}`;
}

/** The event's own clock, when it differs from the viewer's: "6:00 PM GMT+1 at the event" */
export function eventClockNote(item: CalendarItem, zone: string): string | null {
    if (item.isAllDay || sameClock(item.startDate, item.timezone, zone)) return null;
    return `${formatClock(item.startDate, item.timezone)} ${zoneAbbreviation(item.startDate, item.timezone)} where it is hosted`;
}

interface Props {
    item: CalendarItem;
    zone: string;
    continued?: boolean;
    /** Inside a dialog or a narrow column: stacks the details */
    dense?: boolean;
}

/** One event as a row of the week, the agenda and the day dialog */
export function CalendarItemRow({ item, zone, continued = false, dense = false }: Props) {
    const cancelled = item.status === 'cancelled';
    const note = eventClockNote(item, zone);
    return (
        <div className={`${card} flex flex-wrap items-start gap-x-3 gap-y-1 p-3 transition-colors hover:border-orange-400`} data-testid="calendar-item" data-status={item.status}>
            <Link href={`/events/${item.slug}`} className={`min-w-0 flex-1 rounded ${focusRing}`}>
                <span className={`block text-sm font-medium ${cancelled ? 'text-gray-600 line-through dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                    {item.title}
                </span>
                <span className={`mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs ${muted}`}>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{itemTimeLabel(item, zone, continued)}</span>
                    <span>{CATEGORY_LABELS[item.category] ?? item.category}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{FORMAT_LABELS[item.format] ?? item.format}</span>
                </span>
                {note && !dense && (
                    <span className={`mt-0.5 flex items-center gap-1 text-xs ${muted}`}><Globe2 className="h-3 w-3 shrink-0" aria-hidden="true" />{note}</span>
                )}
                {note && dense && <span className={`mt-0.5 block text-xs ${muted}`}>{note}</span>}
            </Link>
            <span className="flex flex-wrap items-center gap-1.5">
                {(item.status === 'live' || cancelled) && <StatusBadge status={item.status} />}
                {item.status === 'ended' && <span className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}>Ended</span>}
                <SeriesChip seriesId={item.seriesId} />
            </span>
        </div>
    );
}
