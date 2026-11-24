import { z } from 'zod';
import { browserTimeZone, isValidTimeZone, localToInstant, toLocalParts } from '@/lib/events/time';
import { isPublicHttpUrl } from '@/lib/internships/application';
import { fieldErrors } from './errors';
import { CTF_LIMITS } from './constants';
import type { CtfCompetition, CtfPayload, CtfScoringMode } from '@/types/ctf';
import { CTF_SCORING_MODES } from '@/types/ctf';

/** Every limit mirrors the API (`config/ctf.js`, `validations/ctf.validation.js`), so a form never sends what the server refuses */
export const FORM_LIMITS = {
    ...CTF_LIMITS,
    placeMax: 1000,
    timezoneMax: 64,
    url: 500,
    minTeamSizeMin: 1,
} as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let counter = 0;
/** A local React key for a row that has no id yet */
export const rowKey = () => `row-${++counter}`;

/**
 * What the status box offers. `published` is stored as `upcoming` and then follows the dates (a
 * competition never claims to be live before its start). `ended` ends it now. A cancelled competition
 * is only shown, never chosen: cancelling has its own button.
 */
export const FORM_STATUSES = ['draft', 'published', 'ended', 'cancelled'] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
    draft: 'Draft: only staff see it',
    published: 'Published: everyone sees it, the dates decide when it runs',
    ended: 'Ended: close it now (the end moves to now)',
    cancelled: 'Cancelled',
};

export interface PrizeRow { key: string; place: string; reward: string }

export interface CtfFormValues {
    title: string;
    slug: string;
    shortDescription: string;
    description: string;
    rules: string;
    image: string;
    timezone: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    /** Optional: the board stops moving at this moment */
    frozenDate: string;
    frozenTime: string;
    status: FormStatus;
    isPublic: boolean;
    isFeatured: boolean;
    registrationOpen: boolean;
    teamsEnabled: boolean;
    /** Text so an empty box is not 0 */
    minTeamSize: string;
    maxTeamSize: string;
    maxParticipants: string;
    scoringMode: CtfScoringMode;
    awardsPoints: boolean;
    prizes: PrizeRow[];
    prizesNote: string;
    /** Challenge ids. Used when creating; an existing competition changes its set with instant actions. */
    challenges: string[];
}

export const emptyCompetition = (timezone: string = browserTimeZone()): CtfFormValues => ({
    title: '', slug: '', shortDescription: '', description: '', rules: '', image: '',
    timezone, startDate: '', startTime: '', endDate: '', endTime: '', frozenDate: '', frozenTime: '',
    status: 'draft', isPublic: true, isFeatured: false, registrationOpen: true,
    teamsEnabled: false, minTeamSize: '1', maxTeamSize: String(FORM_LIMITS.teamSizeDefault), maxParticipants: '0',
    scoringMode: 'static', awardsPoints: false, prizes: [], prizesNote: '', challenges: [],
});

export const newPrize = (place = ''): PrizeRow => ({ key: rowKey(), place, reward: '' });

/** The next free place for a new prize row: 1, then one after the highest */
export function nextPlace(rows: readonly PrizeRow[]): string {
    const places = rows.map((r) => Number(r.place)).filter((n) => Number.isInteger(n) && n > 0);
    return String(places.length ? Math.max(...places) + 1 : 1);
}

// ---------------------------------------------------------------------------
// Competition -> form
// ---------------------------------------------------------------------------

const formStatusOf = (status: CtfCompetition['status']): FormStatus =>
    status === 'draft' ? 'draft' : status === 'cancelled' ? 'cancelled' : status === 'ended' ? 'ended' : 'published';

