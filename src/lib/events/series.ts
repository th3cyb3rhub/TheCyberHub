/**
 * Recurring series: the words for a schedule, the create and edit forms with the limits the API
 * enforces (so a mistake is caught before the request), and the payloads the API wants.
 */

import { z } from 'zod';
import { EVENT_CATEGORIES, EVENT_FORMATS, SERIES_RULES, type CalendarItem, type EventCategory, type EventFormat, type Series, type SeriesRecurrence, type SeriesRule } from '@/types/event';
import { addDays, MONTH_NAMES, parseDay, WEEKDAY_NAMES } from './calendar';
import { EVENT_LIMITS, isHttpsUrl, parseTags } from './form';
import { browserTimeZone, isValidTimeZone, localToInstant, toLocalParts } from './time';

/** Mirrors the API (`SERIES` limits). `startsOn` may be one year back and two years ahead. */
export const SERIES_LIMITS = {
    interval: { min: 1, max: 12 },
    count: { min: 1, max: 520 },
    durationMinutes: { min: 15, max: 1440 },
    defaultDurationMinutes: 120,
    generateAheadDays: { min: 7, max: 365, default: 60 },
    startsOnBackDays: 366,
    startsOnAheadDays: 731,
    reason: { min: 3, max: 500 },
    /** A staff member can run this many series at once */
    runningPerPerson: 20,
} as const;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const ORDINALS: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };

const longDate = (day: string): string => {
    const [y, m, d] = day.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
};

/** "2 hours", "90 minutes", "1 hour 30 minutes" */
export function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const hours = h ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
    const mins = m ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '';
    return [hours, mins].filter(Boolean).join(' ') || '0 minutes';
}

/**
 * The schedule in plain words, in the series' own zone: "Every Thursday at 19:00 Europe/London",
 * "Every 2 weeks on Thursday at 19:00 Europe/London", "On the last Friday of every month at 18:30 UTC".
 */
export function describeRecurrence(r: Pick<SeriesRecurrence, 'rule' | 'interval' | 'weekday' | 'weekOfMonth' | 'startTime' | 'timezone'> & Partial<Pick<SeriesRecurrence, 'until' | 'count'>>): string {
    const day = WEEKDAY_NAMES[r.weekday] ?? 'day';
    const at = `at ${r.startTime} ${r.timezone}`;
    let text: string;
    if (r.rule === 'monthly-by-weekday') {
        const nth = ORDINALS[r.weekOfMonth ?? 1] ?? 'first';
        text = r.interval <= 1 ? `On the ${nth} ${day} of every month ${at}` : `On the ${nth} ${day} of every ${r.interval} months ${at}`;
    } else {
        const weeks = r.rule === 'biweekly' ? r.interval * 2 : r.interval;
        text = weeks <= 1 ? `Every ${day} ${at}` : `Every ${weeks} weeks on ${day} ${at}`;
    }
    if (r.until) text += `, until ${longDate(r.until)}`;
    else if (r.count) text += `, ${r.count} ${r.count === 1 ? 'occurrence' : 'occurrences'} in all`;
    return text;
}

export const RULE_LABELS: Record<SeriesRule, string> = {
    weekly: 'Weekly',
    biweekly: 'Every other week (times the interval)',
    'monthly-by-weekday': 'Monthly, on the same weekday',
};

export const WEEK_OF_MONTH_OPTIONS = [
    { value: '1', label: 'First' },
    { value: '2', label: 'Second' },
    { value: '3', label: 'Third' },
    { value: '4', label: 'Fourth' },
    { value: '-1', label: 'Last' },
] as const;

export const SERIES_STATUS_LABELS = { active: 'Running', paused: 'Paused', ended: 'Ended' } as const;

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

export interface SeriesFormValues {
    title: string;
    shortDescription: string;
    description: string;
    category: EventCategory | '';
    locationType: EventFormat;
    location: string;
    venue: string;
    eventLink: string;
    registrationLink: string;
    streamLink: string;
    image: string;
    tags: string;
    organizer: string;
    maxParticipants: string;
    waitlistEnabled: boolean;
    rsvpEnabled: boolean;
    rule: SeriesRule;
    interval: string;
    weekday: string;
    weekOfMonth: string;
    startsOn: string;
    startTime: string;
    timezone: string;
    durationMinutes: string;
    until: string;
    count: string;
    generateAheadDays: string;
}

