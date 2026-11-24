import { z } from 'zod';
import { isPublicHttpUrl } from './application';
import { formFieldPath } from './errors';
import type {
    AnswerType, CohortDetail, CohortPayload, CohortPayloadField, CohortStatus, CohortType, ShowcaseProject, SyllabusWeek,
} from '@/types/internship';

/** Every limit mirrors the API (`config/internships.js`), so a form never sends what the server refuses */
export const FORM_LIMITS = {
    titleMin: 3,
    title: 100,
    description: 2000,
    capacity: 10000,
    listItems: 20,
    listItemLength: 300,
    technologies: 30,
    technologyLength: 50,
    syllabusWeeks: 52,
    syllabusTitle: 150,
    syllabusDescription: 1000,
    syllabusTopics: 20,
    syllabusTopicLength: 100,
    syllabusDeliverables: 20,
    syllabusDeliverableLength: 200,
    customFields: 20,
    customFieldLabel: 200,
    customFieldOptions: 20,
    customFieldOptionLength: 100,
    showcaseProjects: 30,
    showcaseTitle: 150,
    showcaseDescription: 1000,
    showcaseMembers: 20,
    showcaseMemberLength: 100,
    url: 2048,
} as const;

let counter = 0;
/** A local React key for a row that has no id yet */
export const rowKey = () => `row-${++counter}`;

export interface CustomFieldRow {
    key: string;
    /** Present for a question that already exists: sending it keeps earlier answers attached */
    _id?: string;
    label: string;
    type: AnswerType;
    options: string[];
    required: boolean;
}

export interface SyllabusRow { key: string; week: string; title: string; description: string; topics: string; deliverables: string }

export interface ShowcaseRow {
    key: string;
    title: string;
    description: string;
    teamMembers: string;
    demoLink: string;
    repoLink: string;
    /** Not edited here, but kept so saving does not drop it */
    image: string;
}

/** What the form holds: text for inputs, one item per line for the plain lists */
export interface CohortFormValues {
    title: string;
    description: string;
    type: CohortType;
    status: CohortStatus;
    /** Text so an empty box is not "0" */
    capacity: string;
    /** `YYYY-MM-DDTHH:mm`, in the browser's zone */
    startDate: string;
    endDate: string;
    applicationDeadline: string;
    isActive: boolean;
    requirements: string;
    responsibilities: string;
    benefits: string;
    technologies: string;
    syllabus: SyllabusRow[];
    customFields: CustomFieldRow[];
    showcaseProjects: ShowcaseRow[];
}

export const emptyCohort = (): CohortFormValues => ({
    title: '', description: '', type: 'internship', status: 'draft', capacity: '0',
    startDate: '', endDate: '', applicationDeadline: '', isActive: true,
    requirements: '', responsibilities: '', benefits: '', technologies: '',
    syllabus: [], customFields: [], showcaseProjects: [],
});

