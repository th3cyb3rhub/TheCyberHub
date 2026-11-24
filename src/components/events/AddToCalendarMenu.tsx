'use client';

import { CalendarPlus, ChevronDown, Download, ExternalLink } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { eventIcsUrl } from '@/lib/api/events';
import { endOf } from '@/lib/events/time';
import { SITE_URL } from '@/lib/events/server';
import { btnSecondary } from './styles';

interface Props {
    slug: string;
    title: string;
    startDate: string;
    endDate?: string | null;
    endsAt?: string | null;
    location?: string;
    className?: string;
}

const googleStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** A link that opens Google Calendar with the event filled in. The page link is the only description. */
export function googleCalendarUrl({ slug, title, startDate, endDate, endsAt, location }: Omit<Props, 'className'>): string {
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${googleStamp(new Date(startDate))}/${googleStamp(endOf({ startDate, endDate, endsAt }))}`,
        details: `${SITE_URL}/events/${slug}`,
    });
    if (location) params.set('location', location);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Add one event to a calendar: Google Calendar, or the .ics file the API builds (Apple, Outlook, others) */
export function AddToCalendarMenu(props: Props) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger className={`${btnSecondary} ${props.className ?? ''}`}>
                <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Add to calendar <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[14rem]">
                <DropdownMenuItem asChild>
                    <a href={googleCalendarUrl(props)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Google Calendar
                        <span className="sr-only">(opens in a new tab)</span>
                    </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <a href={eventIcsUrl(props.slug)} download={`${props.slug}.ics`}>
                        <Download className="h-4 w-4" aria-hidden="true" /> Apple, Outlook and others (.ics)
                    </a>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