export function emptySeriesForm(timezone: string = browserTimeZone(), admin = false): SeriesFormValues {
    return {
        title: '', shortDescription: '', description: '', category: '', locationType: 'online', location: '', venue: '',
        eventLink: '', registrationLink: '', streamLink: '', image: '', tags: '', organizer: '',
        maxParticipants: admin ? '' : String(EVENT_LIMITS.memberCapacity),
        waitlistEnabled: true, rsvpEnabled: true,
        rule: 'weekly', interval: '1', weekday: '4', weekOfMonth: '1', startsOn: '', startTime: '19:00', timezone,
        durationMinutes: String(SERIES_LIMITS.defaultDurationMinutes), until: '', count: '', generateAheadDays: String(SERIES_LIMITS.generateAheadDays.default),
    };
}

const httpsLink = (label: string) =>
    z.string().trim().max(EVENT_LIMITS.url, `${label} is too long`).refine((v) => v === '' || isHttpsUrl(v), `${label} must be a valid https link`);

const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label} cannot exceed ${max} characters`);

const wholeNumber = (label: string, min: number, max: number, { optional = false }: { optional?: boolean } = {}) =>
    z.string().trim().refine((v) => {
        if (v === '') return optional;
        if (!/^\d+$/.test(v)) return false;
        const n = Number(v);
        return n >= min && n <= max;
    }, `${label} must be a whole number from ${min} to ${max}${optional ? ', or empty' : ''}`);

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The first and last day `startsOn` may be, counted from today in the series' zone */
export function startsOnBounds(zone: string, now: Date = new Date()): { min: string; max: string } {
    const today = toLocalParts(now, isValidTimeZone(zone) ? zone : 'UTC').date;
    return { min: addDays(today, -SERIES_LIMITS.startsOnBackDays), max: addDays(today, SERIES_LIMITS.startsOnAheadDays) };
}

export interface SeriesSchemaOptions { admin?: boolean; now?: Date }

export function createSeriesFormSchema({ admin = false, now = new Date() }: SeriesSchemaOptions = {}) {
    const capacityMax = admin ? EVENT_LIMITS.capacity : EVENT_LIMITS.memberCapacity;
    return z.object({
        title: z.string().trim()
            .min(EVENT_LIMITS.title.min, `Title must be at least ${EVENT_LIMITS.title.min} characters`)
            .max(EVENT_LIMITS.title.max, `Title cannot exceed ${EVENT_LIMITS.title.max} characters`),
        shortDescription: optionalText(EVENT_LIMITS.shortDescription, 'The summary'),
        description: z.string().trim().min(1, 'Describe the series').max(EVENT_LIMITS.description, `The description cannot exceed ${EVENT_LIMITS.description} characters`),
        category: z.enum(EVENT_CATEGORIES, { error: 'Pick a category' }),
        locationType: z.enum(EVENT_FORMATS, { error: 'Pick a format' }),
        location: optionalText(EVENT_LIMITS.location, 'Location'),
        venue: optionalText(EVENT_LIMITS.venue, 'Venue'),
        eventLink: httpsLink('The join link'),
        registrationLink: httpsLink('The registration link'),
        streamLink: httpsLink('The stream link'),
        image: httpsLink('The image link'),
        tags: z.string().superRefine((value, ctx) => {
            const tags = parseTags(value);
            if (tags.length > EVENT_LIMITS.tags.count) ctx.addIssue({ code: 'custom', message: `Use at most ${EVENT_LIMITS.tags.count} tags` });
            if (tags.some((t) => t.length > EVENT_LIMITS.tags.length)) ctx.addIssue({ code: 'custom', message: `Each tag can have at most ${EVENT_LIMITS.tags.length} characters` });
        }),
        organizer: optionalText(EVENT_LIMITS.organizer, 'The organizer name'),
        maxParticipants: z.string().trim().refine((v) => {
            if (v === '') return admin;
            if (!/^\d+$/.test(v)) return false;
            const n = Number(v);
            return n >= 1 && n <= capacityMax;
        }, admin ? `Capacity must be a whole number from 1 to ${EVENT_LIMITS.capacity}` : `Capacity is required: a whole number from 1 to ${EVENT_LIMITS.memberCapacity}. No limit, or more, needs an administrator`),
        waitlistEnabled: z.boolean(),
        rsvpEnabled: z.boolean(),
        rule: z.enum(SERIES_RULES, { error: 'Pick how often it repeats' }),
        interval: wholeNumber('Repeat every', SERIES_LIMITS.interval.min, SERIES_LIMITS.interval.max),
        weekday: z.string().refine((v) => /^[0-6]$/.test(v), 'Pick a weekday'),
        weekOfMonth: z.string().refine((v) => ['1', '2', '3', '4', '-1'].includes(v), 'Pick which one of the month'),
        startsOn: z.string().min(1, 'Pick the first date').refine((v) => parseDay(v) !== null, 'Pick a real date'),
        startTime: z.string().refine((v) => TIME_RE.test(v), 'Pick a start time'),
        timezone: z.string().refine(isValidTimeZone, 'Pick a valid time zone'),
        durationMinutes: wholeNumber('The length', SERIES_LIMITS.durationMinutes.min, SERIES_LIMITS.durationMinutes.max),
        until: z.string().refine((v) => v === '' || parseDay(v) !== null, 'Pick a real date'),
        count: wholeNumber('The number of occurrences', SERIES_LIMITS.count.min, SERIES_LIMITS.count.max, { optional: true }),
        generateAheadDays: wholeNumber('Create ahead', SERIES_LIMITS.generateAheadDays.min, SERIES_LIMITS.generateAheadDays.max),
    }).superRefine((v, ctx) => {
        if (v.startsOn && parseDay(v.startsOn)) {
            const { min, max } = startsOnBounds(v.timezone, now);
            if (v.startsOn < min) ctx.addIssue({ code: 'custom', path: ['startsOn'], message: `The first date cannot be more than 366 days in the past (${min} or later)` });
            else if (v.startsOn > max) ctx.addIssue({ code: 'custom', path: ['startsOn'], message: `The first date cannot be more than 731 days ahead (${max} or earlier)` });
            else if (isValidTimeZone(v.timezone) && TIME_RE.test(v.startTime) && !localToInstant(v.startsOn, v.startTime, v.timezone)) {
                // The first date is the one a clock change can skip; later dates are moved after the gap by the API
                ctx.addIssue({ code: 'custom', path: ['startTime'], message: `That time does not exist on the first date in ${v.timezone} (the clock skips it). Pick another time` });
            }
        }
        if (v.until && parseDay(v.until) && v.startsOn && v.until < v.startsOn) {
            ctx.addIssue({ code: 'custom', path: ['until'], message: 'The last date cannot be before the first date' });
        }
        if (v.until && v.count) {
            ctx.addIssue({ code: 'custom', path: ['count'], message: 'Use a last date or a number of occurrences, not both' });
        }
        if (v.locationType !== 'online' && v.location === '' && v.venue === '') {
            ctx.addIssue({ code: 'custom', path: ['location'], message: 'Say where it happens (a city or a venue)' });
        }
    });
}

export type SeriesFormErrors = Partial<Record<keyof SeriesFormValues | 'form' | string, string>>;

export function validateSeriesForm(values: SeriesFormValues, options: SeriesSchemaOptions = {}): { ok: true } | { ok: false; errors: SeriesFormErrors } {
    const result = createSeriesFormSchema(options).safeParse(values);
    if (result.success) return { ok: true };
    const errors: SeriesFormErrors = {};
    for (const issue of result.error.issues) {
        const key = issue.path.length ? issue.path.map(String).join('.') : 'form';
        if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
}

/** Where a field error of the API belongs on the form (`recurrence.startsOn` is the `startsOn` input) */
export function seriesFieldKey(apiField: string): string {
    return apiField.replace(/^recurrence\./, '');
}

export type SeriesPayload = Record<string, unknown>;

const isEmpty = (v: unknown) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0);

/** The body of the create call. Empty optional fields are left out so the API defaults apply. */
export function toSeriesPayload(values: SeriesFormValues, { admin = false }: { admin?: boolean } = {}): SeriesPayload {
    const template: SeriesPayload = {
        title: values.title.trim(),
        description: values.description.trim(),
        shortDescription: values.shortDescription.trim(),
        category: values.category,
        locationType: values.locationType,
        location: values.location.trim(),
        venue: values.venue.trim(),
        eventLink: values.eventLink.trim(),
        registrationLink: values.registrationLink.trim(),
        streamLink: values.streamLink.trim(),
        image: values.image.trim(),
        tags: parseTags(values.tags),
        organizer: values.organizer.trim(),
        maxParticipants: values.maxParticipants.trim() === '' ? undefined : Number(values.maxParticipants),
        waitlistEnabled: values.waitlistEnabled,
        rsvpEnabled: values.rsvpEnabled,
    };
    const body: SeriesPayload = {};
    for (const [key, value] of Object.entries(template)) {
        if (key === 'waitlistEnabled' || key === 'rsvpEnabled' || !isEmpty(value)) body[key] = value;
    }
    // Only an administrator can leave capacity open: an empty field then means "no limit"
    if (admin && values.maxParticipants.trim() === '') body.maxParticipants = null;

    const recurrence: Record<string, unknown> = {
        rule: values.rule,
        interval: Number(values.interval),
        weekday: Number(values.weekday),
        startsOn: values.startsOn,
        startTime: values.startTime,
        timezone: values.timezone,
        durationMinutes: Number(values.durationMinutes),
        until: values.until || null,
        count: values.count ? Number(values.count) : null,
    };
    if (values.rule === 'monthly-by-weekday') recurrence.weekOfMonth = Number(values.weekOfMonth);
    body.recurrence = recurrence;
    body.generateAheadDays = Number(values.generateAheadDays);
    return body;
}

// ---------------------------------------------------------------------------
// Edit: one occurrence or this and all future ones
// ---------------------------------------------------------------------------

export type SeriesScope = 'this' | 'future';

export interface SeriesEditValues {
    title: string;
    shortDescription: string;
    description: string;
    locationType: EventFormat;
    location: string;
    venue: string;
    eventLink: string;
    registrationLink: string;
    streamLink: string;
    maxParticipants: string;
    waitlistEnabled: boolean;
    durationMinutes: string;
    // scope "this": move the occurrence
    moveDate: string;
    moveTime: string;
    // scope "future"
    startTime: string;
    timezone: string;
    until: string;
    count: string;
    generateAheadDays: string;
}

export function seriesToEditValues(series: Series): SeriesEditValues {
    const r = series.recurrence;
    return {
        title: series.title,
        shortDescription: series.shortDescription ?? '',
        description: series.description ?? '',
        locationType: series.format,
        location: series.location ?? '',
        venue: series.venue ?? '',
        eventLink: series.eventLink ?? '',
        registrationLink: series.registrationLink ?? '',
        streamLink: series.streamLink ?? '',
        maxParticipants: series.maxParticipants ? String(series.maxParticipants) : '',
        waitlistEnabled: series.waitlistEnabled,
        durationMinutes: String(r.durationMinutes),
        moveDate: '',
        moveTime: '',
        startTime: r.startTime,
        timezone: r.timezone,
        until: r.until ?? '',
        count: r.count ? String(r.count) : '',
        generateAheadDays: String(series.generateAheadDays ?? SERIES_LIMITS.generateAheadDays.default),
    };
}

export function validateSeriesEdit(
    values: SeriesEditValues,
    scope: SeriesScope,
    { admin = false, occurrence }: { admin?: boolean; occurrence?: Pick<CalendarItem, 'timezone'> | null } = {},
): { ok: true } | { ok: false; errors: SeriesFormErrors } {
    const errors: SeriesFormErrors = {};
    const fail = (key: string, message: string) => { if (!errors[key]) errors[key] = message; };
    const check = (key: string, schema: z.ZodType, value: unknown) => {
        const r = schema.safeParse(value);
        if (!r.success) fail(key, r.error.issues[0].message);
    };
    check('title', z.string().trim().min(EVENT_LIMITS.title.min, `Title must be at least ${EVENT_LIMITS.title.min} characters`).max(EVENT_LIMITS.title.max, `Title cannot exceed ${EVENT_LIMITS.title.max} characters`), values.title);
    check('description', z.string().trim().min(1, 'Describe the series').max(EVENT_LIMITS.description, `The description cannot exceed ${EVENT_LIMITS.description} characters`), values.description);
    check('shortDescription', optionalText(EVENT_LIMITS.shortDescription, 'The summary'), values.shortDescription);
    check('location', optionalText(EVENT_LIMITS.location, 'Location'), values.location);
    check('venue', optionalText(EVENT_LIMITS.venue, 'Venue'), values.venue);
    check('eventLink', httpsLink('The join link'), values.eventLink);
    check('registrationLink', httpsLink('The registration link'), values.registrationLink);
    check('streamLink', httpsLink('The stream link'), values.streamLink);
    check('durationMinutes', wholeNumber('The length', SERIES_LIMITS.durationMinutes.min, SERIES_LIMITS.durationMinutes.max), values.durationMinutes);
    const capacityMax = admin ? EVENT_LIMITS.capacity : EVENT_LIMITS.memberCapacity;
    check('maxParticipants', z.string().trim().refine((v) => {
        if (v === '') return admin;
        return /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= capacityMax;
    }, admin ? `Capacity must be a whole number from 1 to ${EVENT_LIMITS.capacity}` : `Capacity must be a whole number from 1 to ${EVENT_LIMITS.memberCapacity}`), values.maxParticipants);

    if (scope === 'this') {
        if (values.moveDate || values.moveTime) {
            if (!values.moveDate || !values.moveTime) fail('moveTime', 'Set both a date and a time to move this occurrence, or clear both');
            else if (parseDay(values.moveDate) === null) fail('moveDate', 'Pick a real date');
            else if (occurrence && !localToInstant(values.moveDate, values.moveTime, occurrence.timezone)) fail('moveTime', `That time does not exist in ${occurrence.timezone} (the clock skips it)`);
        }
    } else {
        check('startTime', z.string().refine((v) => TIME_RE.test(v), 'Pick a start time'), values.startTime);
        check('timezone', z.string().refine(isValidTimeZone, 'Pick a valid time zone'), values.timezone);
        check('until', z.string().refine((v) => v === '' || parseDay(v) !== null, 'Pick a real date'), values.until);
        check('count', wholeNumber('The number of occurrences', SERIES_LIMITS.count.min, SERIES_LIMITS.count.max, { optional: true }), values.count);
        check('generateAheadDays', wholeNumber('Create ahead', SERIES_LIMITS.generateAheadDays.min, SERIES_LIMITS.generateAheadDays.max), values.generateAheadDays);
        if (values.until && values.count) fail('count', 'Use a last date or a number of occurrences, not both');
    }
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The PATCH body: only what changed, so the API never sees (and a moderator never trips over) a field
 * that was left alone. An empty result means there is nothing to save.
 */
export function toSeriesPatch(
    initial: SeriesEditValues,
    values: SeriesEditValues,
    scope: SeriesScope,
    { eventId, occurrenceZone }: { eventId?: string; occurrenceZone?: string } = {},
): SeriesPayload {
    const text = (v: SeriesEditValues) => ({
        title: v.title.trim(),
        shortDescription: v.shortDescription.trim(),
        description: v.description.trim(),
        locationType: v.locationType,
        location: v.location.trim(),
        venue: v.venue.trim(),
        eventLink: v.eventLink.trim(),
        registrationLink: v.registrationLink.trim(),
        streamLink: v.streamLink.trim(),
        maxParticipants: v.maxParticipants.trim() === '' ? null : Number(v.maxParticipants),
        waitlistEnabled: v.waitlistEnabled,
        durationMinutes: Number(v.durationMinutes),
    });
    const next = text(values);
    const prev = text(initial);
    const changes: SeriesPayload = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
        if (!same(next[key], prev[key])) changes[key] = next[key];
    }
    if (scope === 'this') {
        if (values.moveDate && values.moveTime && occurrenceZone) {
            const start = localToInstant(values.moveDate, values.moveTime, occurrenceZone);
            if (start) changes.startDate = start.toISOString();
        }
    } else {
        if (values.startTime !== initial.startTime) changes.startTime = values.startTime;
        if (values.timezone !== initial.timezone) changes.timezone = values.timezone;
        if (values.until !== initial.until) changes.until = values.until || null;
        if (values.count !== initial.count) changes.count = values.count ? Number(values.count) : null;
        if (values.generateAheadDays !== initial.generateAheadDays) changes.generateAheadDays = Number(values.generateAheadDays);
    }
    if (!Object.keys(changes).length) return {};
    return scope === 'this' ? { scope, eventId, ...changes } : { scope, ...changes };
}

/** A series id is a 24 character hex string; anything else cannot be a series, so no request is made */
export const isSeriesId = (value: string) => /^[0-9a-fA-F]{24}$/.test(value);

