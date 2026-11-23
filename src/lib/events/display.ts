import type { EventStatus, EventSummary } from '@/types/event';

export interface Availability {
    kind: 'full' | 'waitlist' | 'few' | 'spots' | 'going' | 'open';
    label: string;
}

/** The capacity line on a card: spots left, full, waitlist, or how many are going */
export function availability(event: Pick<EventSummary, 'isFull' | 'waitlistEnabled' | 'waitlistCount' | 'maxParticipants' | 'spotsLeft' | 'registeredCount'>): Availability {
    if (event.isFull) {
        if (event.waitlistEnabled) {
            const n = event.waitlistCount;
            return { kind: 'waitlist', label: n > 0 ? `Full · waitlist open (${n} waiting)` : 'Full · waitlist open' };
        }
        return { kind: 'full', label: 'Full' };
    }
    if (event.maxParticipants) {
        const left = event.spotsLeft ?? Math.max(0, event.maxParticipants - event.registeredCount);
        const label = `${left} ${left === 1 ? 'spot' : 'spots'} left`;
        return { kind: left <= Math.max(3, Math.ceil(event.maxParticipants * 0.1)) ? 'few' : 'spots', label };
    }
    if (event.registeredCount > 0) return { kind: 'going', label: `${event.registeredCount} going` };
    return { kind: 'open', label: 'Open to everyone' };
}

/** Whether the event is still on the calendar (cards show a countdown or a live badge) */
export const isOpenStatus = (status: EventStatus) => status === 'upcoming' || status === 'live';

/** Plain text for descriptions and JSON-LD: markdown marks and tags removed, cut at a word */
export function plainExcerpt(markdown: string, max = 160): string {
    const text = markdown
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[#>*_`~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A link from the API is shown only when it is http or https. Anything else is dropped. */
export function safeHref(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}
