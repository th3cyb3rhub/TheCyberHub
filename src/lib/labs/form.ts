import { z } from 'zod';
import { isPublicHttpUrl } from '@/lib/internships/application';
import { fieldErrors } from './errors';
import type {
    LabCategory, LabDetail, LabDifficulty, LabFileInput, LabFlagInput, LabHintInput, LabPayload, LabStatus,
} from '@/types/lab';
import { LAB_CATEGORIES, LAB_DIFFICULTIES, LAB_STATUSES } from '@/types/lab';

/** Every limit mirrors the API (`config/labs.js`, `validations/lab.validation.js`), so a form never sends what the server refuses */
export const FORM_LIMITS = {
    titleMin: 3,
    title: 200,
    slugMin: 3,
    slug: 80,
    description: 5000,
    instructions: 10000,
    points: 1000,
    estimatedMinutes: 1440,
    tags: 10,
    tagMin: 2,
    tagLength: 30,
    hints: 10,
    hintText: 1000,
    hintPenalty: 1000,
    hintPenaltyDefault: 10,
    files: 10,
    fileName: 120,
    fileSize: 5 * 1024 ** 3,
    flags: 10,
    flagLength: 200,
    url: 2048,
} as const;

/** Slugs that would shadow a fixed route of the API */
export const RESERVED_SLUGS = ['progress', 'stats', 'categories', 'leaderboard', 'manage'] as const;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const TAG = /^[a-z0-9][a-z0-9 .+#_-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;

let counter = 0;
/** A local React key for a row that has no id yet */
export const rowKey = () => `row-${++counter}`;

export interface HintRow { key: string; text: string; penalty: string }
export interface FileRow { key: string; name: string; url: string; sizeBytes: string; sha256: string }
/** Typed by the admin only: the API never returns a flag, so an edit starts with no rows */
export interface FlagRow { key: string; value: string; caseSensitive: boolean }

export interface LabFormValues {
    title: string;
    slug: string;
    description: string;
    category: LabCategory;
    difficulty: LabDifficulty;
    /** Text so an empty box is not "0". 0 means "use the points table". */
    points: string;
    /** Comma separated */
    tags: string;
    estimatedMinutes: string;
    instructions: string;
    hints: HintRow[];
    files: FileRow[];
    labUrl: string;
    status: LabStatus;
    flags: FlagRow[];
}

export const emptyLab = (): LabFormValues => ({
    title: '', slug: '', description: '', category: 'web-security', difficulty: 'easy', points: '0', tags: '', estimatedMinutes: '',
    instructions: '', hints: [], files: [], labUrl: '', status: 'draft', flags: [],
});

export const newHint = (): HintRow => ({ key: rowKey(), text: '', penalty: String(FORM_LIMITS.hintPenaltyDefault) });
export const newFile = (): FileRow => ({ key: rowKey(), name: '', url: '', sizeBytes: '', sha256: '' });
export const newFlag = (): FlagRow => ({ key: rowKey(), value: '', caseSensitive: false });

/** The points the table pays for each difficulty, shown next to the field */
export const TABLE_POINTS: Record<LabDifficulty, number> = { easy: 50, medium: 100, hard: 200 };

// ---------------------------------------------------------------------------
// Lab -> form
// ---------------------------------------------------------------------------

/**
 * The lab as the form edits it. `points` is the lab's own value (0 means the table), not the
 * value it pays. There are no flags: the API never sends them, so the flag rows start empty.
 */
export function fromLab(lab: LabDetail): LabFormValues {
    return {
        title: lab.title,
        slug: lab.slug,
        description: lab.description,
        category: lab.category,
        difficulty: lab.difficulty,
        points: String(lab.admin?.pointsOverride ?? 0),
        tags: lab.tags.join(', '),
        estimatedMinutes: lab.estimatedMinutes ? String(lab.estimatedMinutes) : '',
        instructions: lab.instructions,
        hints: [...lab.hints].sort((a, b) => a.index - b.index).map((h) => ({ key: rowKey(), text: h.text ?? '', penalty: String(h.penalty) })),
        files: lab.files.map((f) => ({ key: rowKey(), name: f.name, url: f.url, sizeBytes: f.sizeBytes === null ? '' : String(f.sizeBytes), sha256: f.sha256 ?? '' })),
        labUrl: lab.labUrl ?? '',
        status: lab.admin?.status ?? 'draft',
        flags: [],
    };
}

// ---------------------------------------------------------------------------
// Form -> payload
// ---------------------------------------------------------------------------

/** Tags as the API keeps them: trimmed, lower case, no empties, no repeats */
export function parseTags(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of text.split(/[,\n]/)) {
        const tag = raw.trim().toLowerCase();
        if (tag && !seen.has(tag)) { seen.add(tag); out.push(tag); }
    }
    return out;
}

