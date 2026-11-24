import { fetchApi } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants/api-endpoints';
import { jobsApiQuery } from '@/lib/jobs/query';
import type {
    AdminCompany, AdminJobFilters, AdminStats, ApplyDetails, Company, CompanyPayload, EmployerJob, Job, JobCard, JobListFilters, JobMeta,
    JobPayload, JobReportReason, JobsPage, JobStatus, MineStats, ModerationAction,
} from '@/types/job';

const J = API_ENDPOINTS.JOBS;
const C = API_ENDPOINTS.COMPANIES;
const enc = encodeURIComponent;

const send = (path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) =>
    fetchApi(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** `?a=b&c=d` for the fields that carry a value. Page 1 is implied. */
function query(params: Record<string, string | number | boolean | undefined | null>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '' || value === false) continue;
        if (key === 'page' && value === 1) continue;
        qs.set(key, String(value));
    }
    const s = qs.toString();
    return s ? `?${s}` : '';
}

// ---- Public reads (the token is sent when there is one, so the answer carries the viewer's saved jobs) ----

export function listJobs(filters: JobListFilters = {}): Promise<JobsPage<JobCard>> {
    return fetchApi(`${J.BASE}${jobsApiQuery(filters)}`);
}

/** One job by id or any slug it had. `meta` says when the address was an old slug. */
export async function getJob(ref: string): Promise<{ job: Job; meta: JobMeta }> {
    const body = await fetchApi(J.BY_REF(enc(ref)));
    return { job: body.data as Job, meta: (body.meta ?? {}) as JobMeta };
}

/** Count an apply click and learn where to apply. Public: no token is needed. */
export async function applyToJob(id: string): Promise<ApplyDetails> {
    const body = await fetchApi(J.APPLY(enc(id)), { method: 'POST', requireAuth: false });
    return { applyUrl: body?.data?.applyUrl ?? null, applyEmail: body?.data?.applyEmail ?? null };
}

export async function getCompany(slug: string): Promise<Company> {
    return (await fetchApi(C.BY_SLUG(enc(slug)))).data;
}

// ---- Members ----

export async function reportJob(id: string, input: { reason: JobReportReason; details?: string }): Promise<void> {
    const details = input.details?.trim();
    await send(J.REPORT(enc(id)), 'POST', { reason: input.reason, ...(details ? { details } : {}) });
}

/** Save and unsave are bookmarks of the type `job` */
export async function saveJob(id: string): Promise<void> {
    await send(API_ENDPOINTS.BOOKMARKS.BASE, 'POST', { contentType: 'job', contentId: id });
}

export async function unsaveJob(id: string): Promise<void> {
    await send(`${API_ENDPOINTS.BOOKMARKS.BASE}/job/${enc(id)}`, 'DELETE');
}

export function listSavedJobs(params: { page?: number; limit?: number } = {}): Promise<JobsPage<JobCard>> {
    return fetchApi(`${J.SAVED}${query(params)}`);
}

// ---- Posters ----

export function listMyJobs(params: { status?: JobStatus; page?: number; limit?: number } = {}): Promise<JobsPage<EmployerJob>> {
    return fetchApi(`${J.MINE}${query(params)}`);
}

export async function getMyStats(): Promise<MineStats> {
    return (await fetchApi(J.MINE_STATS)).data;
}

export async function createJob(body: JobPayload): Promise<Job> {
    return (await send(J.BASE, 'POST', body)).data;
}

export async function updateJob(id: string, body: JobPayload): Promise<Job> {
    return (await send(J.BY_REF(enc(id)), 'PUT', body)).data;
}

export async function submitJob(id: string): Promise<Job> {
    return (await send(J.SUBMIT(enc(id)), 'POST', {})).data;
}

export async function closeJob(id: string): Promise<Job> {
    return (await send(J.CLOSE(enc(id)), 'POST', {})).data;
}

export async function reopenJob(id: string, expiresAt?: string): Promise<Job> {
    return (await send(J.REOPEN(enc(id)), 'POST', expiresAt ? { expiresAt } : {})).data;
}

export async function deleteJob(id: string): Promise<void> {
    await send(J.BY_REF(enc(id)), 'DELETE');
}

export async function becomeEmployer(body: CompanyPayload): Promise<Company> {
    return (await send(C.BECOME_EMPLOYER, 'POST', body)).data;
}

/** The caller's own company; null before one exists */
export async function getMyCompany(): Promise<Company | null> {
    return (await fetchApi(C.MY_PROFILE)).data ?? null;
}

export async function saveMyCompany(body: CompanyPayload): Promise<Company> {
    return (await send(C.MY_PROFILE, 'POST', body)).data;
}

// ---- Reviewers (moderator, admin, owner) ----

export function listAdminJobs(filters: AdminJobFilters = {}): Promise<JobsPage<Job>> {
    return fetchApi(`${J.ADMIN}${query({ status: filters.status, reported: filters.reported, q: filters.q?.trim(), sort: filters.sort, page: filters.page, limit: filters.limit })}`);
}

export async function getAdminStats(): Promise<AdminStats> {
    return (await fetchApi(J.ADMIN_STATS)).data;
}

export async function approveJob(id: string, note?: string): Promise<Job> {
    const trimmed = note?.trim();
    return (await send(J.ADMIN_APPROVE(enc(id)), 'POST', trimmed ? { note: trimmed } : {})).data;
}

export async function rejectJob(id: string, reason: string): Promise<Job> {
    return (await send(J.ADMIN_REJECT(enc(id)), 'POST', { reason: reason.trim() })).data;
}

/** A decision on a reported job through the shared moderation queue (dismiss, hide, remove or restore) */
export async function reviewReportedJob(id: string, action: ModerationAction, note?: string): Promise<void> {
    const trimmed = note?.trim();
    await send('/api/moderation/items/review', 'POST', { contentType: 'job', contentId: id, action, ...(trimmed ? { note: trimmed } : {}) });
}

export function listAdminCompanies(params: { status?: 'pending' | 'verified' | 'rejected' | 'all'; q?: string; page?: number; limit?: number } = {}): Promise<JobsPage<AdminCompany>> {
    return fetchApi(`${C.ADMIN}${query({ status: params.status, q: params.q?.trim(), page: params.page, limit: params.limit })}`);
}

export async function approveCompany(id: string, note?: string): Promise<Company> {
    const trimmed = note?.trim();
    return (await send(C.ADMIN_APPROVE(enc(id)), 'POST', trimmed ? { note: trimmed } : {})).data;
}

export async function rejectCompany(id: string, reason: string): Promise<Company> {
    return (await send(C.ADMIN_REJECT(enc(id)), 'POST', { reason: reason.trim() })).data;
}
