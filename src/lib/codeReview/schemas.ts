import { z } from 'zod';
import { CR_DIFFICULTIES, CR_SEVERITIES, CR_VIEWER_STATUSES } from '@/types/codeReview';

/**
 * Runtime checks for what the code review API sends back. They are lenient on purpose: a key that
 * is not listed here is dropped (the API may add fields), a missing optional number or text takes a
 * default, and an enum value this client does not know falls back to a neutral one. They are strict
 * about the few things a screen cannot be drawn without (the id, the slug, the title, the code).
 */

const n = z.number().default(0);
const s = z.string().default('');
const nullableText = z.string().nullish().transform((v) => v ?? null);

const status = z.enum(CR_VIEWER_STATUSES).catch('not-started');
const difficulty = z.enum(CR_DIFFICULTIES).catch('medium');
const severity = z.enum(CR_SEVERITIES).catch('medium');

export const progressSchema = z.object({
    status,
    attempts: n,
    bestScore: n,
    maxScore: n,
    bestPercent: n,
    passed: z.boolean().default(false),
    pointsEarned: n,
});

export const viewerSchema = progressSchema.extend({
    passedAt: nullableText,
    hintsUnlocked: z.array(z.number()).default([]),
    hintCost: n,
    pointsAvailable: n,
    solutionUnlocked: z.boolean().default(false),
    solutionViewed: z.boolean().default(false),
    attemptsToday: n,
    attemptsLeftToday: n,
});

export const cardSchema = z.object({
    _id: z.string(),
    slug: z.string().min(1),
    title: z.string().min(1),
    summary: s,
    language: z.string().default('other'),
    category: z.string().default('other'),
    difficulty,
    difficultyRank: n,
    points: n,
    tags: z.array(z.string()).default([]),
    findingCount: n,
    hintCount: n,
    lineCount: n,
    solveCount: n,
    createdAt: s,
    progress: progressSchema.nullish().transform((v) => v ?? undefined),
});

export const manageCardSchema = cardSchema.extend({
    isPublished: z.boolean().default(false),
    attemptCount: n,
    updatedAt: s,
});

export const paginationSchema = z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
    total: z.number().default(0),
    pages: z.number().default(1),
    hasMore: z.boolean().default(false),
});

const pageOf = <T extends z.ZodType>(item: T) => z.object({
    count: z.number().optional(),
    data: z.array(item),
    pagination: paginationSchema,
}).transform((p) => ({ count: p.count ?? p.data.length, data: p.data, pagination: p.pagination }));

export const cardPageSchema = pageOf(cardSchema);
export const manageCardPageSchema = pageOf(manageCardSchema);

export const hintViewSchema = z.object({
    order: z.number(),
    cost: n,
    unlocked: z.boolean().default(false),
    text: z.string().optional(),
});

export const detailSchema = cardSchema.extend({
    description: s,
    vulnerableCode: z.string(),
    hints: z.array(hintViewSchema).default([]),
    updatedAt: s,
    viewer: viewerSchema.nullish().transform((v) => v ?? null),
});

const exploitSchema = z.object({ description: z.string().optional(), payload: z.string().optional(), result: z.string().optional() });
const fixSchema = z.object({ description: z.string().optional(), code: z.string().optional() });

export const findingSchema = z.object({
    lineStart: z.number(),
    lineEnd: z.number(),
    title: nullableText,
    vulnerabilityType: z.string().default('other'),
    severity,
    cwe: nullableText,
    owasp: nullableText,
    explanation: s,
    exploit: exploitSchema.nullish().transform((v) => v ?? null),
    fix: fixSchema.nullish().transform((v) => v ?? null),
});

export const hintFullSchema = z.object({ order: z.number(), text: s, cost: n });

const exploitExampleSchema = z.object({
    title: z.string().optional(), description: z.string().optional(), payload: z.string().optional(), result: z.string().optional(),
}).nullish().transform((v) => v ?? null);