const intOrNaN = (text: string) => (text.trim() === '' ? NaN : Number(text));

const toHints = (rows: HintRow[]): LabHintInput[] => rows.map((r) => ({ text: r.text.trim(), penalty: intOrNaN(r.penalty) }));

const toFiles = (rows: FileRow[]): LabFileInput[] => rows.map((r) => {
    const out: LabFileInput = { name: r.name.trim(), url: r.url.trim() };
    if (r.sizeBytes.trim() !== '') out.sizeBytes = Number(r.sizeBytes);
    if (r.sha256.trim() !== '') out.sha256 = r.sha256.trim().toLowerCase();
    return out;
});

/** The flags the admin typed: rows with text. Blank rows are not sent (and are refused by `validateLab`). */
export const toFlags = (rows: FlagRow[]): LabFlagInput[] => rows.map((r) => ({ value: r.value.trim(), caseSensitive: r.caseSensitive }));

/** Everything but the flags: those are write only and decided separately */
export function buildPayload(v: LabFormValues): Required<Omit<LabPayload, 'flags' | 'estimatedMinutes' | 'labUrl'>> & { estimatedMinutes: number | null; labUrl: string | null } {
    const minutes = v.estimatedMinutes.trim();
    return {
        title: v.title.trim(),
        slug: v.slug.trim().toLowerCase(),
        description: v.description.trim(),
        category: v.category,
        difficulty: v.difficulty,
        points: v.points.trim() === '' ? 0 : Number(v.points),
        tags: parseTags(v.tags),
        estimatedMinutes: minutes === '' ? null : Number(minutes),
        instructions: v.instructions,
        hints: toHints(v.hints),
        files: toFiles(v.files),
        labUrl: v.labUrl.trim() === '' ? null : v.labUrl.trim(),
        status: v.status,
    };
}

/**
 * What `POST /` takes. A blank slug is left out (the API makes one from the title). `flags` is sent
 * only when the admin typed some.
 */
