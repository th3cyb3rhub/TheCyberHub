import { cache } from 'react';
import { API_URL } from '@/lib/api';
import { SITE_URL } from '@/lib/events/site';
import { labCardSchema, labDetailSchema, labFacetsSchema } from './schemas';
import type { LabCard, LabDetail, LabFacets, Page } from '@/types/lab';

export { SITE_URL };

/** Slugs that would shadow a fixed API route: they can never be a lab */
const RESERVED = new Set(['progress', 'stats', 'categories', 'leaderboard', 'manage']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OBJECT_ID = /^[0-9a-f]{24}$/;

/** Whether a path segment can be a lab slug: anything else is a real 404 without asking the API */
export function isLabSlug(value: string): boolean {
    const slug = value.toLowerCase();
    return slug.length >= 3 && slug.length <= 80 && SLUG.test(slug) && !RESERVED.has(slug) && !OBJECT_ID.test(slug);
}

export type ServerLab =
    | { state: 'ok'; lab: LabDetail }
    /** The segment cannot be a lab slug: a real 404 */
    | { state: 'invalid' }
    /** 404 for a visitor: a draft, an archived lab or a wrong slug. Staff may still see it, so the browser asks again with the token. */
    | { state: 'missing' }
    /** The API was slow or failed: the browser asks again */
    | { state: 'error' };

const TIMEOUT_MS = 5000;

/**
 * The public view of a lab, fetched while rendering. No token, so no viewer block: the browser asks
 * again for the signed-in member. A slow or failing API gives `error`, never an exception.
 * `cache` makes the page and `generateMetadata` share the one request.
 */
export const fetchPublicLab = cache(async (slug: string): Promise<ServerLab> => {
    if (!isLabSlug(slug)) return { state: 'invalid' };
    try {
        const res = await fetch(`${API_URL}/api/labs/${encodeURIComponent(slug.toLowerCase())}`, {
            next: { revalidate: 60, tags: ['labs'] },
            // The page is rendered while the visitor waits; a slow API falls back to the browser fetch
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 404 || res.status === 400) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const parsed = labDetailSchema.safeParse(body?.data);
        if (!parsed.success) return { state: 'error' };
        return { state: 'ok', lab: { ...parsed.data, viewer: null } as LabDetail };
    } catch {
        return { state: 'error' };
    }
});

/**
 * The first page of the plain list (newest first), for the list page to show before the browser
 * runs. Cards that do not parse are left out; a failing API gives null and the browser asks again.
 */
export const fetchLabsPage = cache(async (limit = 12): Promise<Page<LabCard> | null> => {
    try {
        const res = await fetch(`${API_URL}/api/labs?limit=${limit}&sort=newest`, {
            next: { revalidate: 300, tags: ['labs'] },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const body = await res.json();
        const pagination = body?.pagination;
        if (!Array.isArray(body?.data) || !pagination || typeof pagination.hasMore !== 'boolean') return null;
        const cards: LabCard[] = [];
        for (const item of body.data) {
            const parsed = labCardSchema.safeParse(item);
            if (parsed.success) cards.push(parsed.data as LabCard);
        }
        return {
            success: true,
            count: cards.length,
            data: cards,
            pagination: {
                page: Number(pagination.page) || 1,
                limit: Number(pagination.limit) || limit,
                total: typeof pagination.total === 'number' ? pagination.total : null,
                totalPages: typeof pagination.totalPages === 'number' ? pagination.totalPages : null,
                hasMore: pagination.hasMore,
            },
        };
    } catch {
        return null;
    }
});

/** Category and difficulty counts for the filters */
export const fetchLabFacets = cache(async (): Promise<LabFacets | null> => {
    try {
        const res = await fetch(`${API_URL}/api/labs/categories`, {
            next: { revalidate: 300, tags: ['labs'] },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const body = await res.json();
        const parsed = labFacetsSchema.safeParse(body?.data);
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
});