/** The competition as the form edits it, with its instants shown in the competition's own zone */
export function fromCompetition(c: CtfCompetition): CtfFormValues {
    const zone = isValidTimeZone(c.timezone) ? c.timezone : 'UTC';
    const start = toLocalParts(c.startDate, zone);
    const end = toLocalParts(c.endDate, zone);
    const frozen = c.frozenAt ? toLocalParts(c.frozenAt, zone) : { date: '', time: '' };
    return {
        title: c.title,
        slug: c.slug,
        shortDescription: c.shortDescription ?? '',
        description: c.description ?? '',
        rules: c.rules ?? '',
        image: c.image ?? '',
        timezone: zone,
        startDate: start.date, startTime: start.time,
        endDate: end.date, endTime: end.time,
        frozenDate: frozen.date, frozenTime: frozen.time,
        status: formStatusOf(c.status),
        isPublic: c.isPublic ?? true,
        isFeatured: !!c.isFeatured,
        registrationOpen: !!c.registrationOpen,
        teamsEnabled: !!c.teamsEnabled,
        minTeamSize: String(c.minTeamSize ?? 1),
        maxTeamSize: String(c.maxTeamSize ?? FORM_LIMITS.teamSizeDefault),
        maxParticipants: String(c.maxParticipants ?? 0),
        scoringMode: c.scoringMode,
        awardsPoints: !!c.awardsPoints,
        prizes: [...(c.prizes ?? [])].sort((a, b) => a.place - b.place).map((p) => ({ key: rowKey(), place: String(p.place), reward: p.reward })),
        prizesNote: c.prizesNote ?? '',
        challenges: [...(c.challenges ?? [])],
    };
}

/**
 * The same moment in another zone: the wall clock changes, the instants do not. Changing the zone of
 * a competition relabels it; it must not move the start.
 */
export function shiftZone(values: CtfFormValues, zone: string): CtfFormValues {
    if (!isValidTimeZone(zone) || zone === values.timezone) return values;
    const move = (date: string, time: string) => {
        const at = date && time ? localToInstant(date, time, values.timezone) : null;
        return at ? toLocalParts(at, zone) : { date, time };
    };
    const start = move(values.startDate, values.startTime);
    const end = move(values.endDate, values.endTime);
    const frozen = move(values.frozenDate, values.frozenTime);
    return {
        ...values,
        timezone: zone,
        startDate: start.date, startTime: start.time,
        endDate: end.date, endTime: end.time,
        frozenDate: frozen.date, frozenTime: frozen.time,
    };
}

// ---------------------------------------------------------------------------
// Form -> payload
// ---------------------------------------------------------------------------

const intOrNaN = (text: string) => (text.trim() === '' ? NaN : Number(text));

/** The instant a date and a time name in the zone, as an ISO string; null when either is missing or the time does not exist */
export function instantOf(date: string, time: string, zone: string): string | null {
    if (!date || !time) return null;
    const at = localToInstant(date, time, zone);
    return at ? at.toISOString() : null;
}

/** Slug as the API would make it from a title, for the hint under the slug box */
export function slugFromTitle(title: string): string {
    return title.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, FORM_LIMITS.slugMax).replace(/-+$/g, '');
}

/** The status the API takes for each choice */
const apiStatus = (status: FormStatus): NonNullable<CtfPayload['status']> => (status === 'published' ? 'upcoming' : status);

const toPrizes = (rows: PrizeRow[]) => rows
    .map((r) => ({ place: Number(r.place), reward: r.reward.trim() }))
    .sort((a, b) => a.place - b.place);

/**
 * Every field the API takes, as the form says it. Empty optional text is `null` so an edit can clear
 * it. Team sizes are left out while teams are off (they mean nothing then).
 */
export function buildPayload(v: CtfFormValues): CtfPayload {
    const out: CtfPayload = {
        title: v.title.trim(),
        slug: v.slug.trim().toLowerCase(),
        description: v.description.trim(),
        shortDescription: v.shortDescription.trim() || null,
        image: v.image.trim() || null,
        rules: v.rules.trim() || null,
        timezone: v.timezone,
        status: apiStatus(v.status),
        isPublic: v.isPublic,
        isFeatured: v.isFeatured,
        registrationOpen: v.registrationOpen,
        teamsEnabled: v.teamsEnabled,
        maxParticipants: v.maxParticipants.trim() === '' ? 0 : Number(v.maxParticipants),
        scoringMode: v.scoringMode,
        awardsPoints: v.awardsPoints,
        prizes: toPrizes(v.prizes),
        prizesNote: v.prizesNote.trim() || null,
        frozenAt: instantOf(v.frozenDate, v.frozenTime, v.timezone),
    };
    const start = instantOf(v.startDate, v.startTime, v.timezone);
    const end = instantOf(v.endDate, v.endTime, v.timezone);
    if (start) out.startDate = start;
    if (end) out.endDate = end;
    if (v.teamsEnabled) {
        out.minTeamSize = Number(v.minTeamSize);
        out.maxTeamSize = Number(v.maxTeamSize);
    }
    return out;
}

