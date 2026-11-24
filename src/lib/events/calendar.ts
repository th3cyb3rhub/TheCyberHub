/**
 * Calendar date math. Days are plain `YYYY-MM-DD` strings (a calendar day carries no zone), moved with
 * UTC arithmetic so a daylight saving change can never shift a day. Instants only appear when a range
 * is turned into the `from` and `to` the API wants, and when an event is put on a day: that happens in
 * the viewer's zone, so the cell a person sees matches the clock on their wall.
 */

import { EVENT_CATEGORIES, type CalendarItem, type EventCategory } from '@/types/event';
import { localToInstant, toLocalParts, MINUTE } from './time';

export const CALENDAR_VIEWS = ['month', 'week', 'agenda'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** The API refuses a longer range */
export const MAX_RANGE_DAYS = 62;
/** Monday. A week always has seven days; only the first one is a choice. */
export const WEEK_STARTS_ON = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DayKey = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (ms: number): DayKey => new Date(ms).toISOString().slice(0, 10);

/** A real calendar day, or null (`2026-02-31` and `2026-13-01` are not days) */
export function parseDay(value: string | null | undefined): DayKey | null {
    const m = DAY_RE.exec(value ?? '');
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 1970 || y > 2999) return null;
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? value as DayKey : null;
}

const ms = (day: DayKey): number => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};

export const addDays = (day: DayKey, n: number): DayKey => toKey(ms(day) + n * DAY_MS);

export function diffDays(a: DayKey, b: DayKey): number {
    return Math.round((ms(b) - ms(a)) / DAY_MS);
}

