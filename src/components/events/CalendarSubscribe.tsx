'use client';

import { useState } from 'react';
import { CalendarPlus, Download, Rss } from 'lucide-react';
import { calendarIcsUrl, webcalUrl } from '@/lib/api/events';
import type { CalendarQuery } from '@/types/event';
import { CopyField } from './CopyField';
import { DialogShell } from './DialogShell';
import { btnSecondary, muted } from './styles';

/**
 * "Download .ics" and "Subscribe" for what the calendar shows now. Both are plain links to the API
 * calendar file with the current range and category; nothing is built in the browser.
 */
export function CalendarSubscribe({ query, rangeLabel }: { query: CalendarQuery; rangeLabel: string }) {
    const [open, setOpen] = useState(false);
    const https = calendarIcsUrl(query);
    const webcal = webcalUrl(https);

    return (
        <>
            <div className="flex flex-wrap gap-2">
                <a href={https} download="calendar.ics" className={btnSecondary} data-testid="download-ics">
                    <Download className="h-4 w-4" aria-hidden="true" /> Download .ics
                    <span className="sr-only"> for {rangeLabel}</span>
                </a>
                <button type="button" className={btnSecondary} onClick={() => setOpen(true)}>
                    <Rss className="h-4 w-4" aria-hidden="true" /> Subscribe
                </button>
            </div>
            <DialogShell
                open={open}
                onOpenChange={setOpen}
                title="Subscribe in your calendar app"
                description={`Adds the events of ${rangeLabel} to Apple Calendar, Outlook or Google Calendar.`}
                footer={
                    <>
                        <a href={webcal} className={btnSecondary}><CalendarPlus className="h-4 w-4" aria-hidden="true" /> Open in my calendar app</a>
                        <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>Close</button>
                    </>
                }
            >
                <div className="space-y-3">
                    <CopyField id="calendar-webcal" label="Calendar address" value={webcal} />
                    <p className={`text-xs ${muted}`}>
                        This address covers {rangeLabel}{query.category ? ` and the category you picked` : ''}, so it does not move forward on its own.
                        To keep your own registered events up to date, make a personal feed under My calendar feed.
                    </p>
                </div>
            </DialogShell>
        </>
    );
}
