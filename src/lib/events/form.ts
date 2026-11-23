/**
 * The event form: values as the inputs hold them, the zod schema that mirrors the API limits, and
 * the conversion to what the API wants. Dates are collected as date + time + zone and turned into
 * UTC instants here, explicitly, so the server never has to guess the zone.
 */

import { z } from 'zod';
import { EVENT_CATEGORIES, EVENT_FORMATS, type EventCategory, type EventDetail, type EventFormat, type EventType, type Speaker } from '@/types/event';
import { browserTimeZone, isValidTimeZone, localToInstant, toLocalParts, endOf } from './time';

export const EVENT_LIMITS = {
    title: { min: 5, max: 100 },
    shortDescription: 150,
    description: 20000,
    location: 200,
    venue: 200,
    organizer: 100,
    url: 2048,
    summaryNotes: 5000,
    tags: { count: 10, length: 30 },
    speakers: 10,
    speakerName: 100,
    speakerTitle: 150,
    speakerBio: 500,
    /** Members can host up to this many; more needs an administrator */
    memberCapacity: 500,
    capacity: 10000,
} as const;

export const CATEGORY_LABELS: Record<EventCategory, string> = {
    ctf: 'CTF',
    webinar: 'Webinar',
    workshop: 'Workshop',
    meetup: 'Meetup',
    conference: 'Conference',
    hackathon: 'Hackathon',
};

export const FORMAT_LABELS: Record<EventFormat, string> = {
    online: 'Online',
    'in-person': 'In person',
    hybrid: 'Hybrid',
};

export interface SpeakerValue extends Speaker { name: string }

export interface EventFormValues {
    title: string;
    shortDescription: string;
    category: EventCategory | '';
    locationType: EventFormat;
    location: string;
    venue: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    timezone: string;
    rsvpDeadlineDate: string;
    rsvpDeadlineTime: string;
    eventLink: string;
    registrationLink: string;
    image: string;
    description: string;
    /** Comma separated */
    tags: string;
    organizer: string;
    maxParticipants: string;
    waitlistEnabled: boolean;
    speakers: SpeakerValue[];
    recordingLink: string;
    slidesLink: string;
    summaryNotes: string;
    // Administrators only
    eventType: EventType;
    isFeatured: boolean;
}

/** Members always get a capacity (500 unless they choose less); only administrators can leave it open */
export function emptyEventForm(timezone: string = browserTimeZone(), admin = false): EventFormValues {
    return {
        title: '',
        shortDescription: '',
        category: '',
        locationType: 'online',
        location: '',
        venue: '',
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
        timezone,
        rsvpDeadlineDate: '',
        rsvpDeadlineTime: '',
        eventLink: '',
        registrationLink: '',
        image: '',
        description: '',
        tags: '',
        organizer: '',
        maxParticipants: admin ? '' : String(EVENT_LIMITS.memberCapacity),
        waitlistEnabled: true,
        speakers: [],
        recordingLink: '',
        slidesLink: '',
        summaryNotes: '',
        eventType: 'community',
        isFeatured: false,
    };
}

export function isHttpsUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
        return false;
    }
}

export function parseTags(value: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of value.split(',')) {
        const tag = raw.trim();
        if (!tag || seen.has(tag.toLowerCase())) continue;
        seen.add(tag.toLowerCase());
        out.push(tag);
    }
    return out;
}

const httpsLink = (label: string) =>
    z.string().trim()
        .max(EVENT_LIMITS.url, `${label} is too long`)
        .refine((v) => v === '' || isHttpsUrl(v), `${label} must be a valid https link`);

