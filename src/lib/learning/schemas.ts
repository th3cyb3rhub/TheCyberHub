/**
 * The forms of the roadmap and resource screens as zod schemas. Every limit mirrors the API
 * validators (validations/resource.validation.js, validations/learningPath.validation.js), so a form
 * that passes here passes there.
 */
import { z } from 'zod';
import { DIFFICULTIES, ITEM_KINDS, PATH_CATEGORIES, PATH_KINDS } from '@/types/learning';
import { REJECT_REASONS, REPORT_REASONS, RESOURCE_TOPICS, RESOURCE_TYPES } from '@/types/resource';
import { LINK_MESSAGES, linkProblem } from './url';

export const LIMITS = {
    title: { min: 5, max: 200 },
    description: { min: 20, max: 2000 },
    url: 2048,
    tags: 8,
    tag: { min: 2, max: 30 },
    reportDetails: 500,
    rejectNote: 300,
    linkNote: 300,
    requestChangesNote: { min: 5, max: 1000 },
    path: {
        title: { min: 3, max: 200 },
        description: { min: 10, max: 2000 },
        shortDescription: 300,
        duration: 40,
        skills: 20,
        skill: 50,
        prerequisites: 10,
        metaDescription: 160,
        nodes: 100,
        nodeTitle: { min: 2, max: 200 },
        nodeDescription: 1000,
        stage: 80,
        nodeDuration: 40,
        requires: 10,
        items: 20,
        itemTitle: 200,
    },
} as const;

const plain = (value: string) => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** One link, checked the way the API checks it */
const link = z.string().trim().min(1, 'Enter the link').max(LIMITS.url, `The link cannot exceed ${LIMITS.url} characters`)
    .superRefine((value, ctx) => {
        const problem = linkProblem(value);
        if (problem) ctx.addIssue({ code: 'custom', message: LINK_MESSAGES[problem] });
    });