const keyFields = {
    explanation: s,
    fixedCode: s,
    exploitedCode: s,
    fixedExploitedCode: s,
    exploitExample: exploitExampleSchema,
};

export const adminSnippetSchema = manageCardSchema.extend({
    description: s,
    vulnerableCode: z.string(),
    effectivePoints: n,
    findings: z.array(findingSchema).default([]),
    hints: z.array(hintFullSchema).default([]),
    ...keyFields,
});

export const solutionSchema = z.object({
    _id: z.string(),
    slug: z.string(),
    title: s,
    findings: z.array(findingSchema).default([]),
    hints: z.array(hintFullSchema).default([]),
    viewer: viewerSchema.nullish().transform((v) => v ?? null),
    ...keyFields,
});

const verdict = z.enum(['matched', 'duplicate', 'unmatched']).catch('unmatched');

export const matchedSchema = z.object({
    markIndex: n,
    findingIndex: n,
    lineStart: z.number(),
    lineEnd: z.number(),
    title: nullableText,
    vulnerabilityType: z.string().default('other'),
    severity,
    cwe: nullableText,
    owasp: nullableText,
    explanation: s,
    typeCorrect: z.boolean().nullish().transform((v) => v ?? null),
    points: n,
});

export const attemptResultSchema = z.object({
    attemptId: s,
    score: n,
    maxScore: n,
    percent: n,
    passPercent: z.number().default(70),
    passed: z.boolean().default(false),
    matched: z.array(matchedSchema).default([]),
    marks: z.array(z.object({ index: z.number(), result: verdict })).default([]),
    missedCount: n,
    falsePositives: n,
    firstPass: z.boolean().default(false),
    pointsAwarded: n,
    pointsAvailable: n,
    hintsUsed: n,
    attempts: n,
    attemptsLeftToday: n,
    bestPercent: n,
    solutionUnlocked: z.boolean().default(true),
    newBadges: z.array(z.object({
        code: s, name: s, icon: nullableText, rarity: nullableText,
    })).default([]),
});

const markSchema = z.object({
    lineStart: z.number(),
    lineEnd: z.number(),
    vulnerabilityType: z.string().optional(),
});

export const attemptRowSchema = z.object({
    attemptId: s,
    score: n,
    maxScore: n,
    percent: n,
    passed: z.boolean().default(false),
    matchedCount: n,
    falsePositives: n,
    hintsUsed: n,
    marks: z.array(markSchema).default([]),
    createdAt: s,
});

export const attemptListSchema = z.object({ data: z.array(attemptRowSchema) });

export const hintResultSchema = z.object({
    hint: hintFullSchema,
    alreadyUnlocked: z.boolean().default(false),
    recorded: z.boolean().default(true),
    hintsUsed: n,
    hintCost: n,
    pointsAvailable: n,
});

const categoryRows = z.array(z.object({ category: z.string(), count: n })).default([]);
const difficultyRows = z.array(z.object({ difficulty: z.string(), count: n })).default([]);
const languageRows = z.array(z.object({ language: z.string(), count: n })).default([]);

export const statsSchema = z.object({
    total: n,
    facets: z.object({
        categories: categoryRows,
        difficulties: difficultyRows,
        languages: languageRows,
    }).default({ categories: [], difficulties: [], languages: [] }),
    viewer: z.object({ attempted: n, passed: n, points: n }).nullish().transform((v) => v ?? null),
});

export const progressRowSchema = progressSchema.extend({
    snippet: z.object({
        _id: s, slug: s, title: s, category: z.string().default('other'), difficulty: z.string().default('medium'), points: n, findingCount: n,
    }),
    passedAt: nullableText,
    hintsUsed: n,
    solutionViewed: z.boolean().default(false),
    lastAttemptAt: nullableText,
});

export const myProgressSchema = z.object({
    summary: z.object({ attempted: n, passed: n, points: n }).default({ attempted: 0, passed: 0, points: 0 }),
    data: z.array(progressRowSchema).default([]),
});
