'use client';

import { Clock, Globe2, Timer } from 'lucide-react';
import { muted } from '@/components/events/styles';
import { useViewerZone } from '@/lib/events/clock';
import { useCtfNow } from '@/lib/ctf/clock';
import { formatDayYear, formatRange, sameClock } from '@/lib/events/time';
import { clockFor, countdownWords, formatCountdown } from '@/lib/ctf/status';
import type { CtfCompetitionCard } from '@/types/ctf';

type Timed = Pick<CtfCompetitionCard, 'startDate' | 'endDate' | 'timezone' | 'status' | 'frozenAt'>;

/**
 * The time of a competition in the competition's own zone, named, and in the viewer's zone when
 * that differs. The viewer part appears after mount: the server does not know the visitor's zone.
 */
export function CompetitionTimes({ competition }: { competition: Timed }) {
    const viewerZone = useViewerZone();
    const differs = !!viewerZone && !sameClock(competition.startDate, competition.timezone, viewerZone);
    return (
        <div className="space-y-2">
            <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white" data-testid="comp-range">{formatRange(competition, competition.timezone, { withYear: true })}</p>
                    <p className={`text-xs ${muted}`}>Competition time zone: {competition.timezone}</p>
                </div>
            </div>
            {viewerZone && differs && (
                <div className="flex items-start gap-2.5" data-testid="viewer-time">
                    <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Your time: {formatRange(competition, viewerZone, { withYear: true })}</p>
                        <p className={`text-xs ${muted}`}>Your time zone: {viewerZone}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * The countdown of the header: to the start while upcoming, to the end while it runs. It ticks once
 * a second, so it is its own component and the page around it does not re-render with it. It is a
 * timer for a screen reader but is not announced every second; a sentence in words is.
 */
export function CompetitionClock({ competition }: { competition: Timed }) {
    const now = useCtfNow(1000);
    if (!now) return <div className="min-h-[3.25rem]" aria-hidden="true" />;
    const clock = clockFor(competition, now);
    if (clock.kind === 'ended') {
        return <p className={`text-sm ${muted}`} data-testid="countdown">Ended {formatDayYear(competition.endDate, competition.timezone)}</p>;
    }
    if (clock.kind === 'cancelled' || clock.kind === 'draft') return null;
    const label = clock.kind === 'starts' ? 'Starts in' : 'Ends in';
    return (
        <div data-testid="countdown" data-kind={clock.kind}>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-300">
                <Timer className="h-4 w-4" aria-hidden="true" /> {label}
            </p>
            <p role="timer" aria-live="off" aria-label={`${label} ${countdownWords(clock.ms)}`} className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-gray-900 dark:text-white" data-testid="countdown-clock">
                {formatCountdown(clock.ms)}
            </p>
        </div>
    );
}
