import {
    keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api/internships';
import { internshipErrorMessage } from '@/lib/internships/errors';
import type {
    ApplicationStatus, ApplyPayload, CohortCard, CohortDetail, CohortFilters, CohortPayload, CohortStatus, MyApplication, Page,
    StaffApplication,
} from '@/types/internship';

/**
 * One place for every internships query key, so a change can invalidate by prefix. Data that
 * depends on who is asking (the viewer block of a cohort, my applications, anything staff-only)
 * carries the user id, so one account never reads another's cache after a switch.
 */
export const internshipKeys = {
    all: ['internships'] as const,
    /** The public list: staff get extra fields on the same cards, so the viewer is in the key */
    lists: () => ['internships', 'list'] as const,
    list: (filters: CohortFilters, userId: string | null = null) => ['internships', 'list', filters, userId] as const,
    /** Public data, the same for everyone */
    past: (params: object = {}) => ['internships', 'past', params] as const,
    details: () => ['internships', 'detail'] as const,
    detail: (id: string, userId: string | null = null) => ['internships', 'detail', id, userId] as const,
    mine: () => ['internships', 'mine'] as const,
    myApplications: (params: object, userId: string | null = null) => ['internships', 'mine', userId, params] as const,
    admin: () => ['internships', 'admin'] as const,
    adminList: (params: object, userId: string | null = null) => ['internships', 'admin', 'list', userId, params] as const,
    cohortApplications: (id: string, params: object, userId: string | null = null) => ['internships', 'admin', 'applications', id, userId, params] as const,
    cohortApplicationsOf: (id: string) => ['internships', 'admin', 'applications', id] as const,
    application: (id: string, userId: string | null = null) => ['internships', 'admin', 'application', id, userId] as const,
};

const PAGE_SIZE = 12;
const ADMIN_PAGE_SIZE = 20;

type Pages<T> = InfiniteData<Page<T>, number>;
const nextPage = <T,>(last: Page<T>) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The public list with "load more". `filters.page` is ignored: the pages are the query's own. */
export function useInternships(filters: CohortFilters = {}) {
    const { user, loading } = useAuth();
    const base: CohortFilters = { limit: PAGE_SIZE, ...filters, page: undefined };
    return useInfiniteQuery({
        queryKey: internshipKeys.list(base, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listCohorts({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: nextPage<CohortCard>,
        // Staff get more on each card, so wait until the session is known
        enabled: !loading,
        staleTime: 60_000,
    });
}

/** Completed cohorts with their showcase, newest first */
export function usePastInternships(limit = 6) {
    return useInfiniteQuery({
        queryKey: internshipKeys.past({ limit }),
        queryFn: ({ pageParam }) => api.listPastCohorts({ page: pageParam, limit }),
        initialPageParam: 1,
        getNextPageParam: nextPage,
        staleTime: 5 * 60_000,
    });
}

/**
 * One cohort with the viewer block. The copy rendered on the server has no viewer, so it differs
 * by who is looking:
 * - A visitor who is not signed in has the same answer, so it counts as fresh from the moment the
 *   page rendered, and nothing is fetched right after hydration.
 * - A signed-in member only gets it as `placeholderData`: shown while the answer with their own
 *   token is on its way, and never taken for the answer itself (`isPlaceholderData` tells them apart).
 */
export function useInternship(id: string, serverCohort?: CohortDetail | null) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    return useQuery({
        queryKey: internshipKeys.detail(id, user?.id ?? null),
        queryFn: () => api.getCohort(id),
        enabled: !!id && !loading,
        initialData: !signedIn ? (serverCohort ?? undefined) : undefined,
        placeholderData: signedIn ? (serverCohort ?? undefined) : undefined,
        staleTime: 30_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

export function useMyApplications(params: { status?: ApplicationStatus } = {}, enabled = true) {
    const { user } = useAuth();
    return useInfiniteQuery({
        queryKey: internshipKeys.myApplications(params, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listMyApplications({ ...params, page: pageParam, limit: PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: nextPage<MyApplication>,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

/** Staff: every cohort (drafts and switched-off ones too) with its counters */
export function useAdminInternships(params: { page?: number; status?: CohortStatus | '' } = {}, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: internshipKeys.adminList(params, user?.id ?? null),
        queryFn: () => api.listAdminCohorts({ page: params.page, status: params.status, limit: ADMIN_PAGE_SIZE }),
        enabled: enabled && !!user,
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Staff: one cohort's applications, one page at a time, optionally one status */
export function useCohortApplications(id: string, params: { status?: ApplicationStatus; page?: number } = {}, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: internshipKeys.cohortApplications(id, params, user?.id ?? null),
        queryFn: () => api.listCohortApplications(id, { ...params, limit: ADMIN_PAGE_SIZE }),
        enabled: enabled && !!id && !!user,
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Staff: one application in full */
export function useStaffApplication(id: string | null, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: internshipKeys.application(id ?? '', user?.id ?? null),
        queryFn: () => api.getStaffApplication(id as string),
        enabled: enabled && !!id && !!user,
        staleTime: 15_000,
    });
}

// ---------------------------------------------------------------------------
// Writes. Forms show their own errors, so these only keep the caches right.
// ---------------------------------------------------------------------------

/** After an application is sent, withdrawn or reviewed, the cohort's seats and counters change too */
function refreshCohort(qc: QueryClient, cohortId?: string | null) {
    void qc.invalidateQueries({ queryKey: internshipKeys.lists() });
    void qc.invalidateQueries({ queryKey: cohortId ? [...internshipKeys.details(), cohortId] : internshipKeys.details() });
    void qc.invalidateQueries({ queryKey: internshipKeys.admin() });
}

export function useApplyInternship() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: (v: { id: string; payload: ApplyPayload }) => api.applyToCohort(v.id, v.payload),
        retry: 0,
        onSuccess: (application, v) => {
            // Show "applied" at once on the cohort page; the refetch below confirms it
            qc.setQueryData<CohortDetail>(internshipKeys.detail(v.id, user?.id ?? null), (old) => old && {
                ...old,
                viewer: { canApply: false, userApplication: { _id: application._id, status: application.status, appliedAt: application.appliedAt, updatedAt: application.updatedAt } },
            });
            void qc.invalidateQueries({ queryKey: internshipKeys.mine() });
            refreshCohort(qc, v.id);
        },
    });
}

/** Replace one application in every cached "my applications" page */
function patchMine(qc: QueryClient, updated: MyApplication) {
    for (const [key, data] of qc.getQueriesData<Pages<MyApplication>>({ queryKey: internshipKeys.mine() })) {
        if (!data?.pages) continue;
        qc.setQueryData<Pages<MyApplication>>(key, {
            ...data,
            pages: data.pages.map((p) => ({ ...p, data: p.data.map((a) => (a._id === updated._id ? { ...a, ...updated, cohort: a.cohort } : a)) })),
        });
    }
}

export function useWithdrawApplication() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation({
        mutationFn: (v: { id: string; cohortId?: string; reason?: string }) => api.withdrawApplication(v.id, v.reason),
        retry: 0,
        onSuccess: (updated, v) => {
            patchMine(qc, updated);
            addToast({ variant: 'success', message: 'Your application was withdrawn.' });
            void qc.invalidateQueries({ queryKey: internshipKeys.mine() });
            refreshCohort(qc, v.cohortId);
        },
        onError: (err) => {
            addToast({ variant: 'error', message: internshipErrorMessage(err) });
            // The state may have changed under the page (rejected meanwhile): show the truth
            void qc.invalidateQueries({ queryKey: internshipKeys.mine() });
        },
    });
}

export function useCreateCohort() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: CohortPayload) => api.createCohort(payload),
        retry: 0,
        onSuccess: () => void qc.invalidateQueries({ queryKey: internshipKeys.all }),
    });
}

export function useUpdateCohort() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { id: string; payload: CohortPayload }) => api.updateCohort(v.id, v.payload),
        retry: 0,
        onSuccess: () => void qc.invalidateQueries({ queryKey: internshipKeys.all }),
    });
}

