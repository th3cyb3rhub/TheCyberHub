'use client';

import { Clock, Globe2 } from 'lucide-react';
import { useViewerZone } from '@/lib/events/clock';
import { formatRange, formatStart, sameClock } from '@/lib/events/time';
import { muted } from './styles';

interface TimeInput { startDate: string; endDate?: string | null; endsAt?: string | null; timezone: string }

/**
 * The time of an event in the organizer's zone, named, and in the viewer's zone when that differs.
 * The viewer part appears after mount: the server does not know the visitor's zone.
 */
export function EventTimes({ event, compact = false }: { event: TimeInput; compact?: boolean }) {
    const viewerZone = useViewerZone();
    const differs = !!viewerZone && !sameClock(event.startDate, event.timezone, viewerZone);

    if (compact) {
        return (
            <div className="space-y-0.5">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{formatStart(event, event.timezone)}</p>
                {differs && viewerZone && (
                    <p className={`text-xs ${muted}`}>Your time: {formatStart(event, viewerZone)}</p>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{formatRange(event, event.timezone, { withYear: true })}</p>
                    <p className={`text-xs ${muted}`}>Event time zone: {event.timezone}</p>
                </div>
            </div>
            {viewerZone && (
                <div className="flex items-start gap-2.5" data-testid="viewer-time">
                    <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                    <div>
                        {differs ? (
                            <>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Your time: {formatRange(event, viewerZone, { withYear: true })}</p>
                                <p className={`text-xs ${muted}`}>Your time zone: {viewerZone}</p>
                            </>
                        ) : (
                            <p className={`text-sm ${muted}`}>That is also your local time ({viewerZone}).</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