const TAG_PATTERN = /^[a-z0-9][a-z0-9 .+#_-]*$/;

/** Splits "a, b, c" into tags: trimmed, lower case, no empties, no repeats */
export function parseTags(text: string): string[] {
    const out: string[] = [];
    for (const part of text.split(',')) {
        const tag = part.trim().toLowerCase();
        if (tag && !out.includes(tag)) out.push(tag);
    }
    return out;
}

export const resourceSubmitSchema = z.object({
    title: z.string().trim()
        .refine((v) => plain(v).length >= LIMITS.title.min, `Title must be at least ${LIMITS.title.min} characters`)
        .refine((v) => plain(v).length <= LIMITS.title.max, `Title cannot exceed ${LIMITS.title.max} characters`),
    url: link,
    type: z.enum(RESOURCE_TYPES, { error: 'Choose what kind of resource it is' }),
    topic: z.enum(RESOURCE_TOPICS, { error: 'Choose a topic' }),
    difficulty: z.enum(DIFFICULTIES, { error: 'Choose a difficulty' }),
    isFree: z.boolean(),
    tags: z.array(z.string().trim().toLowerCase()
        .min(LIMITS.tag.min, `Tags need at least ${LIMITS.tag.min} characters`)
        .max(LIMITS.tag.max, `Tags cannot exceed ${LIMITS.tag.max} characters`)
        .regex(TAG_PATTERN, 'Tags can contain letters, numbers, spaces and . + # _ -'))
        .max(LIMITS.tags, `At most ${LIMITS.tags} tags`)
        .refine((tags) => new Set(tags).size === tags.length, 'Tags must be different'),
    description: z.string().trim()
        .min(LIMITS.description.min, `Description must be at least ${LIMITS.description.min} characters`)
        .max(LIMITS.description.max, `Description cannot exceed ${LIMITS.description.max} characters`),
});
export type ResourceSubmitValues = z.infer<typeof resourceSubmitSchema>;

export const reportSchema = z.object({
    reason: z.enum(REPORT_REASONS, { error: 'Choose a reason' }),
    details: z.string().trim().max(LIMITS.reportDetails, `Details cannot exceed ${LIMITS.reportDetails} characters`),
});
export type ReportValues = z.infer<typeof reportSchema>;

export const rejectSchema = z.object({
    reason: z.enum(REJECT_REASONS, { error: 'Choose a reason' }),
    note: z.string().trim().max(LIMITS.rejectNote, `The note cannot exceed ${LIMITS.rejectNote} characters`),
}).refine((v) => v.reason !== 'other' || v.note.length > 0, { path: ['note'], message: 'A note is required when the reason is "other"' });
export type RejectValues = z.infer<typeof rejectSchema>;

export const requestChangesSchema = z.object({
    note: z.string().trim()
        .min(LIMITS.requestChangesNote.min, `Write at least ${LIMITS.requestChangesNote.min} characters`)
        .max(LIMITS.requestChangesNote.max, `Keep the note under ${LIMITS.requestChangesNote.max} characters`),
});

// ---------------------------------------------------------------------------
// The roadmap editor
// ---------------------------------------------------------------------------

const KEY = /^[a-z0-9][a-z0-9-]{0,59}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export const editorItemSchema = z.object({
    kind: z.enum(ITEM_KINDS),
    ref: z.string().trim().min(1, 'Choose or enter what this links to'),
    title: z.string().trim().max(LIMITS.path.itemTitle, `Keep it under ${LIMITS.path.itemTitle} characters`),
    optional: z.boolean(),
}).superRefine((item, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', path: ['ref'], message });
    if (!item.ref) return;
    if (item.kind === 'resource' && !OBJECT_ID.test(item.ref)) fail('Pick a resource from the library');
    else if (item.kind === 'external') {
        const problem = linkProblem(item.ref);
        if (problem) fail(LINK_MESSAGES[problem]);
    } else if (['challenge', 'lab', 'path'].includes(item.kind) && !SLUG.test(item.ref)) fail('Use the slug: lower case letters, numbers and dashes');
});

export const editorNodeSchema = z.object({
    id: z.string().optional(),
    key: z.string().trim().regex(KEY, 'Use lower case letters, numbers and dashes'),
    title: z.string().trim()
        .min(LIMITS.path.nodeTitle.min, `Title must be at least ${LIMITS.path.nodeTitle.min} characters`)
        .max(LIMITS.path.nodeTitle.max, `Title cannot exceed ${LIMITS.path.nodeTitle.max} characters`),
    description: z.string().trim().max(LIMITS.path.nodeDescription, `Keep it under ${LIMITS.path.nodeDescription} characters`),
    stage: z.string().trim().max(LIMITS.path.stage, `Keep it under ${LIMITS.path.stage} characters`),
    duration: z.string().trim().max(LIMITS.path.nodeDuration, `Keep it under ${LIMITS.path.nodeDuration} characters`),
    optional: z.boolean(),
    requires: z.array(z.string()).max(LIMITS.path.requires, `At most ${LIMITS.path.requires} requirements`),
    items: z.array(editorItemSchema).max(LIMITS.path.items, `At most ${LIMITS.path.items} links per step`),
});

export const pathEditorSchema = z.object({
    title: z.string().trim()
        .refine((v) => plain(v).length >= LIMITS.path.title.min, `Title must be at least ${LIMITS.path.title.min} characters`)
        .refine((v) => plain(v).length <= LIMITS.path.title.max, `Title cannot exceed ${LIMITS.path.title.max} characters`),
    kind: z.enum(PATH_KINDS),
    category: z.enum(PATH_CATEGORIES),
    difficulty: z.enum(DIFFICULTIES),
    estimatedDuration: z.string().trim().max(LIMITS.path.duration, `Keep it under ${LIMITS.path.duration} characters`),
    icon: z.string().trim().max(40),
    shortDescription: z.string().trim().max(LIMITS.path.shortDescription, `Keep it under ${LIMITS.path.shortDescription} characters`),
    description: z.string().trim()
        .min(LIMITS.path.description.min, `Description must be at least ${LIMITS.path.description.min} characters`)
        .max(LIMITS.path.description.max, `Description cannot exceed ${LIMITS.path.description.max} characters`),
    skills: z.array(z.string().trim().min(1).max(LIMITS.path.skill)).max(LIMITS.path.skills, `At most ${LIMITS.path.skills} skills`),
    prerequisites: z.array(z.string()).max(LIMITS.path.prerequisites, `At most ${LIMITS.path.prerequisites} prerequisites`),
    metaDescription: z.string().trim().max(LIMITS.path.metaDescription, `Keep it under ${LIMITS.path.metaDescription} characters`),
    isFeatured: z.boolean(),
    modules: z.array(editorNodeSchema).max(LIMITS.path.nodes, `At most ${LIMITS.path.nodes} steps`)
        .superRefine((nodes, ctx) => {
            const seen = new Set<string>();
            nodes.forEach((node, index) => {
                if (seen.has(node.key)) ctx.addIssue({ code: 'custom', path: [index, 'key'], message: 'Another step already uses this key' });
                seen.add(node.key);
            });
            const keys = new Set(nodes.map((n) => n.key));
            nodes.forEach((node, index) => {
                if (node.requires.some((k) => k === node.key || !keys.has(k))) {
                    ctx.addIssue({ code: 'custom', path: [index, 'requires'], message: 'A step can only require other steps of this roadmap' });
                }
            });
        }),
});
export type PathEditorValues = z.infer<typeof pathEditorSchema>;

/** `modules.2.items.0.ref` style paths from a zod issue, joined the way the API names fields */
export function issuePath(path: PropertyKey[]): string {
    return path.map(String).join('.');
}

/** Flatten zod issues into `{ 'modules.0.title': 'message' }`, first message per field */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
    const out: Record<string, string> = {};
    for (const issue of error.issues) {
        const key = issuePath(issue.path);
        if (!out[key]) out[key] = issue.message;
    }
    return out;
}