/**
 * What `POST /` takes. Blank optional fields are left out; a blank slug is made from the title by
 * the API; a new competition is a draft or published at once, never ended or cancelled.
 */
export function buildCreatePayload(v: CtfFormValues): CtfPayload {
    const full = buildPayload(v);
    const out: CtfPayload = {};
    for (const key of Object.keys(full) as (keyof CtfPayload)[]) {
        const value = full[key];
        if (value === null || value === undefined || value === '') continue;
        if (key === 'prizes' && (value as unknown[]).length === 0) continue;
        (out as Record<string, unknown>)[key] = value;
    }
    if (v.challenges.length > 0) out.challenges = [...v.challenges];
    return out;
}

/** Instants compare by the minute: the form never shows seconds, so a stored 12:00:30 is "unchanged" at 12:00 */
const minute = (iso: unknown) => (typeof iso === 'string' ? String(Math.floor(new Date(iso).getTime() / 60000)) : iso);

const same = (key: string, a: unknown, b: unknown) =>
    (key === 'startDate' || key === 'endDate' || key === 'frozenAt') ? minute(a) === minute(b) : JSON.stringify(a) === JSON.stringify(b);

/**
 * What `PUT /:id` takes: only the fields that differ from the competition as it was loaded, so an
 * edit never overwrites what somebody else changed in the meantime. The challenge set is not part
 * of it: an existing set changes with its own actions.
 */
export function buildUpdatePayload(initial: CtfFormValues, current: CtfFormValues): CtfPayload {
    const before = buildPayload(initial) as Record<string, unknown>;
    const after = buildPayload(current) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(after)) {
        if (!same(key, before[key], after[key])) out[key] = after[key];
    }
    // The slug is never blank on an existing competition
    if (out.slug === '') delete out.slug;
    return out as CtfPayload;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const link = z.string().max(FORM_LIMITS.url, `The link has at most ${FORM_LIMITS.url} characters`).refine((v) => v === '' || isPublicHttpUrl(v), 'Use a public link that starts with http:// or https://');

const wholeNumber = (label: string, min: number, max: number) =>
    z.number({ error: `${label} must be a whole number` }).int(`${label} must be a whole number`).min(min, `${label} is at least ${min}`).max(max, `${label} is at most ${max}`);

const prizeSchema = z.object({
    place: wholeNumber('The place', 1, FORM_LIMITS.placeMax),
    reward: z.string().min(1, 'Describe the prize').max(FORM_LIMITS.prizeRewardMax, `A prize has at most ${FORM_LIMITS.prizeRewardMax} characters`),
});

const scalarSchema = z.object({
    title: z.string().min(FORM_LIMITS.titleMin, `Title must be at least ${FORM_LIMITS.titleMin} characters`).max(FORM_LIMITS.titleMax, `Title cannot exceed ${FORM_LIMITS.titleMax} characters`),
    slug: z.string()
        .refine((v) => v === '' || (v.length >= FORM_LIMITS.slugMin && v.length <= FORM_LIMITS.slugMax), `Slug must be ${FORM_LIMITS.slugMin} to ${FORM_LIMITS.slugMax} characters`)
        .refine((v) => v === '' || SLUG.test(v), 'Slug can only contain lowercase letters, numbers and single hyphens'),
    description: z.string().min(1, 'Description is required').max(FORM_LIMITS.descriptionMax, `Description cannot exceed ${FORM_LIMITS.descriptionMax} characters`),
    shortDescription: z.string().max(FORM_LIMITS.shortDescriptionMax, `The summary has at most ${FORM_LIMITS.shortDescriptionMax} characters`),
    rules: z.string().max(FORM_LIMITS.rulesMax, `Rules cannot exceed ${FORM_LIMITS.rulesMax} characters`),
    prizesNote: z.string().max(FORM_LIMITS.prizesNoteMax, `The note has at most ${FORM_LIMITS.prizesNoteMax} characters`),
    image: link,
    timezone: z.string().max(FORM_LIMITS.timezoneMax).refine(isValidTimeZone, 'Pick a valid time zone'),
    maxParticipants: wholeNumber('The limit', 0, FORM_LIMITS.participantsMax),
    scoringMode: z.enum(CTF_SCORING_MODES, { error: 'Choose a scoring mode' }),
});

export interface ValidateOptions {
    /** Edit mode: the competition as loaded, so what was not touched is not the admin's to fix */
    initial?: CtfFormValues;
}

