/**
 * Event times. The API stores UTC instants plus the organizer's IANA zone. Everything here is
 * built on Intl, with a fixed locale so server and browser render the same text.
 */

import type { EventStatus } from '@/types/event';

const LOCALE = 'en-US';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** Mirrors the API: an event without an end date runs for two hours */
export const DEFAULT_DURATION_MINUTES = 120;

export function isValidTimeZone(zone: string | null | undefined): zone is string {
    if (!zone) return false;
    try {
        new Intl.DateTimeFormat(LOCALE, { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

/** The zone of this browser, or UTC when it cannot be read */
export function browserTimeZone(): string {
    try {
        const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
        return isValidTimeZone(zone) ? zone : 'UTC';
    } catch {
        return 'UTC';
    }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = `${zone}|${JSON.stringify(options)}`;
    let f = formatters.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat(LOCALE, { timeZone: zone, ...options });
        formatters.set(key, f);
    }
    return f;
}

const safeZone = (zone: string | null | undefined) => (isValidTimeZone(zone) ? zone : 'UTC');

function parts(date: Date, zone: string, options: Intl.DateTimeFormatOptions) {
    const out: Record<string, string> = {};
    for (const p of formatter(zone, options).formatToParts(date)) out[p.type] = p.value;
    return out;
}

/** Short zone label such as "GMT+1", "PST" or "UTC" for that instant */
export function zoneAbbreviation(date: Date | string, zone: string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return parts(d, safeZone(zone), { timeZoneName: 'short' }).timeZoneName || safeZone(zone);
}

/** Offset of `zone` from UTC at that instant, in minutes (Berlin in winter is 60) */
export function zoneOffsetMinutes(date: Date, zone: string): number {
    const p = parts(date, safeZone(zone), {
        hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / MINUTE);
}

export interface LocalParts { date: string; time: string }

/** The wall clock of an instant in a zone, as the values a date and a time input hold */
export function toLocalParts(instant: Date | string, zone: string): LocalParts {
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    const p = parts(d, safeZone(zone), { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Turn "the wall clock said 18:00 on 2026-12-05 in Europe/Berlin" into the UTC instant.
 * Returns null for a malformed value, or for a time that a clock change skipped. An ambiguous time
 * (the clock went back) resolves to the first occurrence, the same rule the API applies.
 */
export function localToInstant(date: string, time: string, zone: string): Date | null {
    const d = DATE_RE.exec(date);
    const t = TIME_RE.exec(time);
    if (!d || !t || !isValidTimeZone(zone)) return null;
    const [y, mo, da] = [+d[1], +d[2], +d[3]];
    const [h, mi] = [+t[1], +t[2]];
    const wall = Date.UTC(y, mo - 1, da, h, mi);
    const check = new Date(wall);
    // Rejects 2026-02-31 and similar
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da) return null;

    const offsets = Array.from(new Set([
        zoneOffsetMinutes(new Date(wall - DAY), zone),
        zoneOffsetMinutes(new Date(wall + DAY), zone),
    ]));
    const matches: number[] = [];
    for (const offset of offsets) {
        const candidate = wall - offset * MINUTE;
        const back = toLocalParts(new Date(candidate), zone);
        if (back.date === date && back.time === time) matches.push(candidate);
    }
    if (!matches.length) return null;
    return new Date(Math.min(...matches));
}

export function endOf(event: { startDate: string; endDate?: string | null; endsAt?: string | null }): Date {
    if (event.endsAt) return new Date(event.endsAt);
    if (event.endDate) return new Date(event.endDate);
    return new Date(new Date(event.startDate).getTime() + DEFAULT_DURATION_MINUTES * MINUTE);
}

/**
 * The status the clock gives right now. Cached list data can be minutes old, so a card that says
 * "upcoming" may already be live; decisions (pending, rejected, cancelled) never change with time.
 */
export function effectiveStatus(
    event: { status: EventStatus; startDate: string; endDate?: string | null; endsAt?: string | null },
    now: Date = new Date(),
): EventStatus {
    if (event.status === 'pending' || event.status === 'rejected' || event.status === 'cancelled') return event.status;
    if (now >= endOf(event)) return 'ended';
    if (now >= new Date(event.startDate)) return 'live';
    return 'upcoming';
}

/**
 * A moment that agrees with the status the API sent, for rendering before the browser clock is
 * known (the server render and hydration). The real clock replaces it right after mount.
 */
export function serverClock(event: { status: EventStatus; startDate: string; endDate?: string | null; endsAt?: string | null }): Date {
    if (event.status === 'ended') return endOf(event);
    if (event.status === 'live') return new Date(event.startDate);
    return new Date(new Date(event.startDate).getTime() - 1);
}

const sameDay = (a: LocalParts, b: LocalParts) => a.date === b.date;

/** "Sat, Dec 5" */
export function formatDay(instant: Date | string, zone: string): string {
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    return formatter(safeZone(zone), { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

/** "Sat, Dec 5, 2026" */
export function formatDayYear(instant: Date | string, zone: string): string {
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    return formatter(safeZone(zone), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

/** "6:00 PM" */
export function formatClock(instant: Date | string, zone: string): string {
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    return formatter(safeZone(zone), { hour: 'numeric', minute: '2-digit' }).format(d);
}

export interface RangeInput { startDate: string; endDate?: string | null; endsAt?: string | null }

/**
 * A range in one zone, with the zone named: "Sat, Dec 5 · 6:00 PM – 8:00 PM GMT+1".
 * A range that crosses midnight names both days.
 */
export function formatRange(event: RangeInput, zone: string, { withYear = false }: { withYear?: boolean } = {}): string {
    const z = safeZone(zone);
    const start = new Date(event.startDate);
    const end = endOf(event);
    const day = withYear ? formatDayYear : formatDay;
    const label = zoneAbbreviation(start, z);
    const s = toLocalParts(start, z);
    const e = toLocalParts(end, z);
    if (sameDay(s, e) || end.getTime() <= start.getTime()) {
        return `${day(start, z)} · ${formatClock(start, z)} – ${formatClock(end, z)} ${label}`;
    }
    return `${day(start, z)}, ${formatClock(start, z)} – ${day(end, z)}, ${formatClock(end, z)} ${label}`;
}

/** Only the start: "Sat, Dec 5 · 6:00 PM GMT+1" */
export function formatStart(event: { startDate: string }, zone: string): string {
    const z = safeZone(zone);
    const start = new Date(event.startDate);
    return `${formatDay(start, z)} · ${formatClock(start, z)} ${zoneAbbreviation(start, z)}`;
}

/** Whether two zones show the same clock at that instant */
export function sameClock(date: Date | string, a: string, b: string): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    return zoneOffsetMinutes(d, a) === zoneOffsetMinutes(d, b);
}

export interface Countdown { label: string; ms: number }

/** "Starts in 2 days 3 hours", "Starts in 12 minutes". Null once it has started. */
export function countdownTo(startDate: string, now: Date): Countdown | null {
    const ms = new Date(startDate).getTime() - now.getTime();
    if (ms <= 0) return null;
    const days = Math.floor(ms / DAY);
    const hours = Math.floor((ms % DAY) / HOUR);
    const minutes = Math.max(1, Math.ceil((ms % HOUR) / MINUTE));
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
    let label: string;
    if (days >= 1) label = hours ? `${plural(days, 'day')} ${plural(hours, 'hour')}` : plural(days, 'day');
    else if (ms >= HOUR) {
        const m = Math.floor((ms % HOUR) / MINUTE);
        label = m ? `${plural(Math.floor(ms / HOUR), 'hour')} ${plural(m, 'minute')}` : plural(Math.floor(ms / HOUR), 'hour');
    } else label = plural(minutes, 'minute');
    return { label, ms };
}

/** Month bounds in a zone as UTC ISO strings, for the `from` and `to` list parameters */
export function monthRange(year: number, monthIndex: number, zone: string): { from: string; to: string } {
    const first = localToInstant(`${year}-${String(monthIndex + 1).padStart(2, '0')}-01`, '00:00', zone);
    const nextY = monthIndex === 11 ? year + 1 : year;
    const nextM = monthIndex === 11 ? 0 : monthIndex + 1;
    const next = localToInstant(`${nextY}-${String(nextM + 1).padStart(2, '0')}-01`, '00:00', zone);
    const from = first ?? new Date(Date.UTC(year, monthIndex, 1));
    const to = new Date((next ?? new Date(Date.UTC(nextY, nextM, 1))).getTime() - 1);
    return { from: from.toISOString(), to: to.toISOString() };
}