/** Months later (or earlier). The day of the month is kept, or cut back to the last day of a shorter month. */
export function addMonths(day: DayKey, n: number): DayKey {
    const [y, m, d] = day.split('-').map(Number);
    const index = y * 12 + (m - 1) + n;
    const year = Math.floor(index / 12);
    const month = ((index % 12) + 12) % 12;
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return `${String(year).padStart(4, '0')}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}

/** 0 is Sunday */
export const weekdayOf = (day: DayKey): number => new Date(ms(day)).getUTCDay();

export function startOfWeek(day: DayKey, weekStartsOn: number = WEEK_STARTS_ON): DayKey {
    return addDays(day, -((weekdayOf(day) - weekStartsOn + 7) % 7));
}

export const monthOf = (day: DayKey) => day.slice(0, 7);
export const firstOfMonth = (day: DayKey): DayKey => `${monthOf(day)}-01`;
export const lastOfMonth = (day: DayKey): DayKey => addDays(addMonths(firstOfMonth(day), 1), -1);

/** Every day from `first` to `last`, both included */
export function daysBetween(first: DayKey, last: DayKey): DayKey[] {
    const out: DayKey[] = [];
    const count = diffDays(first, last);
    for (let i = 0; i <= count; i++) out.push(addDays(first, i));
    return out;
}

export interface MonthGrid {
    /** `YYYY-MM` of the month the grid is built around */
    month: string;
    /** Always 6 rows of 7: the grid never changes height between months */
    rows: DayKey[][];
    first: DayKey;
    last: DayKey;
}

export function monthGrid(day: DayKey, weekStartsOn: number = WEEK_STARTS_ON): MonthGrid {
    const first = startOfWeek(firstOfMonth(day), weekStartsOn);
    const rows: DayKey[][] = [];
    for (let r = 0; r < 6; r++) rows.push(Array.from({ length: 7 }, (_, c) => addDays(first, r * 7 + c)));
    return { month: monthOf(day), rows, first, last: rows[5][6] };
}

export function weekOf(day: DayKey, weekStartsOn: number = WEEK_STARTS_ON): DayKey[] {
    const first = startOfWeek(day, weekStartsOn);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export interface VisibleRange {
    first: DayKey;
    last: DayKey;
    /** UTC instants for the API, covering `first` 00:00 to `last` 23:59:59.999 in the viewer's zone */
    from: string;
    to: string;
}

/** The first moment of a day in a zone. A midnight the clock skips (a few zones) resolves to the first moment after the gap. */
export function startOfDay(day: DayKey, zone: string): Date {
    const exact = localToInstant(day, '00:00', zone);
    if (exact) return exact;
    for (const time of ['00:30', '01:00', '01:30', '02:00']) {
        const later = localToInstant(day, time, zone);
        if (later) return later;
    }
    return new Date(ms(day));
}

export function rangeFor(first: DayKey, last: DayKey, zone: string): VisibleRange {
    const from = startOfDay(first, zone);
    const to = new Date(startOfDay(addDays(last, 1), zone).getTime() - 1);
    return { first, last, from: from.toISOString(), to: to.toISOString() };
}

/** What a view needs from the API: the whole grid for a month, one week, or a month for the agenda */
export function visibleRange(view: CalendarView, day: DayKey, zone: string): VisibleRange {
    if (view === 'month') {
        const grid = monthGrid(day);
        return rangeFor(grid.first, grid.last, zone);
    }
    if (view === 'week') {
        const week = weekOf(day);
        return rangeFor(week[0], week[6], zone);
    }
    return rangeFor(firstOfMonth(day), lastOfMonth(day), zone);
}

/** The length of a range in whole days, for the 62 day rule */
export function rangeLengthDays(range: Pick<VisibleRange, 'from' | 'to'>): number {
    return (new Date(range.to).getTime() - new Date(range.from).getTime()) / DAY_MS;
}

/** Previous or next page of a view: a month for the month and agenda views, a week for the week view */
export function shiftDay(view: CalendarView, day: DayKey, delta: number): DayKey {
    return view === 'week' ? addDays(day, 7 * delta) : addMonths(day, delta);
}

/** Today in a zone */
export function todayIn(zone: string, now: Date = new Date()): DayKey {
    return toLocalParts(now, zone).date;
}

// ---------------------------------------------------------------------------
// The address bar
// ---------------------------------------------------------------------------

export interface CalendarState {
    view: CalendarView;
    date: DayKey;
    category: EventCategory | '';
}

const isView = (v: string | null): v is CalendarView => !!v && (CALENDAR_VIEWS as readonly string[]).includes(v);
const isCategory = (v: string | null): v is EventCategory => !!v && (EVENT_CATEGORIES as readonly string[]).includes(v);

/**
 * `?view=week&date=2026-12-07&category=ctf`. A missing or broken value falls back: today, the
 * default view (agenda on a phone, month elsewhere), all categories. A phone never gets the month grid.
 * The old `?month=2026-12` link of the first calendar still works.
 */
export function parseCalendarParams(params: URLSearchParams, { today, phone }: { today: DayKey; phone: boolean }): CalendarState {
    const legacy = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(params.get('month') ?? '');
    const asked = params.get('view');
    const requested: CalendarView = isView(asked) ? asked : legacy || phone ? 'agenda' : 'month';
    const date = parseDay(params.get('date')) ?? (legacy ? `${legacy[1]}-${legacy[2]}-01` : today);
    const category = params.get('category');
    return {
        view: phone && requested === 'month' ? 'agenda' : requested,
        date,
        category: isCategory(category) ? category : '',
    };
}

/** The query string of a state, leaving out what the defaults already say */
export function calendarSearch(state: CalendarState, { today, phone }: { today: DayKey; phone: boolean }): string {
    const params = new URLSearchParams();
    const defaultView: CalendarView = phone ? 'agenda' : 'month';
    if (state.view !== defaultView) params.set('view', state.view);
    if (state.date !== today) params.set('date', state.date);
    if (state.category) params.set('category', state.category);
    return params.toString();
}

// ---------------------------------------------------------------------------
// Events on days
// ---------------------------------------------------------------------------

/** The days an item covers. A day-long event counts in its own zone; others in the viewer's. */
export function itemDays(item: Pick<CalendarItem, 'startDate' | 'endDate' | 'isAllDay' | 'timezone'>, viewerZone: string): { first: DayKey; last: DayKey } {
    const zone = item.isAllDay ? item.timezone : viewerZone;
    const start = new Date(item.startDate);
    const end = new Date(item.endDate);
    const first = toLocalParts(start, zone).date;
    // An event that ends exactly at midnight does not belong to the day that begins then
    const lastInstant = new Date(Math.max(end.getTime() - 1, start.getTime()));
    const last = toLocalParts(lastInstant, zone).date;
    // A runaway span (bad data) stops at the API's own limit
    const capped = diffDays(first, last) > MAX_RANGE_DAYS ? addDays(first, MAX_RANGE_DAYS) : last;
    return { first, last: capped };
}

export interface DayItem { item: CalendarItem; /** The event began on an earlier day */ continued: boolean }

/** Items by day, only the days from `first` to `last`, in time order (day-long events first) */
export function bucketByDay(items: CalendarItem[], viewerZone: string, first: DayKey, last: DayKey): Map<DayKey, DayItem[]> {
    const map = new Map<DayKey, DayItem[]>();
    const sorted = [...items].sort((a, b) => {
        if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime() || a.title.localeCompare(b.title);
    });
    for (const item of sorted) {
        const span = itemDays(item, viewerZone);
        const from = span.first < first ? first : span.first;
        const to = span.last > last ? last : span.last;
        for (let day = from; day <= to; day = addDays(day, 1)) {
            const list = map.get(day) ?? [];
            list.push({ item, continued: day !== span.first });
            map.set(day, list);
        }
    }
    return map;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Weekday names in column order of a grid */
export const gridWeekdays = (weekStartsOn: number = WEEK_STARTS_ON) => Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(weekStartsOn + i) % 7]);

/** "December 2026" */
export function monthTitle(day: DayKey): string {
    const [y, m] = day.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "Mon, December 7" */
export function dayTitle(day: DayKey): string {
    const [, m, d] = day.split('-').map(Number);
    return `${WEEKDAY_NAMES[weekdayOf(day)].slice(0, 3)}, ${MONTH_NAMES[m - 1]} ${d}`;
}

/** "Monday, December 7, 2026" for screen readers and headings */
export function dayLong(day: DayKey): string {
    const [y, m, d] = day.split('-').map(Number);
    return `${WEEKDAY_NAMES[weekdayOf(day)]}, ${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

/** "7 Dec" */
export function dayShort(day: DayKey): string {
    const [, m, d] = day.split('-').map(Number);
    return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}

/** "Dec 7 to Dec 13, 2026" for the week view */
export function weekTitle(days: DayKey[]): string {
    const [first, last] = [days[0], days[days.length - 1]];
    const [fy, fm, fd] = first.split('-').map(Number);
    const [ly, lm, ld] = last.split('-').map(Number);
    const short = (m: number) => MONTH_NAMES[m - 1].slice(0, 3);
    if (fy !== ly) return `${short(fm)} ${fd}, ${fy} to ${short(lm)} ${ld}, ${ly}`;
    if (fm !== lm) return `${short(fm)} ${fd} to ${short(lm)} ${ld}, ${ly}`;
    return `${short(fm)} ${fd} to ${ld}, ${ly}`;
}

/** "no events", "1 event", "3 events" */
export const countLabel = (n: number) => (n === 0 ? 'no events' : `${n} ${n === 1 ? 'event' : 'events'}`);

/** Minutes an event lasts, for tests and the week view */
export const durationMinutes = (item: Pick<CalendarItem, 'startDate' | 'endDate'>) =>
    Math.max(0, Math.round((new Date(item.endDate).getTime() - new Date(item.startDate).getTime()) / MINUTE));
