import {
    useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient, type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ApiError } from '@/lib/api';
import * as api from '@/lib/api/jobs';
import { JOB_LIMITS } from '@/lib/jobs/constants';
import { jobErrorMessage } from '@/lib/jobs/errors';
import { placeholderForViewer } from '@/lib/queryPlaceholder';
import { refreshPublicJobs } from '@/lib/jobs/revalidate';
import type {
    AdminCompany, AdminJobFilters, AdminStats, ApplyDetails, Company, CompanyPayload, EmployerJob, Job, JobCard, JobListFilters,
    JobPayload, JobReportReason, JobsPage, JobStatus, MineStats,
} from '@/types/job';

/**
 * One place for every jobs query key, so a change can invalidate by prefix. Anything that depends on
 * who is asking (the viewer block of a job, the saved ids on the list, the poster's own jobs, the
 * review queue) carries the user id, so one account never reads another's cache after a switch.
 */
export const jobKeys = {
    all: ['jobs'] as const,
    lists: () => ['jobs', 'list'] as const,
    list: (filters: JobListFilters, userId: string | null = null) => ['jobs', 'list', userId, filters] as const,
    details: () => ['jobs', 'detail'] as const,
    detail: (ref: string, userId: string | null = null) => ['jobs', 'detail', ref, userId] as const,
    saved: (userId: string | null = null) => ['jobs', 'saved', userId] as const,
    mine: () => ['jobs', 'mine'] as const,
    myList: (status: JobStatus | '', userId: string | null = null) => ['jobs', 'mine', 'list', userId, status] as const,
    myStats: (userId: string | null = null) => ['jobs', 'mine', 'stats', userId] as const,
    myCompany: (userId: string | null = null) => ['jobs', 'mine', 'company', userId] as const,
    admin: () => ['jobs', 'admin'] as const,
    adminList: (filters: AdminJobFilters, userId: string | null = null) => ['jobs', 'admin', 'list', userId, filters] as const,
    adminStats: (userId: string | null = null) => ['jobs', 'admin', 'stats', userId] as const,
    adminCompanies: (params: object, userId: string | null = null) => ['jobs', 'admin', 'companies', userId, params] as const,
};

export const JOBS_PAGE_SIZE = JOB_LIMITS.pageDefault;
const ADMIN_PAGE_SIZE = 20;

type Pages<T> = InfiniteData<JobsPage<T>, number>;
const nextPage = <T,>(last: JobsPage<T>) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined);
const noMore = (err: unknown) => !(err instanceof ApiError && err.status >= 400 && err.status < 500);

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/**
 * The public list with "load more". `filters.page` is ignored: the pages are the query's own.
 * `initialPage` is the first page rendered on the server for these filters: it counts as fresh for
 * a visitor, and is only a placeholder for a signed-in member (their answer also says what they saved).
 */
