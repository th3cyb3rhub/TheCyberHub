import { cache } from 'react';
import { API_URL } from '@/lib/api';
import { SITE_URL } from '@/lib/events/site';
import type { CtfCompetition, CtfCompetitionCard, CtfListFilter, CtfPage, CtfResults } from '@/types/ctf';
import { CTF_CACHE_TAG, LIST_FILTER_QUERY } from './constants';
import { ctfCardSchema, ctfDetailSchema, ctfResultsSchema } from './schemas';

export { SITE_URL };

/**
 * What the API accepts for a competition slug: 1 to 80 characters of a to z, 0 to 9
 * and hyphens. Anything else can never be a competition: a real 404 without asking the API.
 */
const SLUG = /^[a-z0-9-]{1,80}$/;

export const isCtfSlug = (value: string): boolean => SLUG.test(value.toLowerCase());

const TIMEOUT_MS = 5000;

/**
 * When the API produced a response, from its `Date` header (a cached copy keeps the original), as
 * milliseconds since the epoch; 0 when it is missing, which the browser reads as "old, ask again".
 * This is what the page passes as the age of the data it rendered. It is the API's moment, not the
 * moment this render ran: a copy cached for a minute is a minute old.
 */
export function fetchedAtOf(res: Pick<Response, 'headers'>): number {
    const stamp = Date.parse(res.headers.get('date') ?? '');
    return Number.isFinite(stamp) ? stamp : 0;
}

export type ServerCompetition =
    | { state: 'ok'; competition: CtfCompetition; /** When the API produced it, 0 when unknown */ fetchedAt: number }
    /** The segment cannot be a slug: a real 404 */
    | { state: 'invalid' }
    /** 404 for a visitor: a draft or a wrong slug. Staff may still see it, so the browser asks again with the token. */
    | { state: 'missing' }
    /** The API was slow or failed: the browser asks again */
    | { state: 'error' };

/**
 * The public view of a competition, fetched while rendering. No token, so a draft is a 404 here and
 * the browser asks again for staff. A slow or failing API gives `error`, never an exception.
 * `cache` makes the page and `generateMetadata` share the one request.
 */
export const fetchPublicCompetition = cache(async (slug: string): Promise<ServerCompetition> => {
    if (!isCtfSlug(slug)) return { state: 'invalid' };
    try {
        const res = await fetch(`${API_URL}/api/ctf-competitions/${encodeURIComponent(slug.toLowerCase())}`, {
            next: { revalidate: 60, tags: [CTF_CACHE_TAG] },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 404 || res.status === 400) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const parsed = ctfDetailSchema.safeParse(body?.data);
        if (!parsed.success) return { state: 'error' };
        return { state: 'ok', competition: parsed.data as CtfCompetition, fetchedAt: fetchedAtOf(res) };
    } catch {
        return { state: 'error' };
    }
});

export type ServerCompetitionsPage = CtfPage<CtfCompetitionCard> & { fetchedAt: number };

/** One page of the public list for a tab. Cards that do not parse are left out; a failing API gives null. */
export const fetchCompetitionsPage = cache(async (filter: CtfListFilter = 'all', page = 1, limit = 12): Promise<ServerCompetitionsPage | null> => {
    try {
        const qs = new URLSearchParams({ limit: String(limit) });
        const status = LIST_FILTER_QUERY[filter];
        if (status) qs.set('status', status);
        if (page > 1) qs.set('page', String(page));
        const res = await fetch(`${API_URL}/api/ctf-competitions?${qs.toString()}`, {
            next: { revalidate: 60, tags: [CTF_CACHE_TAG] },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const body = await res.json();
        const pagination = body?.pagination;
        if (!Array.isArray(body?.data) || !pagination || typeof pagination.total !== 'number') return null;
        const cards: CtfCompetitionCard[] = [];
        for (const item of body.data) {
            const parsed = ctfCardSchema.safeParse(item);
            if (parsed.success) cards.push(parsed.data as CtfCompetitionCard);
        }
        return {
            success: true,
            data: cards,
            pagination: {
                page: Number(pagination.page) || page,
                limit: Number(pagination.limit) || limit,
                total: pagination.total,
                pages: Number(pagination.pages) || 1,
            },
            fetchedAt: fetchedAtOf(res),
        };
    } catch {
        return null;
    }
});

export type ServerResults =
    | { state: 'ok'; results: CtfResults; fetchedAt: number }
    | { state: 'invalid' }
    /** 409: the competition has not ended */
    | { state: 'not-ready' }
    | { state: 'missing' }
    | { state: 'error' };

/** The results of an ended competition, for the page to show before the browser runs */
export const fetchPublicResults = cache(async (slug: string): Promise<ServerResults> => {
    if (!isCtfSlug(slug)) return { state: 'invalid' };
    try {
        const res = await fetch(`${API_URL}/api/ctf-competitions/${encodeURIComponent(slug.toLowerCase())}/results`, {
            next: { revalidate: 60, tags: [CTF_CACHE_TAG] },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 409) return { state: 'not-ready' };
        if (res.status === 404 || res.status === 400) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const parsed = ctfResultsSchema.safeParse(body?.data);
        if (!parsed.success) return { state: 'error' };
        return { state: 'ok', results: parsed.data as unknown as CtfResults, fetchedAt: fetchedAtOf(res) };
    } catch {
        return { state: 'error' };
    }
});