const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label} cannot exceed ${max} characters`);

export interface SchemaOptions {
    /** Administrators can set capacity up to 10,000 and the event type */
    admin?: boolean;
    /** Creating a new event: it has to start in the future for members */
    creating?: boolean;
    now?: Date;
}

export function createEventFormSchema({ admin = false, creating = false, now = new Date() }: SchemaOptions = {}) {
    const capacityMax = admin ? EVENT_LIMITS.capacity : EVENT_LIMITS.memberCapacity;

    return z.object({
        title: z.string().trim()
            .min(EVENT_LIMITS.title.min, `Title must be at least ${EVENT_LIMITS.title.min} characters`)
            .max(EVENT_LIMITS.title.max, `Title cannot exceed ${EVENT_LIMITS.title.max} characters`),
        shortDescription: optionalText(EVENT_LIMITS.shortDescription, 'The summary'),
        category: z.enum(EVENT_CATEGORIES, { error: 'Pick a category' }),
        locationType: z.enum(EVENT_FORMATS, { error: 'Pick a format' }),
        location: optionalText(EVENT_LIMITS.location, 'Location'),
        venue: optionalText(EVENT_LIMITS.venue, 'Venue'),
        startDate: z.string().min(1, 'Pick a start date'),
        startTime: z.string().min(1, 'Pick a start time'),
        endDate: z.string(),
        endTime: z.string(),
        timezone: z.string().refine(isValidTimeZone, 'Pick a valid time zone'),
        rsvpDeadlineDate: z.string(),
        rsvpDeadlineTime: z.string(),
        eventLink: httpsLink('The join link'),
        registrationLink: httpsLink('The registration link'),
        image: httpsLink('The image link'),
        description: z.string().trim()
            .min(1, 'Describe the event')
            .max(EVENT_LIMITS.description, `The description cannot exceed ${EVENT_LIMITS.description} characters`),
        tags: z.string().superRefine((value, ctx) => {
            const tags = parseTags(value);
            if (tags.length > EVENT_LIMITS.tags.count) {
                ctx.addIssue({ code: 'custom', message: `Use at most ${EVENT_LIMITS.tags.count} tags` });
            }
            if (tags.some((t) => t.length > EVENT_LIMITS.tags.length)) {
                ctx.addIssue({ code: 'custom', message: `Each tag can have at most ${EVENT_LIMITS.tags.length} characters` });
            }
        }),
        organizer: optionalText(EVENT_LIMITS.organizer, 'The organizer name'),
        maxParticipants: z.string().trim().refine((v) => {
            if (v === '') return admin;
            if (!/^\d+$/.test(v)) return false;
            const n = Number(v);
            return n >= 1 && n <= capacityMax;
        }, admin ? `Capacity must be a whole number from 1 to ${EVENT_LIMITS.capacity}` : `Capacity is required: a whole number from 1 to ${EVENT_LIMITS.memberCapacity}. No limit, or more, needs an administrator`),
        waitlistEnabled: z.boolean(),
        speakers: z.array(z.looseObject({
            name: z.string().trim().min(1, 'Speaker name is required').max(EVENT_LIMITS.speakerName, 'Speaker name is too long'),
            title: z.string().trim().max(EVENT_LIMITS.speakerTitle, 'Speaker title is too long').optional(),
            bio: z.string().trim().max(EVENT_LIMITS.speakerBio, `A speaker bio cannot exceed ${EVENT_LIMITS.speakerBio} characters`).optional(),
        })).max(EVENT_LIMITS.speakers, `At most ${EVENT_LIMITS.speakers} speakers`),
        recordingLink: httpsLink('The recording link'),
        slidesLink: httpsLink('The slides link'),
        summaryNotes: optionalText(EVENT_LIMITS.summaryNotes, 'The summary notes'),
        eventType: z.enum(['official', 'community']),
        isFeatured: z.boolean(),
    }).superRefine((v, ctx) => {
        const start = v.startDate && v.startTime && isValidTimeZone(v.timezone) ? localToInstant(v.startDate, v.startTime, v.timezone) : null;
        if (v.startDate && v.startTime && isValidTimeZone(v.timezone) && !start) {
            ctx.addIssue({ code: 'custom', path: ['startTime'], message: `That time does not exist in ${v.timezone} (the clock skips it). Pick another time` });
        }
        if (start && creating && !admin && start <= now) {
            ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'The start must be in the future' });
        }

        const hasEnd = v.endDate !== '' || v.endTime !== '';
        if (hasEnd) {
            if (v.endTime === '') {
                ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Add an end time, or clear the end date' });
            } else if (start) {
                const endDate = v.endDate || v.startDate;
                const end = localToInstant(endDate, v.endTime, v.timezone);
                if (!end) {
                    ctx.addIssue({ code: 'custom', path: ['endTime'], message: `That time does not exist in ${v.timezone} (the clock skips it)` });
                } else if (end <= start) {
                    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'The end must be after the start' });
                }
            }
        }

        const hasDeadline = v.rsvpDeadlineDate !== '' || v.rsvpDeadlineTime !== '';
        if (hasDeadline) {
            if (v.rsvpDeadlineDate === '' || v.rsvpDeadlineTime === '') {
                ctx.addIssue({ code: 'custom', path: ['rsvpDeadlineTime'], message: 'Set both a date and a time for the registration deadline, or clear both' });
            } else {
                const deadline = localToInstant(v.rsvpDeadlineDate, v.rsvpDeadlineTime, v.timezone);
                if (!deadline) {
                    ctx.addIssue({ code: 'custom', path: ['rsvpDeadlineTime'], message: 'Pick a valid registration deadline' });
                } else if (start && deadline > start) {
                    ctx.addIssue({ code: 'custom', path: ['rsvpDeadlineTime'], message: 'The registration deadline must be before the start' });
                }
            }
        }

        if (v.locationType !== 'online' && v.location === '' && v.venue === '') {
            ctx.addIssue({ code: 'custom', path: ['location'], message: 'Say where it happens (a city or a venue)' });
        }
    });
}

export type EventFormErrors = Partial<Record<keyof EventFormValues | string, string>>;

/** Validate; the first problem of each field is returned, keyed by the form field */
export function validateEventForm(values: EventFormValues, options: SchemaOptions = {}): { ok: true } | { ok: false; errors: EventFormErrors } {
    const result = createEventFormSchema(options).safeParse(values);
    if (result.success) return { ok: true };
    const errors: EventFormErrors = {};
    for (const issue of result.error.issues) {
        const key = issue.path.length ? issue.path.map(String).join('.') : 'form';
        if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
}

/** Where a field error from the API belongs on the form */
export const API_FIELD_TO_FORM: Record<string, keyof EventFormValues> = {
    startDate: 'startTime',
    endDate: 'endTime',
    rsvpDeadline: 'rsvpDeadlineTime',
};

export type EventPayload = Record<string, unknown>;

const SPEAKER_KEYS = ['name', 'title', 'bio', 'avatar', 'linkedin', 'twitter', 'github', 'website'] as const;

function cleanSpeaker(s: SpeakerValue): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of SPEAKER_KEYS) {
        const v = (s[key] ?? '').toString().trim();
        if (v) out[key] = v;
    }
    return out;
}

/**
 * Every field the form owns, as the API wants it. Cleared optional fields are '' (or null for the
 * end date and capacity) so an update can clear them; a create drops them (see `toCreatePayload`).
 */
export function toFullPayload(values: EventFormValues, { admin = false }: { admin?: boolean } = {}): EventPayload {
    const start = localToInstant(values.startDate, values.startTime, values.timezone);
    const hasEnd = values.endTime !== '';
    const end = hasEnd ? localToInstant(values.endDate || values.startDate, values.endTime, values.timezone) : null;
    const deadline = values.rsvpDeadlineDate && values.rsvpDeadlineTime
        ? localToInstant(values.rsvpDeadlineDate, values.rsvpDeadlineTime, values.timezone)
        : null;

    const payload: EventPayload = {
        title: values.title.trim(),
        description: values.description.trim(),
        shortDescription: values.shortDescription.trim(),
        category: values.category,
        locationType: values.locationType,
        location: values.location.trim(),
        venue: values.venue.trim(),
        timezone: values.timezone,
        startDate: start ? start.toISOString() : '',
        endDate: end ? end.toISOString() : null,
        rsvpDeadline: deadline ? deadline.toISOString() : null,
        eventLink: values.eventLink.trim(),
        registrationLink: values.registrationLink.trim(),
        image: values.image.trim(),
        tags: parseTags(values.tags),
        organizer: values.organizer.trim(),
        maxParticipants: values.maxParticipants.trim() === '' ? null : Number(values.maxParticipants),
        waitlistEnabled: values.waitlistEnabled,
        speakers: values.speakers.map(cleanSpeaker).filter((s) => s.name),
        recordingLink: values.recordingLink.trim(),
        slidesLink: values.slidesLink.trim(),
        summaryNotes: values.summaryNotes.trim(),
    };
    if (admin) {
        payload.eventType = values.eventType;
        payload.isFeatured = values.isFeatured;
    }
    return payload;
}

const isEmpty = (v: unknown) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0);

/**
 * A new event: empty optional fields are left out. The API rejects an empty description or title
 * and has defaults for the rest, so nothing blank is sent.
 */
export function toCreatePayload(values: EventFormValues, options: { admin?: boolean } = {}): EventPayload {
    const full = toFullPayload(values, options);
    const out: EventPayload = {};
    for (const [key, value] of Object.entries(full)) {
        if (key === 'waitlistEnabled' || key === 'isFeatured' || !isEmpty(value)) out[key] = value;
    }
    // A member's own event never carries the staff fields
    if (!options.admin) {
        delete out.eventType;
        delete out.isFeatured;
    }
    return out;
}

/**
 * An edit sends only what changed. That keeps fields the organizer can no longer touch (the title
 * of a public event) out of the request, and lets a cleared field be cleared.
 * `locked` fields are never sent.
 */
export function toUpdatePayload(
    values: EventFormValues,
    initial: EventFormValues,
    { admin = false, locked = [] as string[] }: { admin?: boolean; locked?: string[] } = {},
): EventPayload {
    const next = toFullPayload(values, { admin });
    const prev = toFullPayload(initial, { admin });
    const out: EventPayload = {};
    for (const key of Object.keys(next)) {
        if (locked.includes(key)) continue;
        if (JSON.stringify(next[key]) !== JSON.stringify(prev[key])) out[key] = next[key];
    }
    // A date and its zone only make sense together
    if ('timezone' in out || 'startDate' in out || 'endDate' in out) {
        out.timezone = next.timezone;
        out.startDate = next.startDate;
        if (prev.endDate !== null || next.endDate !== null) out.endDate = next.endDate;
        if (next.rsvpDeadline !== null || prev.rsvpDeadline !== null) out.rsvpDeadline = next.rsvpDeadline;
    }
    return out;
}

/** The form values for an existing event, with its instants shown in the organizer's zone */
export function eventToFormValues(event: EventDetail): EventFormValues {
    const zone = isValidTimeZone(event.timezone) ? event.timezone : 'UTC';
    const start = toLocalParts(event.startDate, zone);
    const hasEnd = !!event.endDate;
    const end = hasEnd ? toLocalParts(endOf(event), zone) : { date: '', time: '' };
    const deadline = event.rsvpDeadline ? toLocalParts(event.rsvpDeadline, zone) : { date: '', time: '' };
    return {
        title: event.title,
        shortDescription: event.shortDescription ?? '',
        category: event.category,
        locationType: event.locationType,
        location: event.location === 'Online' && event.locationType === 'online' ? '' : (event.location ?? ''),
        venue: event.venue ?? '',
        startDate: start.date,
        startTime: start.time,
        endDate: hasEnd ? (end.date === start.date ? '' : end.date) : '',
        endTime: hasEnd ? end.time : '',
        timezone: zone,
        rsvpDeadlineDate: deadline.date,
        rsvpDeadlineTime: deadline.time,
        eventLink: event.eventLink ?? event.joinLink ?? '',
        registrationLink: event.registrationLink ?? '',
        image: event.image ?? '',
        description: event.description ?? '',
        tags: (event.tags ?? []).join(', '),
        organizer: event.organizer ?? '',
        maxParticipants: event.maxParticipants ? String(event.maxParticipants) : '',
        waitlistEnabled: event.waitlistEnabled !== false,
        speakers: (event.speakers ?? []).map((s) => ({ ...s })),
        recordingLink: event.recordingLink ?? '',
        slidesLink: event.slidesLink ?? '',
        summaryNotes: event.summaryNotes ?? '',
        eventType: event.eventType,
        isFeatured: event.isFeatured,
    };
}

/** Fields a creator can still change by the state of the event (admins can change everything) */
export function lockedFieldsFor(event: Pick<EventDetail, 'status'> | null, isAdmin: boolean, effective: string): string[] {
    if (!event || isAdmin) return [];
    if (event.status === 'pending' || event.status === 'rejected') return [];
    const publicLocked = ['title', 'category', 'organizer'];
    if (effective === 'ended') {
        return [
            ...publicLocked, 'description', 'shortDescription', 'image', 'startDate', 'endDate', 'timezone', 'locationType', 'location', 'venue',
            'eventLink', 'registrationLink', 'tags', 'speakers', 'maxParticipants', 'rsvpDeadline', 'waitlistEnabled',
        ];
    }
    return publicLocked;
}
