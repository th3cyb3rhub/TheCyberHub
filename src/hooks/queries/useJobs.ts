import {
    useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient, type QueryKey,
} from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ApiError } from '@/lib/api';
import * as api from '@/lib/api/jobs';
import { JOB_LIMITS } from '@/lib/jobs/constants';
import { isSelfReview, isStaleJobState, jobErrorMessage, staleCurrent } from '@/lib/jobs/errors';
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

/** Sorts the database sorts in memory: the API answers 400 for a page past `memorySortMaxPage`, so the list stops there */
export const isMemorySort = (sortBy?: string): boolean => sortBy === 'viewCount' || sortBy === 'title' || sortBy === 'salary.max';
const reachedSortCap = (filters: JobListFilters, last: JobsPage<unknown>) =>
    isMemorySort(filters.sortBy) && last.pagination.hasMore && last.pagination.page >= JOB_LIMITS.memorySortMaxPage;
/** Whether the list ends at the page cap of its sort while the API still has more (the page says so) */
export const hitSortCap = (filters: JobListFilters, pages: JobsPage<unknown>[] | undefined): boolean => {
    const last = pages?.[pages.length - 1];
    return !!last && reachedSortCap(filters, last);
};
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
        getNextPageParam: (last) => (reachedSortCap(base, last) ? undefined : nextPage<JobCard>(last)),
        enabled: !loading,
        staleTime: 60_000,
        initialData: !signedIn ? seed : undefined,
        initialDataUpdatedAt: initialUpdatedAt,
        // Another filter shows the previous answer while it loads, but only the same viewer's own
        placeholderData: (previous, previousQuery) => placeholderForViewer<Pages<JobCard>>(user?.id ?? null, 2)(previous, previousQuery) ?? (signedIn ? seed : undefined),
    });
}

/**
 * One job by id or slug. The copy rendered on the server is public, so it only stands in while the
 * browser asks for the real one:
 * - The server's own read counts at most one view per minute per address, so views are counted here,
 *   from the browser: once per page mount, for this viewer (a member with their token, which also says
 *   whether they saved the job and own it). The answer is read from the API each time, never from a cache.
 * - `staleTime: Infinity` and no refetch on focus or reconnect keep it to that one read, so React strict
 *   mode and a returning tab do not count twice; `gcTime: 0` drops it with the page, so the next visit counts.
 * - The server copy is only ever `placeholderData` (`isPlaceholderData` tells it from the answer).
 * The edit screen reads the job without a server copy and keeps the usual refetching: it uses a changed
 * `updatedAt` to tell the poster the job moved on.
 */
