import { cache } from 'react';
import { API_URL } from '@/lib/api';
import type { CohortDetail } from '@/types/internship';
import { SITE_URL } from '@/lib/events/site';

export { SITE_URL };

export type ServerCohort =
    | { state: 'ok'; cohort: CohortDetail }
    /** The id cannot be a cohort id: a real 404 */
    | { state: 'invalid' }
    /** 404 for a visitor: a draft, a switched-off cohort or a wrong id. Staff may still see it, so the browser asks again with the token. */
    | { state: 'missing' }
    /** The API was slow or failed: the browser asks again */
    | { state: 'error' };

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * The public view of a cohort, fetched while rendering. No token, so no viewer block: the browser
 * asks again for the signed-in member. A slow or failing API gives `error`, never an exception.
 * `cache` makes the page and `generateMetadata` share the one request.
 */
export const fetchPublicCohort = cache(async (id: string): Promise<ServerCohort> => {
    // A wrong id is a 404 without asking the API
    if (!OBJECT_ID.test(id)) return { state: 'invalid' };
    try {
        const res = await fetch(`${API_URL}/api/internships/${id}`, {
            next: { revalidate: 60, tags: ['internships'] },
            // The page is rendered while the visitor waits; a slow API falls back to the browser fetch
            signal: AbortSignal.timeout(5000),
        });
        if (res.status === 404 || res.status === 400) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const cohort = body?.data as CohortDetail | undefined;
        if (!cohort || !cohort._id || !cohort.title) return { state: 'error' };
        return { state: 'ok', cohort };
    } catch {
        return { state: 'error' };
    }
});
