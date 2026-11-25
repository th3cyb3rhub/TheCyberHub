import { API_URL } from '@/lib/api';
import type { EventDetail, Series } from '@/types/event';
import { plainExcerpt } from './display';
import { effectiveStatus } from './time';

import { SITE_URL } from './site';
import { PUBLIC_ITEM_REVALIDATE_SECONDS } from '@/lib/server/cacheTimes';

export { SITE_URL };

export type ServerEvent =
    | { state: 'ok'; event: EventDetail }
    /** 404: private (pending, rejected) or gone. The browser asks again with the visitor's token. */
    | { state: 'missing' }
    | { state: 'error' };

/** The public view of an event, fetched while rendering. No token, so no viewer block and no join link. */
export async function fetchPublicEvent(slug: string): Promise<ServerEvent> {
    try {
        const res = await fetch(`${API_URL}/api/events/${encodeURIComponent(slug)}`, {
            next: { revalidate: PUBLIC_ITEM_REVALIDATE_SECONDS, tags: ['events'] },
            // The page is rendered while the visitor waits; a slow API falls back to the browser fetch
            signal: AbortSignal.timeout(5000),
        });
        if (res.status === 404) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const event = body?.data as EventDetail | undefined;
        if (!event || !event.slug) return { state: 'error' };
        return { state: 'ok', event };
    } catch {
        return { state: 'error' };
    }
}

const ATTENDANCE = { online: 'https://schema.org/OnlineEventAttendanceMode', 'in-person': 'https://schema.org/OfflineEventAttendanceMode', hybrid: 'https://schema.org/MixedEventAttendanceMode' } as const;

/** schema.org Event for search engines. Only public facts: no join link, no people. */
export function eventJsonLd(event: EventDetail, now: Date = new Date()): Record<string, unknown> {
    const url = `${SITE_URL}/events/${event.slug}`;
    const status = effectiveStatus(event, now);
    const online = event.locationType === 'online';
    const image = event.image || event.bannerImage;
    const place = {
        '@type': 'Place',
        name: event.venue || event.location || 'To be announced',
        address: event.location || event.venue || 'To be announced',
    };
    const location = event.locationType === 'hybrid'
        ? [place, { '@type': 'VirtualLocation', url }]
        : online ? { '@type': 'VirtualLocation', url } : place;

    return {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: event.title,
        description: plainExcerpt(event.description || event.shortDescription || event.title, 300),
        startDate: event.startDate,
        endDate: event.endsAt || event.endDate || undefined,
        eventStatus: status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
        eventAttendanceMode: ATTENDANCE[event.locationType],
        location,
        image: image ? [image] : undefined,
        organizer: { '@type': 'Organization', name: event.organizer },
        url,
    };
}

export type ServerSeries =
    | { state: 'ok'; series: Series }
    | { state: 'missing' }
    | { state: 'error' };

/** The public view of a series, fetched while rendering. A slow or failing API gives `error`, never an exception. */
export async function fetchPublicSeries(id: string): Promise<ServerSeries> {
    try {
        const res = await fetch(`${API_URL}/api/events/series/${encodeURIComponent(id)}`, {
            next: { revalidate: PUBLIC_ITEM_REVALIDATE_SECONDS, tags: ['events'] },
            signal: AbortSignal.timeout(5000),
        });
        if (res.status === 404) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const series = body?.data as Series | undefined;
        if (!series || !series.id || !series.recurrence) return { state: 'error' };
        return { state: 'ok', series };
    } catch {
        return { state: 'error' };
    }
}
