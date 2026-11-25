import type { z } from 'zod';
import { ApiError, fetchApi, tokenStore } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants/api-endpoints';
import {
    adminSnippetSchema, attemptListSchema, attemptResultSchema, cardPageSchema, detailSchema, hintResultSchema, manageCardPageSchema,
    manageCardSchema, myProgressSchema, solutionSchema, statsSchema,
} from '@/lib/codeReview/schemas';
import type {
    CrAdminSnippet, CrAttemptResult, CrAttemptRow, CrCard, CrDetail, CrFilters, CrHintResult, CrManageCard, CrManageFilters, CrMark,
    CrMyProgress, CrPage, CrSnippetPayload, CrSolution, CrStats,
} from '@/types/codeReview';

const E = API_ENDPOINTS.CODE_REVIEW;
const ref = (slug: string) => encodeURIComponent(slug);

/**
 * An answer that does not have the shape the contract promises is an error the screen can show,
 * never a half-drawn page. Extra keys are fine: they are dropped.
 */
function parse<T>(schema: z.ZodType, value: unknown, what: string): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new ApiError(`The ${what} came back in a shape this page does not understand. Please try again later.`, 502, 'BAD_RESPONSE');
    return result.data as T;
}

/** `?a=b&c=d` for the fields that carry a value. Page 1 is implied. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        if (key === 'page' && value === 1) continue;
        qs.set(key, String(value));
    }
    const s = qs.toString();
    return s ? `?${s}` : '';
}

/** What the API reads from the list filters (the `status` is the member's own state and needs a token) */
export function listQuery(f: CrFilters): string {
    return query({
        page: f.page, limit: f.limit, category: f.category, difficulty: f.difficulty, language: f.language,
        search: f.search?.trim(), status: f.status, sortBy: f.sortBy, sortOrder: f.sortOrder,
    });
}

const send = (path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) =>
    fetchApi(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/**
 * A read whose answer depends on who asks (`progress`, `viewer`, and for staff the answer key) is
 * never taken from the browser's HTTP cache once there is a token; a visitor's read is the same
 * for everybody, so the API's own five minute cache can serve it.
 */
const viewerRead = (): RequestInit => (tokenStore.get() ? { cache: 'no-store' } : {});

// ---- Public reads (the token is sent when there is one: it adds `progress` and `viewer`) ----

export async function listSnippets(filters: CrFilters = {}): Promise<CrPage<CrCard>> {
    return parse(cardPageSchema, await fetchApi(`${E.BASE}${listQuery(filters)}`, viewerRead()), 'list of exercises');
}

export async function getStats(): Promise<CrStats> {
    return parse((statsSchema), (await fetchApi(E.STATS, viewerRead()))?.data, 'totals');
}

export async function getSnippet(slug: string): Promise<CrDetail> {
    return parse(detailSchema, (await fetchApi(E.BY_REF(ref(slug)), viewerRead()))?.data, 'exercise');
}

// ---- Members ----

export async function getMyProgress(): Promise<CrMyProgress> {
    const body = await fetchApi(E.MY_PROGRESS);
    return parse(myProgressSchema, { summary: body?.summary, data: body?.data }, 'progress');
}

export async function listAttempts(slug: string): Promise<CrAttemptRow[]> {
    return parse<{ data: CrAttemptRow[] }>(attemptListSchema, await fetchApi(E.ATTEMPTS(ref(slug))), 'attempts').data;
}

/** The marks go to the server and nothing else: it grades them against its own key */
export async function submitAttempt(slug: string, marks: CrMark[]): Promise<CrAttemptResult> {
    const body = marks.map((m) => ({
        lineStart: m.lineStart, lineEnd: m.lineEnd, ...(m.vulnerabilityType ? { vulnerabilityType: m.vulnerabilityType } : {}),
    }));
    return parse(attemptResultSchema, (await send(E.ATTEMPTS(ref(slug)), 'POST', { marks: body }))?.data, 'result');
}

export async function unlockHint(slug: string, order: number): Promise<CrHintResult> {
    return parse(hintResultSchema, (await send(E.HINT(ref(slug), order), 'POST'))?.data, 'hint');
}

/** Opening it is recorded by the API: a member who passes after opening it earns no points */
export async function getSolution(slug: string): Promise<CrSolution> {
    return parse(solutionSchema, (await fetchApi(E.SOLUTION(ref(slug)), { cache: 'no-store' }))?.data, 'solution');
}

// ---- Staff ----

export async function listManaged(filters: CrManageFilters = {}): Promise<CrPage<CrManageCard>> {
    const published = filters.isPublished === '' ? undefined : filters.isPublished;
    const qs = query({
        page: filters.page, limit: filters.limit, isPublished: published, category: filters.category, difficulty: filters.difficulty,
        language: filters.language, search: filters.search?.trim(),
    });
    return parse(manageCardPageSchema, await fetchApi(`${E.MANAGE}${qs}`, { cache: 'no-store' }), 'list of exercises');
}

/** The whole snippet with its answer key (admin, owner, moderator; drafts included) */
export async function getAdminSnippet(slug: string): Promise<CrAdminSnippet> {
    return parse(adminSnippetSchema, (await fetchApi(E.BY_REF(ref(slug)), { cache: 'no-store' }))?.data, 'exercise');
}

export async function createSnippet(payload: CrSnippetPayload): Promise<CrAdminSnippet> {
    return parse(adminSnippetSchema, (await send(E.BASE, 'POST', payload))?.data, 'saved exercise');
}

export async function updateSnippet(slug: string, payload: CrSnippetPayload): Promise<CrAdminSnippet> {
    return parse(adminSnippetSchema, (await send(E.BY_REF(ref(slug)), 'PUT', payload))?.data, 'saved exercise');
}

export async function setPublished(slug: string, published: boolean): Promise<CrManageCard> {
    const path = published ? E.PUBLISH(ref(slug)) : E.UNPUBLISH(ref(slug));
    return parse(manageCardSchema, (await send(path, 'POST'))?.data, 'exercise');
}

export async function deleteSnippet(slug: string): Promise<{ _id: string; slug: string }> {
    const data = (await send(E.BY_REF(ref(slug)), 'DELETE'))?.data;
    return { _id: String(data?._id ?? ''), slug: String(data?.slug ?? slug) };
}
