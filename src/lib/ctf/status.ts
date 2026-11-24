import type { CtfStatus } from '@/types/ctf';
import { serverNow } from './serverClock';

interface Dated {
    status: CtfStatus;
    startDate: string;
    endDate: string;
    frozenAt?: string | null;
}

const time = (value: string | null | undefined) => (value ? new Date(value).getTime() : NaN);

/**
 * The status the clock gives right now, by the rule the API applies to every read: `draft` and
 * `cancelled` are decisions that time never changes; everything else follows the dates, and the end
 * is exclusive. List and detail data can be a minute old, so a card that says "upcoming" may
 * already be live. The default moment is the server's time as far as it is known (`serverNow`), not
 * the raw browser clock.
 */
export function effectiveCtfStatus(competition: Dated, now: Date = serverNow()): CtfStatus {
    if (competition.status === 'draft' || competition.status === 'cancelled') return competition.status;
    const t = now.getTime();
    const start = time(competition.startDate);
    const end = time(competition.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return competition.status;
    if (t >= end) return 'ended';
    if (t < start) return 'upcoming';
    const frozen = time(competition.frozenAt);
    if (Number.isFinite(frozen) && t >= frozen) return 'frozen';
    return 'live';
}

/** Flags are accepted while the competition is live or frozen */
export const isPlayable = (status: CtfStatus) => status === 'live' || status === 'frozen';

/** Whether the roster and registration can still change */
export const isOpenForRoster = (status: CtfStatus) => status !== 'ended' && status !== 'cancelled' && status !== 'draft';

/**
 * A moment that agrees with the status the API sent, for rendering before the browser clock is
 * known (the server render and hydration). The real clock replaces it right after mount.
 */
export function serverMoment(competition: Dated): Date {
    const start = time(competition.startDate);
    const end = time(competition.endDate);
    switch (competition.status) {
        case 'ended': return new Date(end);
        case 'frozen': return new Date(Number.isFinite(time(competition.frozenAt)) ? time(competition.frozenAt) : start);
        case 'live': return new Date(start);
        case 'upcoming': return new Date(start - 1);
        default: return new Date(start);
    }
}

export type ClockKind = 'starts' | 'ends' | 'ended' | 'cancelled' | 'draft';

export interface Clock {
    kind: ClockKind;
    /** Milliseconds until the start or the end; 0 for the others */
    ms: number;
}

/** What the header counts down to: the start while upcoming, the end while it runs */
export function clockFor(competition: Dated, now: Date = serverNow()): Clock {
    const status = effectiveCtfStatus(competition, now);
    if (status === 'upcoming') return { kind: 'starts', ms: Math.max(0, time(competition.startDate) - now.getTime()) };
    if (status === 'live' || status === 'frozen') return { kind: 'ends', ms: Math.max(0, time(competition.endDate) - now.getTime()) };
    return { kind: status === 'ended' ? 'ended' : status === 'cancelled' ? 'cancelled' : 'draft', ms: 0 };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 3 days 4 hours 5 minutes as "3d 04:05:06", a short wait as "04:05:06" */
export function formatCountdown(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return days > 0 ? `${days}d ${clock}` : clock;
}

/** The same wait in words for a screen reader: "3 days 4 hours" */
export function countdownWords(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const parts: string[] = [];
    if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    if (minutes && days === 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    if (parts.length === 0) parts.push(total <= 1 ? 'a moment' : `${total} seconds`);
    return parts.join(' ');
}
