'use client';

import { Timer } from 'lucide-react';
import { countdownTo, effectiveStatus, formatDayYear } from '@/lib/events/time';
import type { EventSummary } from '@/types/event';
import { muted } from './styles';

/** "Starts in 2 days 3 hours", "Live now" only while live, "Ended" afterwards. Needs the browser clock. */
export function Countdown({ event, now }: { event: EventSummary; now: Date | null }) {
    if (!now) return <p className={`min-h-5 text-sm ${muted}`} aria-hidden="true">&nbsp;</p>;
    const status = effectiveStatus(event, now);
    if (status === 'cancelled') return null;
    if (status === 'upcoming') {
        const c = countdownTo(event.startDate, now);
        return (
            <p className="flex items-center gap-1.5 text-sm font-medium text-orange-800 dark:text-orange-300" data-testid="countdown">
                <Timer className="h-4 w-4" aria-hidden="true" /> Starts in {c?.label ?? 'a moment'}
            </p>
        );
    }
    if (status === 'live') {
        return <p className="text-sm font-medium text-green-800 dark:text-green-300" data-testid="countdown">Live now</p>;
    }
    if (status === 'ended') {
        return <p className={`text-sm ${muted}`} data-testid="countdown">Ended {formatDayYear(event.endsAt, event.timezone)}</p>;
    }
    return null;
}