export function useJob(ref: string, serverJob?: Job | null, initialUpdatedAt?: number, enabled = true, options: { pageView?: boolean } = {}) {
    const { user, loading } = useAuth();
    const pageView = options.pageView ?? serverJob !== undefined;
    void initialUpdatedAt;
    return useQuery({
        queryKey: jobKeys.detail(ref, user?.id ?? null),
        queryFn: async () => (await api.getJob(ref)).job,
        enabled: enabled && !!ref && !loading,
        placeholderData: serverJob ?? undefined,
        ...(pageView
            ? { staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false }
            : { staleTime: 30_000 }),
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

/**
 * Mark a job saved or not in every cached copy: the detail, the lists' `viewer.savedIds`, the saved list.
 * Only the queries that are about to change are cancelled (a read in flight would overwrite the patch),
 * never the whole jobs cache.
 */
async function patchSaved(qc: QueryClient, jobId: string, saved: boolean): Promise<Snapshot> {
    const details = qc.getQueriesData<Job>({ queryKey: jobKeys.details() }).filter(([, data]) => data && data._id === jobId && data.viewer);
    const lists = qc.getQueriesData<Pages<JobCard>>({ queryKey: jobKeys.lists() }).filter(([, data]) => !!data);
    const savedLists = qc.getQueriesData<Pages<JobCard>>({ queryKey: ['jobs', 'saved'] }).filter(([, data]) => !!data);
    await Promise.all([...details, ...lists, ...savedLists].map(([key]) => qc.cancelQueries({ queryKey: key, exact: true })));
    const snapshot: Snapshot = [...details, ...lists, ...savedLists];

    for (const [key, data] of details) {
        if (data?.viewer) qc.setQueryData(key, { ...data, viewer: { ...data.viewer, saved } });
    }
    for (const [key, data] of lists) {
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
        for (const [key, data] of savedLists) {
            if (data) qc.setQueryData<Pages<JobCard>>(key, { ...data, pages: data.pages.map((page) => ({ ...page, data: page.data.filter((j) => j._id !== jobId) })) });
        }
    }
    return snapshot;
}

function restore(qc: QueryClient, snapshot: Snapshot | undefined) {
    for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

/**
 * Save or unsave a job. The star changes at once; a failure puts it back and says why. A save that
 * answers 409 means the job is already saved, and an unsave that answers 404 means it is already off
 * the list: both are what the member asked for, so neither is an error.
 */
export function useSaveJob() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, { id: string; saved: boolean }, { snapshot: Snapshot }>({
        mutationFn: async ({ id, saved }) => {
            try {
                await (saved ? api.saveJob(id) : api.unsaveJob(id));
            } catch (err) {
                if (err instanceof ApiError && ((saved && err.status === 409) || (!saved && err.status === 404))) return;
                throw err;
            }
        },
        retry: 0,
        onMutate: async ({ id, saved }) => ({ snapshot: await patchSaved(qc, id, saved) }),
        onError: (err, _v, ctx) => {
            restore(qc, ctx?.snapshot);
            addToast({ variant: 'error', message: jobErrorMessage(err, 'Could not update your saved jobs.') });
        },
        onSuccess: (_r, { saved }) => addToast({ variant: 'success', message: saved ? 'Job saved.' : 'Removed from your saved jobs.' }),
        // Whatever happened, the next read is the server's word on it
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: jobKeys.details() });
            void qc.invalidateQueries({ queryKey: jobKeys.lists() });
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

/**
 * A rejected company asks for a new review. The button that asked shows the error itself (it can say
 * when the next ask is allowed), so a failure is not toasted here.
 */
export function useResubmitCompany() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Company, unknown, void>({
        mutationFn: () => api.resubmitMyCompany(),
        retry: 0,
        onSuccess: () => addToast({ variant: 'success', message: 'Sent for a new review. You will be told when a reviewer decides.' }),
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: ['jobs', 'mine', 'company'] });
            void qc.invalidateQueries({ queryKey: jobKeys.admin() });
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

/**
 * A decision that was refused because the row had changed (or someone else decided first): the answer
 * carries the current copy, and the row on screen is replaced with it at once. Without one, the lists
 * are read again (`refreshAfterDecision` does that after every decision).
 */
function showCurrent(qc: QueryClient, err: unknown) {
    if (!isStaleJobState(err)) return;
    const current = staleCurrent<{ _id?: string }>(err);
    if (!current?._id) return;
    const patch = <T extends { _id: string }>(page: JobsPage<T>): JobsPage<T> => ({
        ...page, data: page.data.map((row) => (row._id === current._id ? { ...row, ...(current as object) } : row)),
    });
    qc.setQueriesData<JobsPage<Job>>({ queryKey: ['jobs', 'admin', 'list'] }, (old) => (old ? patch(old) : old));
    qc.setQueriesData<JobsPage<AdminCompany>>({ queryKey: ['jobs', 'admin', 'companies'] }, (old) => (old ? patch(old) : old));
}

/** The toast for a refused decision: a refusal for owning the row, a changed row or anything else */
function decisionFailed(qc: QueryClient, addToast: ReturnType<typeof useToast>['addToast'], err: unknown) {
    showCurrent(qc, err);
    addToast({ variant: isSelfReview(err) ? 'info' : 'error', message: jobErrorMessage(err) });
}

/** What a decision sends with the id: `updatedAt` is the one the row showed when the reviewer opened it */
interface DecideInput { id: string; title?: string; note?: string; updatedAt?: string }

export function useApproveJob() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Job, unknown, DecideInput>({
        mutationFn: ({ id, note, updatedAt }) => api.approveJob(id, { note, updatedAt }),
        retry: 0,
        onSuccess: (_job, v) => addToast({ variant: 'success', message: v.title ? `Approved: ${v.title}` : 'Job approved.' }),
        onError: (err) => decisionFailed(qc, addToast, err),
        onSettled: () => refreshAfterDecision(qc),
    });
}

/** The dialog that asked for the reason shows the error itself */
export function useRejectJob() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Job, unknown, { id: string; reason: string; title?: string; updatedAt?: string }>({
        mutationFn: ({ id, reason, updatedAt }) => api.rejectJob(id, reason, { updatedAt }),
        retry: 0,
        onSuccess: (_job, v) => addToast({ variant: 'success', message: v.title ? `Rejected: ${v.title}` : 'Job rejected.' }),
        // The dialog shows the error itself; a changed row is still replaced with its current copy
        onError: (err) => showCurrent(qc, err),
        onSettled: () => refreshAfterDecision(qc),
    });
}

/**
 * An administrator or owner takes a job down from the review screen. The optional reason goes into the
 * notice to the poster, and the job is locked (the poster can only send it back to review). The dialog
 * that asked for the reason shows the error itself.
 */
export function useCloseJob() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Job, unknown, { id: string; reason?: string; title?: string }>({
        mutationFn: ({ id, reason }) => api.closeJob(id, reason),
        retry: 0,
        onSuccess: (_job, v) => addToast({ variant: 'success', message: v.title ? `Closed: ${v.title}. The poster was told.` : 'Job closed. The poster was told.' }),
        onError: (err) => showCurrent(qc, err),
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
    return useMutation<BulkOutcome[], unknown, { items: { id: string; title: string; updatedAt?: string }[] }>({
        mutationFn: async ({ items }) => {
            const out: BulkOutcome[] = [];
            for (const item of items) {
                try {
                    // Each job is decided against the `updatedAt` its row showed
                    await api.approveJob(item.id, { updatedAt: item.updatedAt });
                    out.push({ id: item.id, title: item.title, ok: true });
                } catch (err) {
                    showCurrent(qc, err);
                    out.push({ id: item.id, title: item.title, ok: false, message: jobErrorMessage(err) });
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
    return useMutation<Company, unknown, { id: string; name?: string; updatedAt?: string }>({
        mutationFn: ({ id, updatedAt }) => api.approveCompany(id, { updatedAt }),
        retry: 0,
        onSuccess: (_c, v) => addToast({ variant: 'success', message: v.name ? `Verified: ${v.name}. Its jobs now publish without review.` : 'Company verified.' }),
        onError: (err) => decisionFailed(qc, addToast, err),
        onSettled: () => refreshAfterDecision(qc),
    });
}

export function useRejectCompany() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<Company, unknown, { id: string; reason: string; name?: string; updatedAt?: string }>({
        mutationFn: ({ id, reason, updatedAt }) => api.rejectCompany(id, reason, { updatedAt }),
        retry: 0,
        onSuccess: (_c, v) => addToast({ variant: 'success', message: v.name ? `Rejected: ${v.name}. Its public jobs went back to the queue.` : 'Company rejected.' }),
        onError: (err) => showCurrent(qc, err),
        onSettled: () => refreshAfterDecision(qc),
    });
}