/** Close a cohort early: applications stop at once */
export function useCloseCohort() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation({
        mutationFn: (v: { id: string }) => api.updateCohort(v.id, { status: 'closed' }),
        retry: 0,
        onSuccess: () => {
            addToast({ variant: 'success', message: 'Applications are closed for this program.' });
            void qc.invalidateQueries({ queryKey: internshipKeys.all });
        },
        onError: (err) => addToast({ variant: 'error', message: internshipErrorMessage(err) }),
    });
}

export function useChangeApplicationStatus() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: (v: { id: string; cohortId?: string; status: ApplicationStatus; note?: string }) => api.changeApplicationStatus(v.id, { status: v.status, note: v.note }),
        retry: 0,
        onSuccess: (updated: StaffApplication, v) => {
            qc.setQueryData(internshipKeys.application(v.id, user?.id ?? null), updated);
            void qc.invalidateQueries({ queryKey: v.cohortId ? internshipKeys.cohortApplicationsOf(v.cohortId) : [...internshipKeys.admin(), 'applications'] });
            // An acceptance takes a seat: the cohort's counters and the public spots change
            refreshCohort(qc, v.cohortId);
        },
        onError: (_err, v) => {
            // Another reviewer may have moved it first: reload what the screen shows
            void qc.invalidateQueries({ queryKey: internshipKeys.application(v.id, user?.id ?? null) });
            void qc.invalidateQueries({ queryKey: v.cohortId ? internshipKeys.cohortApplicationsOf(v.cohortId) : [...internshipKeys.admin(), 'applications'] });
        },
    });
}
