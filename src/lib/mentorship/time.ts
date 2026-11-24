/**
 * Session and availability times. The API keeps instants in UTC and a zone as a display hint; a
 * mentor's weekly slots are wall clock hours in the mentor's own zone. Built on the events helpers
 * (Intl, fixed locale), so server and browser render the same text.
 */

import {
    formatClock, formatDay, isValidTimeZone, localToInstant, sameClock, toLocalParts, zoneAbbreviation, MINUTE, DAY,
} from '@/lib/events/time';
import type { AvailabilitySlot } from '@/types/mentorship';

export { browserTimeZone, isValidTimeZone, localToInstant, toLocalParts, zoneAbbreviation } from '@/lib/events/time';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Mirrors the API: at least 5 minutes ahead, at most 90 days ahead */
export const SESSION_MIN_LEAD_MINUTES = 5;
export const SESSION_MAX_AHEAD_DAYS = 90;

const safe = (zone: string | null | undefined) => (isValidTimeZone(zone) ? zone : 'UTC');

/** "Sat, Dec 5 · 6:00 PM GMT+1" in one zone */
export function formatMoment(instant: Date | string, zone: string): string {
    const z = safe(zone);
    const d = typeof instant === 'string' ? new Date(instant) : instant;
    return `${formatDay(d, z)} · ${formatClock(d, z)} ${zoneAbbreviation(d, z)}`;
}

export interface SessionTimes {
    /** The time in the viewer's zone, or in UTC while the viewer's zone is not known yet */
    primary: string;
    /** The same moment in the zone the session was planned in, when that shows a different clock */
    secondary: string | null;
}

/**
 * How a session time reads for the viewer. When the planner's zone shows another clock, that time
 * is added so both people can see the same moment in both places.
 */
export function sessionTimes(scheduledAt: string, hintZone: string | null | undefined, viewerZone: string | null): SessionTimes {
    const view = safe(viewerZone);
    const hint = safe(hintZone);
    const at = new Date(scheduledAt);
    const primary = formatMoment(at, view);
    if (!viewerZone || sameClock(at, view, hint)) return { primary, secondary: null };
    return { primary, secondary: formatMoment(at, hint) };
}

/** "6:00 PM – 7:00 PM GMT+1" for the card's time line */
export function clockRange(scheduledAt: string, durationMinutes: number, zone: string): string {
    const z = safe(zone);
    const start = new Date(scheduledAt);
    const end = new Date(start.getTime() + durationMinutes * MINUTE);
    return `${formatClock(start, z)} – ${formatClock(end, z)} ${zoneAbbreviation(start, z)}`;
}

/** The instant the form values name, or null when the date or time is malformed or was skipped by a clock change */
export function sessionInstant(date: string, time: string, zone: string): Date | null {
    if (!date || !time) return null;
    return localToInstant(date, time, zone);
}

export type SessionWindow = 'ok' | 'invalid' | 'too-soon' | 'too-far';

export function sessionWindow(instant: Date | null, now: Date): SessionWindow {
    if (!instant) return 'invalid';
    const lead = instant.getTime() - now.getTime();
    if (lead < SESSION_MIN_LEAD_MINUTES * MINUTE) return 'too-soon';
    if (lead > SESSION_MAX_AHEAD_DAYS * DAY) return 'too-far';
    return 'ok';
}

// ---------------------------------------------------------------------------
// Weekly availability
// ---------------------------------------------------------------------------

const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;

function addDays(date: string, days: number): string {
    const m = DATE_PARTS.exec(date);
    if (!m) return date;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function weekdayOf(date: string): number {
    const m = DATE_PARTS.exec(date);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() : 0;
}

const hh = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`;

export interface SlotView {
    /** The slot as the mentor wrote it: "Mon 10:00 – 12:00 GMT+1" */
    mentor: string;
    /** The same slot in the viewer's zone, with the day it falls on there. Null when the clocks agree. */
    viewer: string | null;
}

/**
 * One weekly slot in both zones. The slot is read on the next occurrence of its weekday (from
 * `ref`), so a clock change between the zones is applied the way it will be that week.
 */
export function slotView(slot: AvailabilitySlot, mentorZone: string, viewerZone: string | null, ref: Date): SlotView {
    const mz = safe(mentorZone);
    const today = toLocalParts(ref, mz).date;
    const ahead = (slot.dayOfWeek - weekdayOf(today) + 7) % 7;
    const day = addDays(today, ahead);
    const start = localToInstant(day, hh(slot.startHour), mz);
    const end = slot.endHour >= 24 ? localToInstant(addDays(day, 1), '00:00', mz) : localToInstant(day, hh(slot.endHour), mz);
    const label = `${DAY_SHORT[slot.dayOfWeek]} ${hh(slot.startHour)} – ${slot.endHour >= 24 ? '24:00' : hh(slot.endHour)} ${start ? zoneAbbreviation(start, mz) : mz}`;
    if (!start || !end || !viewerZone || !isValidTimeZone(viewerZone) || sameClock(start, mz, viewerZone)) {
        return { mentor: label, viewer: null };
    }
    const vz = viewerZone;
    const sp = toLocalParts(start, vz);
    const ep = toLocalParts(end, vz);
    const startDay = formatDay(start, vz).split(',')[0];
    const endText = sp.date === ep.date ? formatClock(end, vz) : `${formatDay(end, vz).split(',')[0]} ${formatClock(end, vz)}`;
    return { mentor: label, viewer: `${startDay} ${formatClock(start, vz)} – ${endText} ${zoneAbbreviation(start, vz)}` };
}

/** Slots sorted Monday first (Sunday last), then by start hour */
export function sortSlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
    const order = (d: number) => (d + 6) % 7;
    return [...slots].sort((a, b) => order(a.dayOfWeek) - order(b.dayOfWeek) || a.startHour - b.startHour);
}
