import { fetchApi } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants/api-endpoints';
import type {
    ApplicationStatus, ApplyPayload, CohortCard, CohortDetail, CohortFilters, CohortPayload, MyApplication, Page,
    PastCohort, StaffApplication, StaffApplicationRow,
} from '@/types/internship';

const E = API_ENDPOINTS.INTERNSHIPS;

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

const send = (path: string, method: 'POST' | 'PUT', body?: unknown) =>
    fetchApi(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

// ---- Public reads (the token is sent when there is one) ----

export function listCohorts(filters: CohortFilters = {}): Promise<Page<CohortCard>> {
    return fetchApi(`${E.BASE}${query({ type: filters.type, status: filters.status, page: filters.page, limit: filters.limit })}`);
}

export function listPastCohorts(params: { page?: number; limit?: number } = {}): Promise<Page<PastCohort>> {
    return fetchApi(`${E.PAST}${query(params)}`);
}

export async function getCohort(id: string): Promise<CohortDetail> {
    return (await fetchApi(E.BY_ID(encodeURIComponent(id)))).data;
}

// ---- Member ----

export async function applyToCohort(id: string, body: ApplyPayload): Promise<MyApplication> {
    return (await send(E.APPLY(encodeURIComponent(id)), 'POST', body)).data;
}

export function listMyApplications(params: { status?: ApplicationStatus; page?: number; limit?: number } = {}): Promise<Page<MyApplication>> {
    return fetchApi(`${E.MY_APPLICATIONS}${query(params)}`);
}

export async function withdrawApplication(id: string, reason?: string): Promise<MyApplication> {
    const trimmed = reason?.trim();
    return (await send(E.WITHDRAW(encodeURIComponent(id)), 'PUT', trimmed ? { reason: trimmed } : {})).data;
}

// ---- Staff (moderator, admin, owner) ----

/** Every cohort, drafts and switched-off ones too, with the counters */
export function listAdminCohorts(filters: CohortFilters = {}): Promise<Page<CohortCard>> {
    return fetchApi(`${E.BASE}${query({ all: true, type: filters.type, status: filters.status, page: filters.page, limit: filters.limit })}`);
}

export async function createCohort(body: CohortPayload): Promise<CohortDetail> {
    return (await send(E.BASE, 'POST', body)).data;
}

export async function updateCohort(id: string, body: CohortPayload): Promise<CohortDetail> {
    return (await send(E.BY_ID(encodeURIComponent(id)), 'PUT', body)).data;
}

export function listCohortApplications(id: string, params: { status?: ApplicationStatus; page?: number; limit?: number } = {}): Promise<Page<StaffApplicationRow>> {
    return fetchApi(`${E.COHORT_APPLICATIONS(encodeURIComponent(id))}${query(params)}`);
}

export async function getStaffApplication(id: string): Promise<StaffApplication> {
    return (await fetchApi(E.APPLICATION(encodeURIComponent(id)))).data;
}

export async function changeApplicationStatus(id: string, body: { status: ApplicationStatus; note?: string }): Promise<StaffApplication> {
    const note = body.note?.trim();
    return (await send(E.APPLICATION_STATUS(encodeURIComponent(id)), 'PUT', { status: body.status, ...(note ? { note } : {}) })).data;
}
