import { cache } from 'react';
import { API_URL } from '@/lib/api';
import { SITE_URL } from '@/lib/events/site';
import type { Company, Job, JobCard, JobListFilters, JobMeta, JobsPage } from '@/types/job';
import { JOBS_CACHE_TAG, JOB_LIMITS } from './constants';
import { jobsApiQuery } from './query';
import { companySchema, jobCardSchema, jobDetailSchema, paginationSchema } from './schemas';
import { PUBLIC_ITEM_REVALIDATE_SECONDS } from '@/lib/server/cacheTimes';

export { SITE_URL };

/**
 * What the API accepts for a job reference: an id, or any slug the job ever had (letters, digits,
 * hyphens and underscores, at most 200). Anything else can never be a job: a real 404 without asking.
 */
const REF = /^[A-Za-z0-9_-]{1,200}$/;
export const isJobRef = (value: string): boolean => REF.test(value);

const SLUG = /^[a-z0-9-]{1,120}$/;
export const isCompanySlug = (value: string): boolean => SLUG.test(value.toLowerCase());

const TIMEOUT_MS = 5000;

/** The address of a job page, always by its canonical slug */
export const jobUrl = (slug: string): string => `${SITE_URL}/jobs/${slug}`;

/**
 * When the API produced a response, from its `Date` header (a cached copy keeps the original), as
 * milliseconds since the epoch; 0 when it is missing, which the browser reads as "old, ask again".
 */
export function fetchedAtOf(res: Pick<Response, 'headers'>): number {
    const stamp = Date.parse(res.headers.get('date') ?? '');
    return Number.isFinite(stamp) ? stamp : 0;
}

const get = (path: string) => fetch(`${API_URL}${path}`, {
    next: { revalidate: PUBLIC_ITEM_REVALIDATE_SECONDS, tags: [JOBS_CACHE_TAG] },
    signal: AbortSignal.timeout(TIMEOUT_MS),
});

export type ServerJob =
    | { state: 'ok'; job: Job; meta: JobMeta; /** When the API produced it, 0 when unknown */ fetchedAt: number }
    /** The segment cannot be a job reference: a real 404 */
    | { state: 'invalid' }
    /** 404 for a visitor: a job that is not public, an unknown reference. Its poster and reviewers may still see it. */
    | { state: 'missing' }
    /** The API was slow or failed: the browser asks again */
    | { state: 'error' };

/**
 * The public view of a job, fetched while rendering. No token, so a job that is not public is a 404
 * here and nothing is known about the viewer: the browser asks again for its poster and reviewers,
 * and for the saved state. A slow or failing API gives `error`, never an exception. `cache` makes
 * the page and `generateMetadata` share the one request.
 */
export const fetchPublicJob = cache(async (ref: string): Promise<ServerJob> => {
    if (!isJobRef(ref)) return { state: 'invalid' };
    try {
        const res = await get(`/api/jobs/${encodeURIComponent(ref)}`);
        if (res.status === 404 || res.status === 400) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const parsed = jobDetailSchema.safeParse(body?.data);
        if (!parsed.success) return { state: 'error' };
        const meta: JobMeta = {};
        if (typeof body?.meta?.redirectedFromSlug === 'string') meta.redirectedFromSlug = body.meta.redirectedFromSlug;
        if (typeof body?.meta?.canonicalSlug === 'string') meta.canonicalSlug = body.meta.canonicalSlug;
        return { state: 'ok', job: parsed.data as unknown as Job, meta, fetchedAt: fetchedAtOf(res) };
    } catch {
        return { state: 'error' };
    }
});

export type ServerJobsPage = JobsPage<JobCard> & { fetchedAt: number };

const loadJobsPage = cache(async (query: string): Promise<ServerJobsPage | null> => {
    try {
        const res = await get(`/api/jobs${query}`);
        if (!res.ok) return null;
        const body = await res.json();
        const pagination = paginationSchema.safeParse(body?.pagination);
        if (!Array.isArray(body?.data) || !pagination.success) return null;
        const cards: JobCard[] = [];
        for (const item of body.data) {
            const parsed = jobCardSchema.safeParse(item);
            if (parsed.success) cards.push(parsed.data as unknown as JobCard);
        }
        return { success: true, data: cards, pagination: pagination.data, fetchedAt: fetchedAtOf(res) };
    } catch {
        return null;
    }
});

/** One page of the public list for a set of filters. Cards that do not parse are left out; a failing API gives null. */
export const fetchJobsPage = (filters: JobListFilters = {}, limit: number = JOB_LIMITS.pageDefault): Promise<ServerJobsPage | null> =>
    loadJobsPage(jobsApiQuery({ ...filters, page: filters.page, limit }));

export type ServerCompany =
    | { state: 'ok'; company: Company }
    | { state: 'invalid' }
    /** 404: unknown, or rejected (its owner and reviewers can still read it, in the browser) */
    | { state: 'missing' }
    | { state: 'error' };

export const fetchCompany = cache(async (slug: string): Promise<ServerCompany> => {
    if (!isCompanySlug(slug)) return { state: 'invalid' };
    try {
        const res = await get(`/api/companies/${encodeURIComponent(slug.toLowerCase())}`);
        if (res.status === 404 || res.status === 400) return { state: 'missing' };
        if (!res.ok) return { state: 'error' };
        const body = await res.json();
        const parsed = companySchema.safeParse(body?.data);
        if (!parsed.success) return { state: 'error' };
        return { state: 'ok', company: parsed.data as unknown as Company };
    } catch {
        return { state: 'error' };
    }
});

const loadCompanyJobs = cache(async (slug: string, page: number): Promise<ServerJobsPage | null> => {
    try {
        const qs = page > 1 ? `?page=${page}` : '';
        const res = await get(`/api/companies/${encodeURIComponent(slug.toLowerCase())}/jobs${qs}`);
        if (!res.ok) return null;
        const body = await res.json();
        const pagination = paginationSchema.safeParse(body?.pagination);
        if (!Array.isArray(body?.data) || !pagination.success) return null;
        const cards: JobCard[] = [];
        for (const item of body.data) {
            const parsed = jobCardSchema.safeParse(item);
            if (parsed.success) cards.push(parsed.data as unknown as JobCard);
        }
        return { success: true, data: cards, pagination: pagination.data, fetchedAt: fetchedAtOf(res) };
    } catch {
        return null;
    }
});

/** A company's public jobs, one page. A failing API gives null. */
export const fetchCompanyJobs = (slug: string, page = 1): Promise<ServerJobsPage | null> => loadCompanyJobs(slug.toLowerCase(), Math.max(1, Math.floor(page) || 1));