export function buildCreatePayload(v: LabFormValues): LabPayload {
    const { slug, labUrl, estimatedMinutes, ...rest } = buildPayload(v);
    const payload: LabPayload = { ...rest };
    if (slug) payload.slug = slug;
    if (labUrl) payload.labUrl = labUrl;
    if (estimatedMinutes !== null) payload.estimatedMinutes = estimatedMinutes;
    if (v.flags.length > 0) payload.flags = toFlags(v.flags);
    return payload;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What `PUT /:ref` takes: only the fields that differ from the lab as it was loaded, so an edit
 * never overwrites what somebody else changed in the meantime. `flags` is write only and replaces
 * all of them, so it is sent only when the admin typed new ones: an untouched form never sends it.
 */
export function buildUpdatePayload(initial: LabFormValues, current: LabFormValues): LabPayload {
    const before = buildPayload(initial);
    const after = buildPayload(current);
    const out: LabPayload = {};
    const put = <K extends keyof LabPayload>(key: K, value: LabPayload[K]) => { out[key] = value; };
    for (const key of ['title', 'slug', 'description', 'category', 'difficulty', 'points', 'tags', 'estimatedMinutes', 'instructions', 'hints', 'files', 'labUrl', 'status'] as const) {
        if (!same(before[key], after[key])) put(key, after[key] as never);
    }
    if (current.flags.length > 0) put('flags', toFlags(current.flags));
    return out;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const link = z.string().max(FORM_LIMITS.url, 'This link is too long').refine((v) => isPublicHttpUrl(v), 'Use a public link that starts with http:// or https://');

const hintSchema = z.object({
    text: z.string().min(1, 'Write the hint').max(FORM_LIMITS.hintText, `A hint has at most ${FORM_LIMITS.hintText} characters`),
    penalty: z.number({ error: 'The cost must be a whole number' }).int('The cost must be a whole number').min(0, 'The cost cannot be negative').max(FORM_LIMITS.hintPenalty, `The cost is at most ${FORM_LIMITS.hintPenalty}`),
});

const fileSchema = z.object({
    name: z.string().min(1, 'Give the file a name').max(FORM_LIMITS.fileName, `The name has at most ${FORM_LIMITS.fileName} characters`),
    url: link,
    sizeBytes: z.number({ error: 'The size must be a whole number of bytes' }).int('The size must be a whole number of bytes').min(0, 'The size cannot be negative').max(FORM_LIMITS.fileSize, 'The size is too large').optional(),
    sha256: z.string().regex(SHA256, 'The SHA-256 is 64 hexadecimal characters').optional(),
});

const labSchema = z.object({
    title: z.string().min(FORM_LIMITS.titleMin, `Title must be at least ${FORM_LIMITS.titleMin} characters`).max(FORM_LIMITS.title, `Title cannot exceed ${FORM_LIMITS.title} characters`),
    slug: z.string().refine((v) => v === '' || (v.length >= FORM_LIMITS.slugMin && v.length <= FORM_LIMITS.slug), `Slug must be ${FORM_LIMITS.slugMin} to ${FORM_LIMITS.slug} characters`)
        .refine((v) => v === '' || SLUG.test(v), 'Slug can only contain lowercase letters, numbers and single hyphens')
        .refine((v) => !(RESERVED_SLUGS as readonly string[]).includes(v), 'This slug is reserved')
        .refine((v) => !OBJECT_ID.test(v), 'A slug cannot look like an id (24 hexadecimal characters)'),
    description: z.string().min(1, 'Description is required').max(FORM_LIMITS.description, `Description cannot exceed ${FORM_LIMITS.description} characters`),
    category: z.enum(LAB_CATEGORIES, { error: 'Choose a category' }),
    difficulty: z.enum(LAB_DIFFICULTIES, { error: 'Choose a difficulty' }),
    points: z.number({ error: 'Points must be a whole number (0 means use the table)' }).int('Points must be a whole number (0 means use the table)').min(0, 'Points cannot be negative').max(FORM_LIMITS.points, `Points cannot exceed ${FORM_LIMITS.points}`),
    estimatedMinutes: z.number({ error: 'Minutes must be a whole number' }).int('Minutes must be a whole number').min(1, 'At least 1 minute').max(FORM_LIMITS.estimatedMinutes, `At most ${FORM_LIMITS.estimatedMinutes} minutes`).nullable(),
    instructions: z.string().max(FORM_LIMITS.instructions, `Instructions cannot exceed ${FORM_LIMITS.instructions} characters`),
    labUrl: link.nullable(),
    hints: z.array(hintSchema).max(FORM_LIMITS.hints, `At most ${FORM_LIMITS.hints} hints`),
    files: z.array(fileSchema).max(FORM_LIMITS.files, `At most ${FORM_LIMITS.files} files`),
    status: z.enum(LAB_STATUSES),
});

export interface ValidateOptions {
    /** Edit mode: the lab as loaded, so what was not touched is not the admin's to fix */
    initial?: LabFormValues;
    /** Edit mode: how many flags the lab has (the API says how many, never what they are) */
    flagCount?: number;
}

/**
 * The same rules as the API, keyed like its `details[].field` (`title`, `hints.0.text`,
 * `files.1.url`; `tags` and `flags.N` for a list typed as text). The key is where the message sits
 * in the form, whether the browser or the server found it.
 */
export function validateLab(values: LabFormValues, options: ValidateOptions = {}): Record<string, string> {
    const payload = buildPayload(values);
    const errors: Record<string, string> = {};
    const note = (key: string, message: string) => { if (!errors[key]) errors[key] = message; };

    // Edit mode: a link or a row that was already stored and is unchanged is not the admin's to fix
    const before = options.initial ? buildPayload(options.initial) : null;
    const unchangedRow = (list: 'hints' | 'files', index: number) => !!before && (before[list] as unknown[]).some((row) => same(row, (payload[list] as unknown[])[index]));
    const unchangedLink = !!before && before.labUrl === payload.labUrl;

    const parsed = labSchema.safeParse(payload);
    if (!parsed.success) {
        for (const issue of parsed.error.issues) {
            const [top, row] = issue.path;
            if ((top === 'hints' || top === 'files') && typeof row === 'number' && unchangedRow(top, row)) continue;
            if (top === 'labUrl' && unchangedLink) continue;
            note(issue.path.map(String).join('.'), issue.message);
        }
    }

    // Tags: each one is checked on its own, and the message sits on the one box
    const tags = payload.tags;
    if (tags.length > FORM_LIMITS.tags) note('tags', `At most ${FORM_LIMITS.tags} tags`);
    for (const tag of tags) {
        if (tag.length < FORM_LIMITS.tagMin || tag.length > FORM_LIMITS.tagLength) { note('tags', `Each tag is ${FORM_LIMITS.tagMin} to ${FORM_LIMITS.tagLength} characters ("${tag.slice(0, 20)}")`); break; }
        if (!TAG.test(tag)) { note('tags', 'Tags can contain letters, numbers, spaces and . + # _ -'); break; }
    }

    // Flags: write only. Typed rows are checked; none typed is fine unless the lab is to be published without one
    if (values.flags.length > FORM_LIMITS.flags) note('flags', `At most ${FORM_LIMITS.flags} flags`);
    values.flags.forEach((f, i) => {
        const text = f.value.trim();
        if (!text) note(`flags.${i}`, 'Enter the flag or remove this row');
        else if (text.length > FORM_LIMITS.flagLength) note(`flags.${i}`, `A flag has at most ${FORM_LIMITS.flagLength} characters`);
    });
    if (values.status === 'published') {
        const hasFlag = values.flags.some((f) => f.value.trim() !== '') || (options.flagCount ?? 0) > 0;
        if (!hasFlag) note('status', 'Add at least one flag before you publish this lab.');
    }

    // The same size and checksum belong to one file: a size without a link is caught by the file's own rows
    return errors;
}

// ---------------------------------------------------------------------------
// Where a server error is shown
// ---------------------------------------------------------------------------

/** The form key a server field path belongs to: `tags.2` is the one tags box, `flags.0.value` is flag 0 */
export function formFieldPath(path: string): string {
    const parts = path.split('.');
    if (parts[0] === 'tags') return 'tags';
    if (parts[0] === 'flags') return parts.length > 1 ? `flags.${parts[1]}` : 'flags';
    if (parts[0] === 'hints' && parts.length > 2) return `hints.${parts[1]}.${parts[2]}`;
    if (parts[0] === 'files' && parts.length > 2) return `files.${parts[1]}.${parts[2]}`;
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

const SCALARS = new Set(['title', 'slug', 'description', 'category', 'difficulty', 'points', 'tags', 'estimatedMinutes', 'instructions', 'labUrl', 'status', 'hints', 'files', 'flags']);

/** Whether the form has a place to show an error key; anything else goes in the banner */
export function hasVisibleField(key: string): boolean {
    const [top, row, field] = key.split('.');
    if (!SCALARS.has(top)) return false;
    if (row === undefined) return true;
    if (top === 'flags') return field === undefined;
    if (top === 'hints') return field === 'text' || field === 'penalty';
    if (top === 'files') return field === 'name' || field === 'url' || field === 'sizeBytes' || field === 'sha256';
    return false;
}

const NAMES: Record<string, string> = { labUrl: 'Target link', estimatedMinutes: 'Estimated time' };

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

/**
 * Forget the errors of an editable list after it changed. Typing in a row clears that row's;
 * adding, removing or moving a row shifts every index (`null`), so all of the list's errors go.
 */
export function clearListErrors(errors: Record<string, string>, list: 'hints' | 'files' | 'flags', rows: number[] | null): Record<string, string> {
    let touched = false;
    const next: Record<string, string> = {};
    for (const [key, message] of Object.entries(errors)) {
        const [top, row] = key.split('.');
        const drop = top === list && (row === undefined || rows === null || rows.includes(Number(row)));
        if (drop) touched = true; else next[key] = message;
    }
    return touched ? next : errors;
}

/** Whether a lab is to be published but nothing yet says it has a flag */
export function publishNeedsFlag(values: Pick<LabFormValues, 'status' | 'flags'>, flagCount: number): boolean {
    return values.status === 'published' && flagCount === 0 && !values.flags.some((f) => f.value.trim() !== '');
}
