import { ApiError, fetchApi } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants/api-endpoints';
import type {
    GlobalLeaderRow, HintResult, LabAdminView, LabCategory, LabDetail, LabFacets, LabFilters, LabLeaderRow, LabManageRow,
    LabPayload, LabProgressRow, LabCard, LabStats, LabStatus, Page, StopResult, SubmitResult,
} from '@/types/lab';

const E = API_ENDPOINTS.LABS;

/** Query string for the list endpoints. Empty values are left out; page 1 is implied. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '' || value === false) continue;
        if (key === 'page' && value === 1) continue;
        qs.set(key, String(value));
    }
    const s = qs.toString();
    return s ? `?${s}` : '';
}

const ref = (slug: string) => encodeURIComponent(slug);

const send = (path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) =>
    fetchApi(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

// ---- Public reads (the token is sent when there is one: it adds `myStatus` and `viewer`) ----

export function listLabs(filters: LabFilters = {}): Promise<Page<LabCard>> {
    return fetchApi(`${E.BASE}${query({
        page: filters.page, limit: filters.limit, category: filters.category, difficulty: filters.difficulty,
        status: filters.status, q: filters.q, sort: filters.sort,
    })}`);
}

export async function getFacets(): Promise<LabFacets> {
    return (await fetchApi(E.CATEGORIES)).data;
}

export async function getLab(slug: string): Promise<LabDetail> {
    return (await fetchApi(E.BY_REF(ref(slug)))).data;
}

export async function globalLeaderboard(params: { limit?: number; category?: LabCategory | '' } = {}): Promise<GlobalLeaderRow[]> {
    return (await fetchApi(`${E.LEADERBOARD}${query(params)}`)).data ?? [];
}

export async function labLeaderboard(slug: string, limit?: number): Promise<LabLeaderRow[]> {
    return (await fetchApi(`${E.LAB_LEADERBOARD(ref(slug))}${query({ limit })}`)).data ?? [];
}

// ---- Member ----

/** My progress on one lab, or null when I have not started it */
export async function getLabProgress(slug: string): Promise<LabProgressRow | null> {
    try {
        return (await fetchApi(E.LAB_PROGRESS(ref(slug)))).data;
    } catch (err) {
        if (err instanceof ApiError && err.code === 'LAB_NOT_STARTED') return null;
        throw err;
    }
}

export function listMyProgress(params: { page?: number; limit?: number } = {}): Promise<Page<LabProgressRow>> {
    return fetchApi(`${E.PROGRESS}${query(params)}`);
}

export async function getStats(): Promise<LabStats> {
    return (await fetchApi(E.STATS)).data;
}

export async function startLab(slug: string): Promise<LabProgressRow> {
    return (await send(E.START(ref(slug)), 'POST')).data;
}

/** The flag goes to the server and nowhere else: it is not logged, cached or kept */
export async function submitFlag(slug: string, flag: string): Promise<SubmitResult> {
    return (await send(E.SUBMIT(ref(slug)), 'POST', { flag })).data;
}

export async function unlockHint(slug: string, hintIndex: number): Promise<HintResult> {
    return (await send(E.HINT(ref(slug)), 'POST', { hintIndex })).data;
}

export async function stopLab(slug: string): Promise<StopResult> {
    return (await send(E.STOP(ref(slug)), 'POST')).data;
}

// ---- Admin and owner ----

export function listManagedLabs(params: { page?: number; limit?: number; status?: LabStatus | ''; q?: string } = {}): Promise<Page<LabManageRow>> {
    return fetchApi(`${E.MANAGE}${query(params)}`);
}

export async function createLab(body: LabPayload): Promise<LabAdminView> {
    return (await send(E.BASE, 'POST', body)).data;
}

export async function updateLab(slug: string, body: LabPayload): Promise<LabAdminView> {
    return (await send(E.BY_REF(ref(slug)), 'PUT', body)).data;
}

export async function deleteLab(slug: string): Promise<{ _id: string; slug: string }> {
    return (await send(E.BY_REF(ref(slug)), 'DELETE')).data;
}