/**
 * The same rules as the API, keyed like its `details[].field` (`title`, `startDate`, `prizes.0.reward`),
 * so the message sits where the field is whether the browser or the server found it.
 */
export function validateCompetition(values: CtfFormValues, options: ValidateOptions = {}): Record<string, string> {
    const errors: Record<string, string> = {};
    const note = (key: string, message: string) => { if (!errors[key]) errors[key] = message; };

    const parsed = scalarSchema.safeParse({
        title: values.title.trim(),
        slug: values.slug.trim().toLowerCase(),
        description: values.description.trim(),
        shortDescription: values.shortDescription.trim(),
        rules: values.rules.trim(),
        prizesNote: values.prizesNote.trim(),
        image: values.image.trim(),
        timezone: values.timezone,
        maxParticipants: values.maxParticipants.trim() === '' ? 0 : Number(values.maxParticipants),
        scoringMode: values.scoringMode,
    });
    if (!parsed.success) {
        for (const issue of parsed.error.issues) note(issue.path.map(String).join('.'), issue.message);
    }

    // Dates: both are needed, each must exist in the zone, the end follows the start
    const zoneOk = isValidTimeZone(values.timezone);
    const check = (kind: 'start' | 'end') => {
        const date = kind === 'start' ? values.startDate : values.endDate;
        const time = kind === 'start' ? values.startTime : values.endTime;
        const key = kind === 'start' ? 'startDate' : 'endDate';
        if (!date || !time) { note(key, `Choose the ${kind} date and time`); return null; }
        if (!zoneOk) return null;
        const at = localToInstant(date, time, values.timezone);
        if (!at) { note(key, `That ${kind} does not exist in ${values.timezone} (the date is invalid or the clock skips that time). Pick another`); return null; }
        return at;
    };
    const start = check('start');
    const end = check('end');
    if (start && end && end.getTime() <= start.getTime()) note('endDate', 'End date must be after start date');

    if (values.frozenDate || values.frozenTime) {
        if (!values.frozenDate || !values.frozenTime) note('frozenAt', 'Choose both the date and the time of the freeze, or clear them');
        else if (zoneOk) {
            const at = localToInstant(values.frozenDate, values.frozenTime, values.timezone);
            if (!at) note('frozenAt', `That time does not exist in ${values.timezone}`);
            else if (start && end && (at.getTime() < start.getTime() || at.getTime() >= end.getTime())) note('frozenAt', 'The freeze time must be between the start and the end');
        }
    }

    if (values.teamsEnabled) {
        const min = intOrNaN(values.minTeamSize);
        const max = intOrNaN(values.maxTeamSize);
        const minResult = wholeNumber('The smallest team', FORM_LIMITS.minTeamSizeMin, FORM_LIMITS.teamSizeMax).safeParse(min);
        const maxResult = wholeNumber('The largest team', FORM_LIMITS.teamSizeMin, FORM_LIMITS.teamSizeMax).safeParse(max);
        if (!minResult.success) note('minTeamSize', minResult.error.issues[0].message);
        if (!maxResult.success) note('maxTeamSize', maxResult.error.issues[0].message);
        if (minResult.success && maxResult.success && min > max) note('minTeamSize', 'The smallest team cannot be larger than the largest');
    }

    if (values.prizes.length > FORM_LIMITS.prizesMax) note('prizes', `At most ${FORM_LIMITS.prizesMax} prizes`);
    values.prizes.forEach((row, i) => {
        const result = prizeSchema.safeParse({ place: intOrNaN(row.place), reward: row.reward.trim() });
        if (!result.success) for (const issue of result.error.issues) note(`prizes.${i}.${String(issue.path[0])}`, issue.message);
    });

    if (values.challenges.length > FORM_LIMITS.challengesMax) note('challenges', `A competition holds at most ${FORM_LIMITS.challengesMax} challenges`);

    // Edit mode: a field that was already stored and is unchanged is not the admin's to fix
    if (options.initial) {
        const before = options.initial;
        const unchanged: Record<string, boolean> = {
            image: before.image === values.image,
            rules: before.rules === values.rules,
            description: before.description === values.description,
        };
        for (const [key, skip] of Object.entries(unchanged)) if (skip) delete errors[key];
    }
    return errors;
}

// ---------------------------------------------------------------------------
// Where a server error is shown
// ---------------------------------------------------------------------------

