import { z } from 'zod';
import {
    LAB_CATEGORIES, LAB_DIFFICULTIES, LAB_STATUSES, LAB_VIEWER_STATUSES,
} from '@/types/lab';

/**
 * Runtime checks for what comes back from the labs API, used where a bad answer would break a page
 * rendered on the server, and for what the browser sends. The API stays the judge: these are lenient
 * about extra keys and strict about the few fields a page cannot render without.
 */

/** The longest flag the API reads */
export const FLAG_MAX = 500;

/** A flag as it is sent: trimmed, at least one character, at most 500 */
export const flagSchema = z.string().trim().min(1, 'Enter the flag before you send it').max(FLAG_MAX, `A flag has at most ${FLAG_MAX} characters`);

export const hintIndexSchema = z.number().int().min(0).max(9);

const isoOrNull = z.string().nullable();

export const labCardSchema = z.object({
    _id: z.string(),
    slug: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().default(''),
    category: z.enum(LAB_CATEGORIES),
    difficulty: z.enum(LAB_DIFFICULTIES),
    difficultyRank: z.number().default(0),
    points: z.number(),
    tags: z.array(z.string()).default([]),
    estimatedMinutes: z.number().nullable().default(null),
    hintCount: z.number().default(0),
    fileCount: z.number().default(0),
    labUrl: z.string().nullable().default(null),
    completionCount: z.number().default(0),
    createdAt: z.string().default(''),
    myStatus: z.enum(LAB_VIEWER_STATUSES).optional(),
});

export const labViewerSchema = z.object({
    myStatus: z.enum(LAB_VIEWER_STATUSES),
    hintsUsed: z.number().default(0),
    attempts: z.number().default(0),
    startedAt: isoOrNull.default(null),
    completedAt: isoOrNull.default(null),
    pointsAwarded: z.number().default(0),
    pointsAvailable: z.number().default(0),
    lockedUntil: isoOrNull.default(null),
});

export const labDetailSchema = labCardSchema.extend({
    description: z.string().default(''),
    instructions: z.string().default(''),
    files: z.array(z.object({
        name: z.string(),
        url: z.string(),
        sizeBytes: z.number().nullable().default(null),
        sha256: z.string().nullable().default(null),
    })).default([]),
    hints: z.array(z.object({
        index: z.number(),
        penalty: z.number().default(0),
        unlocked: z.boolean().default(false),
        text: z.string().optional(),
    })).default([]),
    updatedAt: z.string().default(''),
    viewer: labViewerSchema.nullable().default(null),
    admin: z.object({
        status: z.enum(LAB_STATUSES),
        flagCount: z.number().default(0),
        pointsOverride: z.number().default(0),
        startCount: z.number().default(0),
    }).optional(),
});

export const labPageSchema = z.object({
    success: z.boolean().optional(),
    count: z.number().optional(),
    data: z.array(labCardSchema),
    pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number().nullable().default(null),
        totalPages: z.number().nullable().default(null),
        hasMore: z.boolean(),
    }),
});

export const labFacetsSchema = z.object({
    total: z.number().default(0),
    categories: z.array(z.object({ category: z.string(), count: z.number() })).default([]),
    difficulties: z.array(z.object({ difficulty: z.string(), count: z.number() })).default([]),
});
