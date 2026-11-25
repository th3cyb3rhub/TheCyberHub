import { cache } from 'react';
import { API_URL } from '@/lib/api';
import { SITE_URL } from '@/lib/events/site';
import { CODE_REVIEW_CACHE_TAG } from './constants';
import { isSnippetRef } from './slug';
import { cardSchema, detailSchema, paginationSchema, statsSchema } from './schemas';
import type { CrCard, CrDetail, CrPage, CrStats } from '@/types/codeReview';

export { SITE_URL };
export { isSnippetRef };

export type ServerSnippet =
    | { state: 'ok'; snippet: CrDetail }
    /** The segment cannot be an exercise reference: a real 404 */
    | { state: 'invalid' }
    /** 404 for a visitor: a draft or a wrong slug. Staff may still see it, so the browser asks again with the token. */
    | { state: 'missing' }
    /** The API was slow or failed: the browser asks again */
    | { state: 'error' };

const TIMEOUT_MS = 5000;

const get = (path: string, revalidate: number) => fetch(`${API_URL}${path}`, {
    next: { revalidate, tags: [CODE_REVIEW_CACHE_TAG] },
    // The page is rendered while the visitor waits; a slow API falls back to the browser fetch
    signal: AbortSignal.timeout(TIMEOUT_MS),
});

/**
 * The public view of an exercise, fetched while rendering. No token, so no viewer block: the
 * browser asks again for the signed-in member. A slow or failing API gives `error`, never an
 * exception. `cache` makes the page and `generateMetadata` share the one request.
 */
export const fetchPublicSnippet = cache(async (slug: string): Promise<ServerSnippet> => {
    if (!isSnippetRef(slug)) return { state: 'invalid' };
    try {
        const res = await get(`/api/code-review/${encodeURIComponent(slug.toLowerCase())}`, 300);
        if (res.status === 404 || res.status === 400) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const parsed = detailSchema.safeParse(body?.data);
        if (!parsed.success) return { state: 'error' };
        return { state: 'ok', snippet: { ...parsed.data, viewer: null, progress: undefined } as CrDetail };
    } catch {
        return { state: 'error' };
    }
});

/**
 * The first page of the plain list (newest first), for the list page to show before the browser
 * runs. Cards that do not parse are left out; a failing API gives null and the browser asks again.
 */
export const fetchSnippetsPage = cache(async (limit = 12): Promise<CrPage<CrCard> | null> => {
    try {
        const res = await get(`/api/code-review?limit=${limit}`, 300);
        if (!res.ok) return null;
        const body = await res.json();
        const pagination = paginationSchema.safeParse(body?.pagination);
        if (!Array.isArray(body?.data) || !pagination.success) return null;
        const cards: CrCard[] = [];
        for (const item of body.data) {
            const parsed = cardSchema.safeParse(item);
            // A visitor's copy never carries a member's progress
            if (parsed.success) cards.push({ ...parsed.data, progress: undefined } as CrCard);
        }
        return { count: cards.length, data: cards, pagination: pagination.data };
    } catch {
        return null;
    }
});

/** Totals and the counts for the filters */
export const fetchSnippetStats = cache(async (): Promise<CrStats | null> => {
    try {
        const res = await get('/api/code-review/stats', 300);
        if (!res.ok) return null;
        const parsed = statsSchema.safeParse((await res.json())?.data);
        return parsed.success ? ({ ...parsed.data, viewer: null } as CrStats) : null;
    } catch {
        return null;
    }
});

const SITEMAP_PAGE_SIZE = 50;
const SITEMAP_MAX_PAGES = 10;

/**
 * The published exercises for the sitemap: the card's address only, never a title, hint or answer.
 * The list is public and has the same pages as the site. A failing API gives what was read so far
 * (or nothing), so the sitemap never fails because of it.
 */
export async function fetchSitemapSlugs(): Promise<string[]> {
    const slugs: string[] = [];
    try {
        for (let page = 1; page <= SITEMAP_MAX_PAGES; page += 1) {
            const res = await get(`/api/code-review?limit=${SITEMAP_PAGE_SIZE}&page=${page}`, 3600);
            if (!res.ok) break;
            const body = await res.json();
            if (!Array.isArray(body?.data)) break;
            for (const item of body.data) {
                const slug = typeof item?.slug === 'string' ? item.slug : '';
                if (slug && isSnippetRef(slug) && !slugs.includes(slug)) slugs.push(slug);
            }
            if (!body?.pagination?.hasMore) break;
        }
    } catch {
        // What was read stays; the static pages are listed either way
    }
    return slugs;
}
