import { API_URL } from '@/lib/api';
import type { Certificate, LearningDetail, LearningCard } from '@/types/learning';
import type { Resource } from '@/types/resource';
import { safeHref } from './display';

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://thecyberhub.org').replace(/\/$/, '');

export type ServerResult<T> =
    | { state: 'ok'; data: T }
    /** 404: private (draft, pending) or gone. The browser asks again with the visitor's token. */
    | { state: 'missing' }
    | { state: 'error' };

/** The public view of one thing, fetched while rendering. No token, so no viewer block and no drafts. */
async function fetchPublic<T extends { slug?: string }>(path: string, tag: string): Promise<ServerResult<T>> {
    try {
        const res = await fetch(`${API_URL}${path}`, {
            next: { revalidate: 60, tags: [tag] },
            // The page is rendered while the visitor waits; a slow API falls back to the browser fetch
            signal: AbortSignal.timeout(5000),
        });
        if (res.status === 404) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const data = body?.data as T | undefined;
        if (!data || typeof data !== 'object') return { state: 'error' };
        return { state: 'ok', data };
    } catch {
        return { state: 'error' };
    }
}

export const fetchPublicPath = (slug: string): Promise<ServerResult<LearningDetail>> =>
    fetchPublic<LearningDetail>(`/api/learning-paths/${encodeURIComponent(slug)}`, 'learning-paths');

export const fetchPublicResource = (slug: string): Promise<ServerResult<Resource>> =>
    fetchPublic<Resource>(`/api/resources/${encodeURIComponent(slug)}`, 'resources');

/** The public certificate check. Not cached: a certificate is checked when someone opens the link. */
export async function fetchCertificate(id: string): Promise<ServerResult<Certificate>> {
    try {
        const res = await fetch(`${API_URL}/api/certificates/${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (res.status === 404 || res.status === 400) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        return body?.data?.certificateId ? { state: 'ok', data: body.data as Certificate } : { state: 'error' };
    } catch {
        return { state: 'error' };
    }
}

const clip = (text: string, max: number) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

export const pathDescription = (path: Pick<LearningDetail, 'seo' | 'shortDescription' | 'description' | 'title'>): string =>
    clip(path.seo?.metaDescription || path.shortDescription || path.description || `Follow ${path.title} on TheCyberHub.`, 160);

/** schema.org Course for search engines. Only public facts. */
export function pathJsonLd(path: LearningDetail): Record<string, unknown> {
    const route = path.kind === 'roadmap' ? 'roadmaps' : 'learning-paths';
    return {
        '@context': 'https://schema.org',
        '@type': 'Course',
        name: path.title,
        description: clip(path.description || path.shortDescription || path.title, 300),
        url: `${SITE_URL}/${route}/${path.slug}`,
        educationalLevel: path.difficulty,
        timeRequired: path.estimatedDuration || undefined,
        provider: { '@type': 'Organization', name: 'TheCyberHub', url: SITE_URL },
        teaches: path.skills?.length ? path.skills : undefined,
    };
}

/** schema.org ItemList for a catalogue page */
export function listJsonLd(name: string, route: 'roadmaps' | 'learning-paths', cards: Pick<LearningCard, 'slug' | 'title'>[]): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name,
        itemListElement: cards.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/${route}/${c.slug}`, name: c.title })),
    };
}

/** schema.org LearningResource for a library entry. The outbound link is only included when it is http(s). */
export function resourceJsonLd(resource: Resource): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'LearningResource',
        name: resource.title,
        description: clip(resource.description, 300),
        url: `${SITE_URL}/resources/${resource.slug}`,
        learningResourceType: resource.type,
        educationalLevel: resource.difficulty,
        keywords: resource.tags?.length ? resource.tags.join(', ') : undefined,
        isAccessibleForFree: resource.isFree,
        sameAs: safeHref(resource.url) ?? undefined,
    };
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

export interface SitemapRow { slug: string; updatedAt?: string }

/**
 * Published slugs of a list endpoint, a page at a time (the API caps a page at 50). Capped in
 * count and in time so a slow API cannot hold up the whole sitemap.
 */
export async function fetchSitemapRows(path: string, { max = 5000, budgetMs = 15000 }: { max?: number; budgetMs?: number } = {}): Promise<SitemapRow[]> {
    const out: SitemapRow[] = [];
    const started = Date.now();
    try {
        for (let page = 1; out.length < max && Date.now() - started < budgetMs; page += 1) {
            const res = await fetch(`${API_URL}${path}${path.includes('?') ? '&' : '?'}limit=50&page=${page}`, {
                next: { revalidate: 3600 },
                signal: AbortSignal.timeout(4000),
            });
            if (!res.ok) break;
            const body = await res.json();
            const rows: { slug?: string; updatedAt?: string; publishedAt?: string | null; approvedAt?: string | null; createdAt?: string }[] = body?.data ?? [];
            for (const row of rows) {
                if (row?.slug) out.push({ slug: row.slug, updatedAt: row.updatedAt || row.publishedAt || row.approvedAt || row.createdAt });
            }
            if (!body?.pagination?.hasMore || rows.length === 0) break;
        }
    } catch {
        // The rest of the sitemap is still listed
    }
    return out.slice(0, max);
}

/** The first page of the public catalogue for one kind, for the ItemList of a catalogue page */
export async function fetchPublicList(kind: 'roadmap' | 'path'): Promise<LearningCard[]> {
    try {
        const res = await fetch(`${API_URL}/api/learning-paths?kind=${kind}&limit=50`, { next: { revalidate: 60, tags: ['learning-paths'] }, signal: AbortSignal.timeout(5000) });
        if (!res.ok) return [];
        const body = await res.json();
        return Array.isArray(body?.data) ? body.data : [];
    } catch {
        return [];
    }
}