export function useJobs(filters: JobListFilters = {}, initialPage?: JobsPage<JobCard> | null, initialUpdatedAt?: number) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    const base: JobListFilters = { limit: JOBS_PAGE_SIZE, ...filters, page: undefined };
    const seed: Pages<JobCard> | undefined = initialPage ? { pages: [initialPage], pageParams: [1] } : undefined;
    return useInfiniteQuery({
        queryKey: jobKeys.list(base, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listJobs({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: nextPage<JobCard>,
        enabled: !loading,
        staleTime: 60_000,
        initialData: !signedIn ? seed : undefined,
        initialDataUpdatedAt: initialUpdatedAt,
        // Another filter shows the previous answer while it loads, but only the same viewer's own
        placeholderData: (previous, previousQuery) => placeholderForViewer<Pages<JobCard>>(user?.id ?? null, 2)(previous, previousQuery) ?? (signedIn ? seed : undefined),
    });
}

/**
 * One job by id or slug. The copy rendered on the server is public, so it differs by who is looking:
 * - A visitor who is not signed in has the same answer, so it counts as fresh from the moment the
 *   page rendered, and nothing is fetched right after hydration.
 * - A signed-in member only gets it as `placeholderData`: shown while the answer with their own
 *   token is on its way (it carries `viewer`, and the status for the poster), and never taken for
 *   the answer itself (`isPlaceholderData` tells them apart).
 */
export function useJob(ref: string, serverJob?: Job | null, initialUpdatedAt?: number, enabled = true) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    return useQuery({
        queryKey: jobKeys.detail(ref, user?.id ?? null),
        queryFn: async () => (await api.getJob(ref)).job,
        enabled: enabled && !!ref && !loading,
        initialData: !signedIn ? (serverJob ?? undefined) : undefined,
        initialDataUpdatedAt: initialUpdatedAt,
        placeholderData: signedIn ? (serverJob ?? undefined) : undefined,
        staleTime: 30_000,
        retry: (count, err) => noMore(err) && count < 2,
    });
}

/**
 * The apply click: counts it and gives back where to apply. The page only opens what this returns.
 * The caller shows the outcome, so there is nothing to cache.
 */
export function useApplyJob() {
    return useMutation<ApplyDetails, unknown, { id: string }>({
        mutationFn: ({ id }) => api.applyToJob(id),
        retry: 0,
    });
}

/** Kept under its old name for the callers that had it */
export const useApplyToJob = useApplyJob;

// ---------------------------------------------------------------------------
// Saved jobs (bookmarks)
// ---------------------------------------------------------------------------

type Snapshot = [QueryKey, unknown][];

/** Mark a job saved or not in every cached copy: the detail, the lists' `viewer.savedIds`, the saved list */
async function patchSaved(qc: QueryClient, jobId: string, saved: boolean): Promise<Snapshot> {
    await qc.cancelQueries({ queryKey: jobKeys.all });
    const snapshot: Snapshot = [
        ...qc.getQueriesData({ queryKey: jobKeys.details() }),
        ...qc.getQueriesData({ queryKey: jobKeys.lists() }),
        ...qc.getQueriesData({ queryKey: ['jobs', 'saved'] }),
    ];

    for (const [key, data] of qc.getQueriesData<Job>({ queryKey: jobKeys.details() })) {
        if (data && data._id === jobId && data.viewer) qc.setQueryData(key, { ...data, viewer: { ...data.viewer, saved } });
    }
    for (const [key, data] of qc.getQueriesData<Pages<JobCard>>({ queryKey: jobKeys.lists() })) {
        if (!data) continue;
        qc.setQueryData<Pages<JobCard>>(key, {
            ...data,
            pages: data.pages.map((page) => {
                if (!page.viewer) return page;
                const ids = page.viewer.savedIds.filter((id) => id !== jobId);
                return { ...page, viewer: { ...page.viewer, savedIds: saved ? [...ids, jobId] : ids } };
            }),
        });
    }
    if (!saved) {
        // Taking a job off the saved list removes its card at once
        for (const [key, data] of qc.getQueriesData<Pages<JobCard>>({ queryKey: ['jobs', 'saved'] })) {
            if (!data) continue;
            qc.setQueryData<Pages<JobCard>>(key, { ...data, pages: data.pages.map((page) => ({ ...page, data: page.data.filter((j) => j._id !== jobId) })) });
        }
    }
    return snapshot;
}

function restore(qc: QueryClient, snapshot: Snapshot | undefined) {
    for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

/** Save or unsave a job. The star changes at once; a failure puts it back and says why. */
export function useSaveJob() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, { id: string; saved: boolean }, { snapshot: Snapshot }>({
        mutationFn: ({ id, saved }) => (saved ? api.saveJob(id) : api.unsaveJob(id)),
        retry: 0,
        onMutate: async ({ id, saved }) => ({ snapshot: await patchSaved(qc, id, saved) }),
        onError: (err, _v, ctx) => {
            restore(qc, ctx?.snapshot);
            addToast({ variant: 'error', message: jobErrorMessage(err, 'Could not update your saved jobs.') });
        },
        onSuccess: (_r, { saved }) => {
            addToast({ variant: 'success', message: saved ? 'Job saved.' : 'Removed from your saved jobs.' });
            void qc.invalidateQueries({ queryKey: ['jobs', 'saved'] });
        },
    });
}

export function useSavedJobs() {
    const { user } = useAuth();
    return useInfiniteQuery({
        queryKey: jobKeys.saved(user?.id ?? null),
        queryFn: ({ pageParam }) => api.listSavedJobs({ page: pageParam, limit: JOBS_PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: nextPage<JobCard>,
        enabled: !!user,
        staleTime: 30_000,
    });
}

/** The dialog shows the error itself, so a failed report keeps what the member typed */
export function useReportJob() {
    const { addToast } = useToast();
    return useMutation<void, unknown, { id: string; reason: JobReportReason; details?: string }>({
        mutationFn: ({ id, reason, details }) => api.reportJob(id, { reason, details }),
        retry: 0,
        onSuccess: () => addToast({ variant: 'success', title: 'Report sent', message: 'Thank you. A moderator will take a look.' }),
    });
}

// ---------------------------------------------------------------------------
// The poster's own jobs
// ---------------------------------------------------------------------------

/** The poster's own jobs by status, with "load more" (the old `/api/jobs/employer` URL is not used) */
export function useEmployerJobs(status: JobStatus | '' = '', enabled = true) {
    const { user } = useAuth();
    return useInfiniteQuery({
        queryKey: jobKeys.myList(status, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listMyJobs({ status: status || undefined, page: pageParam, limit: JOBS_PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: nextPage<EmployerJob>,
        enabled: enabled && !!user,
        staleTime: 15_000,
    });
}

export function useMyJobStats(enabled = true) {
    const { user } = useAuth();
    return useQuery<MineStats>({
        queryKey: jobKeys.myStats(user?.id ?? null),
        queryFn: api.getMyStats,
        enabled: enabled && !!user,
        staleTime: 15_000,
    });
}

/** After a job changed state, everything that shows it is read again */
function refreshJobs(qc: QueryClient) {
    void qc.invalidateQueries({ queryKey: jobKeys.mine() });
    void qc.invalidateQueries({ queryKey: jobKeys.details() });
    void qc.invalidateQueries({ queryKey: jobKeys.lists() });
    void qc.invalidateQueries({ queryKey: ['jobs', 'saved'] });
    void qc.invalidateQueries({ queryKey: jobKeys.admin() });
}

/** Post a job. The form shows the error itself. */
export function useCreateJob() {
    const qc = useQueryClient();
    return useMutation<Job, unknown, JobPayload>({
        mutationFn: (payload) => api.createJob(payload),
        retry: 0,
        onSuccess: () => refreshJobs(qc),
    });
}

export function useUpdateJob() {
    const qc = useQueryClient();
    return useMutation<Job, unknown, { id: string; payload: JobPayload }>({
        mutationFn: ({ id, payload }) => api.updateJob(id, payload),
        retry: 0,
        onSuccess: () => refreshJobs(qc),
    });
}

/** Save the edits of a job, then send it for review: one action for the form, two calls for the API */
export function useSaveAndSubmitJob() {
    const qc = useQueryClient();
    return useMutation<Job, unknown, { id: string; payload: JobPayload }>({
        mutationFn: async ({ id, payload }) => {
            await api.updateJob(id, payload);
            return api.submitJob(id);
        },
        retry: 0,
        // A failed submit still saved the edits
        onSettled: () => refreshJobs(qc),
    });
}

type Action = 'submit' | 'close' | 'reopen' | 'delete';
const DONE: Record<Action, string> = {
    submit: 'Sent for review.',
    close: 'Job closed.',
    reopen: 'Job reopened.',
    delete: 'Job deleted.',
};

/** Submit, close, reopen or delete a job from the dashboard: a toast says how it went */
export function useJobAction() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Job | void, unknown, { action: Action; id: string; expiresAt?: string }>({
        mutationFn: ({ action, id, expiresAt }) => {
            if (action === 'submit') return api.submitJob(id);
            if (action === 'close') return api.closeJob(id);
            if (action === 'reopen') return api.reopenJob(id, expiresAt);
            return api.deleteJob(id);
        },
        retry: 0,
        onSuccess: (result, { action }) => {
            const status = result && typeof result === 'object' ? (result as Job).status : undefined;
            const message = action === 'submit' || action === 'reopen'
                ? (status === 'approved' ? 'Your job is live.' : status === 'pending' ? 'Sent for review. You will be told when a reviewer decides.' : DONE[action])
                : DONE[action];
            addToast({ variant: 'success', message });
        },
        // A conflict means the job moved on (a reviewer decided just now): show what it is now
        onError: (err) => addToast({ variant: 'error', message: jobErrorMessage(err) }),
        onSettled: () => refreshJobs(qc),
    });
}

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

/** The caller's own company; `null` data means they have none yet */
export function useMyCompany(enabled = true) {
    const { user } = useAuth();
    return useQuery<Company | null>({
        queryKey: jobKeys.myCompany(user?.id ?? null),
        queryFn: api.getMyCompany,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

export function useSaveMyCompany() {
    const qc = useQueryClient();
    return useMutation<Company, unknown, CompanyPayload>({
        mutationFn: (payload) => api.saveMyCompany(payload),
        retry: 0,
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['jobs', 'mine', 'company'] });
            void qc.invalidateQueries({ queryKey: jobKeys.lists() });
            void qc.invalidateQueries({ queryKey: jobKeys.details() });
        },
    });
}

export function useBecomeEmployer() {
    const qc = useQueryClient();
    return useMutation<Company, unknown, CompanyPayload>({
        mutationFn: (payload) => api.becomeEmployer(payload),
        retry: 0,
        onSuccess: () => void qc.invalidateQueries({ queryKey: jobKeys.mine() }),
    });
}

// ---------------------------------------------------------------------------
// Review (moderator, admin, owner)
// ---------------------------------------------------------------------------

export function useAdminJobs(filters: AdminJobFilters = {}, enabled = true) {
    const { user } = useAuth();
    const base = { ...filters, limit: ADMIN_PAGE_SIZE };
    return useQuery<JobsPage<Job>>({
        queryKey: jobKeys.adminList(base, user?.id ?? null),
        queryFn: () => api.listAdminJobs(base),
        enabled: enabled && !!user,
        placeholderData: placeholderForViewer<JobsPage<Job>>(user?.id ?? null, 3),
        staleTime: 10_000,
    });
}

export function useAdminStats(enabled = true) {
    const { user } = useAuth();
    return useQuery<AdminStats>({
        queryKey: jobKeys.adminStats(user?.id ?? null),
        queryFn: api.getAdminStats,
        enabled: enabled && !!user,
        staleTime: 10_000,
    });
}

export function useAdminCompanies(params: { status?: 'pending' | 'verified' | 'rejected' | 'all'; q?: string; page?: number } = {}, enabled = true) {
    const { user } = useAuth();
    const base = { ...params, limit: ADMIN_PAGE_SIZE };
    return useQuery<JobsPage<AdminCompany>>({
        queryKey: jobKeys.adminCompanies(base, user?.id ?? null),
        queryFn: () => api.listAdminCompanies(base),
        enabled: enabled && !!user,
        placeholderData: placeholderForViewer<JobsPage<AdminCompany>>(user?.id ?? null, 3),
        staleTime: 10_000,
    });
}

/** After a decision: the queue, the counters, the public lists and the cached public pages are read again */
function refreshAfterDecision(qc: QueryClient) {
    void qc.invalidateQueries({ queryKey: jobKeys.admin() });
    void qc.invalidateQueries({ queryKey: jobKeys.lists() });
    void qc.invalidateQueries({ queryKey: jobKeys.details() });
    void qc.invalidateQueries({ queryKey: jobKeys.mine() });
    void refreshPublicJobs();
}

export function useApproveJob() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Job, unknown, { id: string; title?: string; note?: string }>({
        mutationFn: ({ id, note }) => api.approveJob(id, note),
        retry: 0,
        onSuccess: (_job, v) => addToast({ variant: 'success', message: v.title ? `Approved: ${v.title}` : 'Job approved.' }),
        onError: (err) => addToast({ variant: 'error', message: jobErrorMessage(err) }),
        onSettled: () => refreshAfterDecision(qc),
    });
}

/** The dialog that asked for the reason shows the error itself */
export function useRejectJob() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Job, unknown, { id: string; reason: string; title?: string }>({
        mutationFn: ({ id, reason }) => api.rejectJob(id, reason),
        retry: 0,
        onSuccess: (_job, v) => addToast({ variant: 'success', message: v.title ? `Rejected: ${v.title}` : 'Job rejected.' }),
        onSettled: () => refreshAfterDecision(qc),
    });
}

/** Close the open reports of a job that is still public, keeping it up */
export function useDismissReports() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, { id: string; title?: string }>({
        mutationFn: ({ id }) => api.reviewReportedJob(id, 'dismiss'),
        retry: 0,
        onSuccess: (_r, v) => addToast({ variant: 'success', message: v.title ? `Reports dismissed: ${v.title}` : 'Reports dismissed.' }),
        onError: (err) => addToast({ variant: 'error', message: jobErrorMessage(err) }),
        onSettled: () => refreshAfterDecision(qc),
    });
}

export interface BulkOutcome { id: string; title: string; ok: boolean; message?: string }

/**
 * Approve several jobs, one request after another. Each job has its own outcome: one that someone
 * else already decided, or that fails, does not stop the rest, and nothing is retried.
 */
export function useBulkApprove() {
    const qc = useQueryClient();
    return useMutation<BulkOutcome[], unknown, { items: { id: string; title: string }[] }>({
        mutationFn: async ({ items }) => {
            const out: BulkOutcome[] = [];
            for (const item of items) {
                try {
                    await api.approveJob(item.id);
                    out.push({ ...item, ok: true });
                } catch (err) {
                    out.push({ ...item, ok: false, message: jobErrorMessage(err) });
                }
            }
            return out;
        },
        retry: 0,
        onSettled: () => refreshAfterDecision(qc),
    });
}

export function useApproveCompany() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Company, unknown, { id: string; name?: string }>({
        mutationFn: ({ id }) => api.approveCompany(id),
        retry: 0,
        onSuccess: (_c, v) => addToast({ variant: 'success', message: v.name ? `Verified: ${v.name}. Its jobs now publish without review.` : 'Company verified.' }),
        onError: (err) => addToast({ variant: 'error', message: jobErrorMessage(err) }),
        onSettled: () => refreshAfterDecision(qc),
    });
}

export function useRejectCompany() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Company, unknown, { id: string; reason: string; name?: string }>({
        mutationFn: ({ id, reason }) => api.rejectCompany(id, reason),
        retry: 0,
        onSuccess: (_c, v) => addToast({ variant: 'success', message: v.name ? `Rejected: ${v.name}. Its public jobs went back to the queue.` : 'Company rejected.' }),
        onSettled: () => refreshAfterDecision(qc),
    });
}