/** The form key a server field path belongs to: `prizes.1.reward` stays, `challenges.3` is the set */
export function formFieldPath(path: string): string {
    const parts = path.split('.');
    if (parts[0] === 'challenges') return 'challenges';
    if (parts[0] === 'prizes') return parts.length > 2 ? `prizes.${parts[1]}.${parts[2]}` : parts.length > 1 ? `prizes.${parts[1]}.reward` : 'prizes';
    return parts.join('.');
}

/** `fieldErrors` of a 400 with each path mapped to the form field that shows it */
export function formErrors(err: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, message] of Object.entries(fieldErrors(err))) {
        const key = formFieldPath(path);
        if (!out[key]) out[key] = message;
    }
    return out;
}

const SCALARS = new Set([
    'title', 'slug', 'description', 'shortDescription', 'rules', 'image', 'timezone', 'startDate', 'endDate', 'frozenAt', 'status',
    'minTeamSize', 'maxTeamSize', 'maxParticipants', 'scoringMode', 'prizes', 'prizesNote', 'challenges',
    'teamsEnabled', 'isPublic', 'isFeatured', 'registrationOpen', 'awardsPoints',
]);

/** Whether the form has a place to show an error key; anything else goes in the banner */
export function hasVisibleField(key: string): boolean {
    const [top, row, field] = key.split('.');
    if (!SCALARS.has(top)) return false;
    if (row === undefined) return true;
    return top === 'prizes' && (field === 'place' || field === 'reward');
}

const NAMES: Record<string, string> = { startDate: 'Start', endDate: 'End', frozenAt: 'Freeze time', maxParticipants: 'Player limit' };

/** The errors with no field to carry them, as readable lines for the banner */
export function unattachedErrors(errors: Record<string, string>): string[] {
    return Object.entries(errors)
        .filter(([key, message]) => message && !hasVisibleField(key))
        .map(([key, message]) => {
            const top = key.split('.')[0];
            const name = top === 'form' || !top ? '' : NAMES[top] ?? top.charAt(0).toUpperCase() + top.slice(1);
            return name ? `${name}: ${message}` : message;
        });
}

/** Forget the errors of the prize list after it changed. Typing in a row clears that row's; adding, removing or moving shifts every index. */
export function clearPrizeErrors(errors: Record<string, string>, rows: number[] | null): Record<string, string> {
    let touched = false;
    const next: Record<string, string> = {};
    for (const [key, message] of Object.entries(errors)) {
        const [top, row] = key.split('.');
        const drop = top === 'prizes' && (row === undefined || rows === null || rows.includes(Number(row)));
        if (drop) touched = true; else next[key] = message;
    }
    return touched ? next : errors;
}

/**
 * CTF_LOCKED named these fields: teams or solves exist, so they cannot change. Puts them back to what
 * the competition has, so the next save does not send them again.
 */
export function revertLocked(initial: CtfFormValues, current: CtfFormValues, fields: readonly string[]): CtfFormValues {
    const next: CtfFormValues = { ...current };
    for (const field of fields) {
        if (field === 'teamsEnabled') next.teamsEnabled = initial.teamsEnabled;
        else if (field === 'scoringMode') next.scoringMode = initial.scoringMode;
        else if (field === 'maxTeamSize') next.maxTeamSize = initial.maxTeamSize;
    }
    return next;
}

/** A soft note, not an error: what the dates and the status mean together right now */
export function scheduleNote(values: Pick<CtfFormValues, 'status' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timezone'>, now: Date = new Date()): string | null {
    if (values.status !== 'published') return null;
    const end = instantOf(values.endDate, values.endTime, values.timezone);
    const start = instantOf(values.startDate, values.startTime, values.timezone);
    if (end && new Date(end).getTime() <= now.getTime()) return 'The end is in the past: this competition is over as soon as it is saved.';
    if (start && new Date(start).getTime() <= now.getTime()) return 'The start is in the past: players can send flags as soon as it is saved.';
    return null;
}

/** The zones the browser knows, UTC first, with the competition's own zone always among them */
export function timeZoneOptions(current: string): string[] {
    let zones: string[] = [];
    try {
        zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch { /* older browsers */ }
    if (!zones.length) zones = ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];
    const set = new Set(zones);
    set.add('UTC');
    if (current) set.add(current);
    return Array.from(set).sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)));
}
