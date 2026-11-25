import { cache } from 'react';
import { API_URL } from '@/lib/api';
import type { Mentor } from '@/types/mentorship';
import { displayName } from './display';
import { PUBLIC_ITEM_REVALIDATE_SECONDS } from '@/lib/server/cacheTimes';

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://thecyberhub.org').replace(/\/$/, '');

export type ServerMentor =
    | { state: 'ok'; mentor: Mentor }
    /** 404: not listed (pending, suspended) or gone. The browser asks again with the visitor's token. */
    | { state: 'missing' }
    | { state: 'error' };

/**
 * The public view of a mentor, fetched while rendering and shared between the page and its
 * metadata. No token, so only approved profiles answer.
 */
export const fetchPublicMentor = cache(async (id: string): Promise<ServerMentor> => {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) return { state: 'missing' };
    try {
        const res = await fetch(`${API_URL}/api/mentors/${encodeURIComponent(id)}`, {
            next: { revalidate: PUBLIC_ITEM_REVALIDATE_SECONDS, tags: ['mentors'] },
            signal: AbortSignal.timeout(5000),
        });
        if (res.status === 404) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const mentor = body?.data as Mentor | undefined;
        if (!mentor || !mentor._id) return { state: 'error' };
        return { state: 'ok', mentor };
    } catch {
        return { state: 'error' };
    }
});

/** The approved mentors for the sitemap, a page at a time. A slow or failing API gives an empty list. */
export async function fetchMentorIdsForSitemap(max = 200): Promise<{ id: string; updatedAt?: string }[]> {
    const out: { id: string; updatedAt?: string }[] = [];
    try {
        for (let page = 1; out.length < max; page += 1) {
            const res = await fetch(`${API_URL}/api/mentors?hasCapacity=false&limit=50&page=${page}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) });
            if (!res.ok) break;
            const body = await res.json();
            const rows: Mentor[] = body?.data ?? [];
            for (const m of rows) if (m?._id) out.push({ id: m._id, updatedAt: m.createdAt });
            if (!body?.pagination || page >= body.pagination.pages || rows.length === 0) break;
        }
    } catch { /* the sitemap lists the rest */ }
    return out.slice(0, max);
}

export function mentorTitle(mentor: Mentor): string {
    return `${displayName(mentor.user)} - Mentor`;
}