// ---------------------------------------------------------------------------
// Dates: the inputs are local, the API wants instants
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO instant as `YYYY-MM-DDTHH:mm` in the browser's zone, for a datetime-local input */
export function toLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value (the browser's zone) as an ISO instant, or '' when it is not a date */
export function fromLocalInput(value: string): string {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** One item per line: blank lines and spaces around are dropped */
export const parseLines = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const joinLines = (items: string[] | undefined) => (items ?? []).join('\n');

// ---------------------------------------------------------------------------
// Cohort -> form
// ---------------------------------------------------------------------------

export function fromCohort(c: CohortDetail): CohortFormValues {
    return {
        title: c.title,
        description: c.description,
        type: c.type,
        // The value in the database, not the computed one: an open cohort past its deadline reads closed
        status: c.storedStatus ?? c.status,
        capacity: String(c.capacity ?? 0),
        startDate: toLocalInput(c.startDate),
        endDate: toLocalInput(c.endDate),
        applicationDeadline: toLocalInput(c.applicationDeadline),
        isActive: c.isActive ?? true,
        requirements: joinLines(c.requirements),
        responsibilities: joinLines(c.responsibilities),
        benefits: joinLines(c.benefits),
        technologies: joinLines(c.technologies),
        syllabus: [...(c.syllabus ?? [])].sort((a, b) => a.week - b.week).map((w) => ({
            key: rowKey(), week: String(w.week), title: w.title, description: w.description ?? '', topics: joinLines(w.topics), deliverables: joinLines(w.deliverables),
        })),
        customFields: (c.customFields ?? []).map((f) => ({ key: rowKey(), _id: f._id, label: f.label, type: f.type, options: [...f.options], required: f.required })),
        showcaseProjects: (c.showcaseProjects ?? []).map((p) => ({
            key: rowKey(), title: p.title, description: p.description ?? '', teamMembers: joinLines(p.teamMembers),
            demoLink: p.demoLink ?? '', repoLink: p.repoLink ?? '', image: p.image ?? '',
        })),
    };
}

// ---------------------------------------------------------------------------
// Form -> payload
// ---------------------------------------------------------------------------

const toSyllabus = (rows: SyllabusRow[]): SyllabusWeek[] => rows.map((r) => ({
    week: Number(r.week),
    title: r.title.trim(),
    description: r.description.trim(),
    topics: parseLines(r.topics),
    deliverables: parseLines(r.deliverables),
}));

/** `_id` only for a question that exists; options only for a dropdown (the API refuses them elsewhere) */
export const toCustomFields = (rows: CustomFieldRow[]): CohortPayloadField[] => rows.map((r) => ({
    ...(r._id ? { _id: r._id } : {}),
    label: r.label.trim(),
    type: r.type,
    ...(r.type === 'dropdown' ? { options: r.options.map((o) => o.trim()).filter(Boolean) } : {}),
    required: r.required,
}));

const toShowcase = (rows: ShowcaseRow[]): ShowcaseProject[] => rows.map((r) => {
    const out: ShowcaseProject = { title: r.title.trim(), description: r.description.trim(), teamMembers: parseLines(r.teamMembers) };
    if (r.demoLink.trim()) out.demoLink = r.demoLink.trim();
    if (r.repoLink.trim()) out.repoLink = r.repoLink.trim();
    if (r.image.trim()) out.image = r.image.trim();
    return out;
});

const capacityNumber = (text: string) => (text.trim() === '' ? NaN : Number(text));

/** The whole cohort as the API reads it */
export function buildPayload(v: CohortFormValues): Required<Omit<CohortPayload, 'isActive'>> & { isActive: boolean } {
    return {
        title: v.title.trim(),
        description: v.description.trim(),
        type: v.type,
        status: v.status,
        capacity: capacityNumber(v.capacity),
        startDate: fromLocalInput(v.startDate),
        endDate: fromLocalInput(v.endDate),
        applicationDeadline: fromLocalInput(v.applicationDeadline),
        requirements: parseLines(v.requirements),
        responsibilities: parseLines(v.responsibilities),
        benefits: parseLines(v.benefits),
        technologies: parseLines(v.technologies),
        syllabus: toSyllabus(v.syllabus),
        customFields: toCustomFields(v.customFields),
        showcaseProjects: toShowcase(v.showcaseProjects),
        isActive: v.isActive,
    };
}

/** What `POST /` takes: a new cohort is a draft or open, and is always active */
export function buildCreatePayload(v: CohortFormValues): CohortPayload {
    const payload: CohortPayload = buildPayload(v);
    delete payload.isActive;
    return payload;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What `PUT /:id` takes: only the fields that differ from the cohort as it was loaded, so an edit
 * never overwrites what somebody else changed in the meantime. Dates are compared as typed (the
 * seconds the API stores are not in the input), and lists are sent whole (with `_id` on questions
 * that exist) because the API replaces them.
 */
export function buildUpdatePayload(initial: CohortFormValues, current: CohortFormValues): CohortPayload {
    const before = buildPayload(initial);
    const after = buildPayload(current);
    const out: CohortPayload = {};
    const put = <K extends keyof CohortPayload>(key: K, value: CohortPayload[K]) => { out[key] = value; };

    if (before.title !== after.title) put('title', after.title);
    if (before.description !== after.description) put('description', after.description);
    if (before.type !== after.type) put('type', after.type);
    if (before.status !== after.status) put('status', after.status);
    if (before.capacity !== after.capacity) put('capacity', after.capacity);
    if (initial.startDate !== current.startDate) put('startDate', after.startDate);
    if (initial.endDate !== current.endDate) put('endDate', after.endDate);
    if (initial.applicationDeadline !== current.applicationDeadline) put('applicationDeadline', after.applicationDeadline);
    if (before.isActive !== after.isActive) put('isActive', after.isActive);
    for (const key of ['requirements', 'responsibilities', 'benefits', 'technologies', 'syllabus', 'customFields', 'showcaseProjects'] as const) {
        if (!same(before[key], after[key])) put(key, after[key] as never);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const link = z.string().max(FORM_LIMITS.url, 'This link is too long').refine((v) => isPublicHttpUrl(v), 'Use a public link that starts with http:// or https://');
const lines = (label: string, maxItems: number, maxLength: number) => z.array(z.string().max(maxLength, `Each ${label} line can be up to ${maxLength} characters`)).max(maxItems, `At most ${maxItems} lines`);

const syllabusSchema = z.object({
    week: z.number({ error: 'Week must be a number' }).int('Week must be a whole number').min(1, 'Week starts at 1').max(FORM_LIMITS.syllabusWeeks, `Week goes up to ${FORM_LIMITS.syllabusWeeks}`),
    title: z.string().min(1, 'Give the week a title').max(FORM_LIMITS.syllabusTitle, `Up to ${FORM_LIMITS.syllabusTitle} characters`),
    description: z.string().max(FORM_LIMITS.syllabusDescription, `Up to ${FORM_LIMITS.syllabusDescription} characters`),
    topics: lines('topic', FORM_LIMITS.syllabusTopics, FORM_LIMITS.syllabusTopicLength),
    deliverables: lines('deliverable', FORM_LIMITS.syllabusDeliverables, FORM_LIMITS.syllabusDeliverableLength),
});

const customFieldSchema = z.object({
    label: z.string().min(1, 'Write the question').max(FORM_LIMITS.customFieldLabel, `Up to ${FORM_LIMITS.customFieldLabel} characters`),
    type: z.enum(['text', 'textarea', 'dropdown', 'file']),
    options: z.array(z.string().max(FORM_LIMITS.customFieldOptionLength, `Each option can be up to ${FORM_LIMITS.customFieldOptionLength} characters`)).max(FORM_LIMITS.customFieldOptions, `At most ${FORM_LIMITS.customFieldOptions} options`).optional(),
});

const showcaseSchema = z.object({
    title: z.string().min(1, 'Give the project a title').max(FORM_LIMITS.showcaseTitle, `Up to ${FORM_LIMITS.showcaseTitle} characters`),
    description: z.string().max(FORM_LIMITS.showcaseDescription, `Up to ${FORM_LIMITS.showcaseDescription} characters`),
    teamMembers: lines('member', FORM_LIMITS.showcaseMembers, FORM_LIMITS.showcaseMemberLength),
    demoLink: link.optional(),
    repoLink: link.optional(),
    image: link.optional(),
});

const dateField = (label: string) => z.string().min(1, `${label} is required`);

const cohortSchema = z.object({
    title: z.string().min(FORM_LIMITS.titleMin, `Title must be at least ${FORM_LIMITS.titleMin} characters`).max(FORM_LIMITS.title, `Title cannot exceed ${FORM_LIMITS.title} characters`),
    description: z.string().min(1, 'Description is required').max(FORM_LIMITS.description, `Description cannot exceed ${FORM_LIMITS.description} characters`),
    capacity: z.number({ error: 'Capacity must be a whole number (0 means no limit)' }).int('Capacity must be a whole number (0 means no limit)').min(0, 'Capacity cannot be negative').max(FORM_LIMITS.capacity, `Capacity cannot exceed ${FORM_LIMITS.capacity}`),
    startDate: dateField('Start date'),
    endDate: dateField('End date'),
    applicationDeadline: dateField('Application deadline'),
    requirements: lines('requirement', FORM_LIMITS.listItems, FORM_LIMITS.listItemLength),
    responsibilities: lines('responsibility', FORM_LIMITS.listItems, FORM_LIMITS.listItemLength),
    benefits: lines('benefit', FORM_LIMITS.listItems, FORM_LIMITS.listItemLength),
    technologies: lines('technology', FORM_LIMITS.technologies, FORM_LIMITS.technologyLength),
    syllabus: z.array(syllabusSchema).max(FORM_LIMITS.syllabusWeeks, `At most ${FORM_LIMITS.syllabusWeeks} weeks`),
    customFields: z.array(customFieldSchema).max(FORM_LIMITS.customFields, `At most ${FORM_LIMITS.customFields} questions`),
    showcaseProjects: z.array(showcaseSchema).max(FORM_LIMITS.showcaseProjects, `At most ${FORM_LIMITS.showcaseProjects} projects`),
});

export interface ValidateOptions {
    /** The current time, for "an open cohort needs a future deadline" */
    now?: Date;
    /** Edit mode: the cohort as loaded, so the open rule only applies when the status changes */
    initial?: CohortFormValues;
    /** Edit mode: seats already given out, the least the capacity can be */
    acceptedCount?: number;
}

/**
 * The same rules as the API, keyed like its `details[].field` (`title`, `customFields.0.label`),
 * so a message appears on the same field whether the browser or the server found it. Dates:
 * `applicationDeadline <= startDate < endDate`; an open cohort needs a future deadline.
 */
export function validateCohort(values: CohortFormValues, options: ValidateOptions = {}): Record<string, string> {
    const now = options.now ?? new Date();
    const payload = buildPayload(values);
    const errors: Record<string, string> = {};
    const note = (key: string, message: string) => { if (!errors[key]) errors[key] = message; };

    const parsed = cohortSchema.safeParse(payload);
    if (!parsed.success) {
        for (const issue of parsed.error.issues) note(formFieldPath(issue.path.map(String).join('.')), issue.message);
    }

    // Dates that are typed but not real
    for (const key of ['startDate', 'endDate', 'applicationDeadline'] as const) {
        if (values[key] && !payload[key]) note(key, 'This is not a valid date');
    }
    const t = (iso: string) => (iso ? new Date(iso).getTime() : NaN);
    const deadline = t(payload.applicationDeadline);
    const start = t(payload.startDate);
    const end = t(payload.endDate);
    if (!Number.isNaN(deadline) && !Number.isNaN(start) && deadline > start) note('applicationDeadline', 'The application deadline must be on or before the start date');
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) note('endDate', 'The end date must be after the start date');

    const statusChanged = !options.initial || options.initial.status !== values.status;
    if (values.status === 'open' && statusChanged && !Number.isNaN(deadline) && deadline <= now.getTime()) {
        note('applicationDeadline', 'To open applications, move the deadline to a future date');
    }

    if (options.acceptedCount && payload.capacity > 0 && payload.capacity < options.acceptedCount) {
        note('capacity', `${options.acceptedCount} applicants are already accepted, so the capacity cannot be lower than that`);
    }

    // Row level rules the schema cannot see
    const weeks = new Set<number>();
    payload.syllabus.forEach((w, i) => {
        if (weeks.has(w.week)) note(`syllabus.${i}.week`, 'Another week already has this number');
        weeks.add(w.week);
    });
    // The API refuses two questions with the same id: ids come from the server and are never typed, but check anyway
    const ids = new Set<string>();
    payload.customFields.forEach((f, i) => {
        if (f._id) {
            if (ids.has(f._id)) note(`customFields.${i}`, 'This question appears twice');
            ids.add(f._id);
        }
        if (f.type === 'dropdown') {
            const opts = f.options ?? [];
            if (opts.length === 0) note(`customFields.${i}.options`, 'A dropdown needs at least one option');
            else if (new Set(opts).size !== opts.length) note(`customFields.${i}.options`, 'Options must be different from each other');
        }
    });
    return errors;
}
