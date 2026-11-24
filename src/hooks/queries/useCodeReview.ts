import {
    keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import * as api from '@/lib/api/codeReview';
import { ApiError } from '@/lib/api';
import { isStaleState } from '@/lib/codeReview/errors';
import { refreshPublicCodeReview } from '@/lib/codeReview/revalidate';
import type {
    CrAdminSnippet, CrAttemptResult, CrAttemptRow, CrCard, CrDetail, CrFilters, CrHintResult, CrManageCard, CrManageFilters, CrMark,
    CrMyProgress, CrPage, CrSnippetPayload, CrSolution, CrStats, CrViewer,
} from '@/types/codeReview';

/**
 * One place for every code review query key, so a change can invalidate by prefix. Anything that
 * depends on who is asking (`progress` on the cards, the viewer block of an exercise, my progress
 * and totals, the staff views and their answer key) carries the user id, so one account never
 * reads another's cache after a switch.
 */
export const crKeys = {
    all: ['code-review'] as const,
    lists: () => ['code-review', 'list'] as const,
    list: (filters: CrFilters, userId: string | null = null) => ['code-review', 'list', filters, userId] as const,
    stats: (userId: string | null = null) => ['code-review', 'stats', userId] as const,
    details: () => ['code-review', 'detail'] as const,
    detail: (ref: string, userId: string | null = null) => ['code-review', 'detail', ref, userId] as const,
    attempts: (ref: string, userId: string | null = null) => ['code-review', 'attempts', ref, userId] as const,
    solution: (ref: string, userId: string | null = null) => ['code-review', 'solution', ref, userId] as const,
    progress: (userId: string | null = null) => ['code-review', 'progress', userId] as const,
    admin: () => ['code-review', 'admin'] as const,
    adminList: (params: object, userId: string | null = null) => ['code-review', 'admin', 'list', userId, params] as const,
    adminSnippet: (ref: string, userId: string | null = null) => ['code-review', 'admin', 'snippet', ref, userId] as const,
};

export const CR_PAGE_SIZE = 12;
const ADMIN_PAGE_SIZE = 20;

type Pages<T> = InfiniteData<CrPage<T>, number>;
const nextPage = <T,>(last: CrPage<T>) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The list with "load more". `filters.page` is ignored: the pages are the query's own.
 * `initialPage` is the first page rendered on the server, for the plain list only: it counts as
 * fresh for a visitor, and is only a placeholder for a member, whose cards also carry `progress`.
 */
export function useCodeSnippets(filters: CrFilters = {}, initialPage?: CrPage<CrCard> | null, initialUpdatedAt?: number) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    const base: CrFilters = { limit: CR_PAGE_SIZE, ...filters, page: undefined };
    const seed: Pages<CrCard> | undefined = initialPage ? { pages: [initialPage], pageParams: [1] } : undefined;
    return useInfiniteQuery({
        queryKey: crKeys.list(base, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listSnippets({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: nextPage<CrCard>,
        // The cards of a member carry their own progress: wait until the session is known
        enabled: !loading,
        staleTime: 5 * 60_000,
        initialData: !signedIn ? seed : undefined,
        initialDataUpdatedAt: initialUpdatedAt,
        // Keep the old list on screen while a new filter loads; the server copy is the first placeholder for a member
        placeholderData: (previous) => previous ?? (signedIn ? seed : undefined),
    });
}

/** Totals, the counts for the filters and (signed in) the member's own numbers */
export function useCodeReviewStats(initial?: CrStats | null, initialUpdatedAt?: number) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    return useQuery({
        queryKey: crKeys.stats(user?.id ?? null),
        queryFn: api.getStats,
        enabled: !loading,
        initialData: !signedIn ? (initial ?? undefined) : undefined,
        initialDataUpdatedAt: initialUpdatedAt,
        placeholderData: signedIn ? (initial ?? undefined) : undefined,
        staleTime: 5 * 60_000,
    });
}

/**
 * One exercise with the viewer block. The copy rendered on the server has no viewer:
 * - for a visitor it is the same answer, so it counts as fresh from the moment the page rendered;
 * - for a signed-in member it is only `placeholderData`, shown while the answer with their own
 *   token is on its way and never taken for the answer itself (`isPlaceholderData` tells them apart).
 */
export function useCodeSnippet(ref: string, serverSnippet?: CrDetail | null, initialUpdatedAt?: number) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    return useQuery({
        queryKey: crKeys.detail(ref, user?.id ?? null),
        queryFn: () => api.getSnippet(ref),
        enabled: !!ref && !loading,
        initialData: !signedIn ? (serverSnippet ?? undefined) : undefined,
        initialDataUpdatedAt: initialUpdatedAt,
        placeholderData: signedIn ? (serverSnippet ?? undefined) : undefined,
        staleTime: 30_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

/** My own last attempts on one exercise */
export function useAttempts(ref: string, enabled = true) {
    const { user } = useAuth();
    return useQuery<CrAttemptRow[]>({
        queryKey: crKeys.attempts(ref, user?.id ?? null),
        queryFn: () => api.listAttempts(ref),
        enabled: enabled && !!ref && !!user,
        staleTime: 15_000,
    });
}

/** My progress on every exercise I touched, with the summary */
export function useMyCodeReviewProgress(enabled = true) {
    const { user } = useAuth();
    return useQuery<CrMyProgress>({
        queryKey: crKeys.progress(user?.id ?? null),
        queryFn: api.getMyProgress,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

/**
 * The solution. Opening it is recorded by the API, so this is never fetched until `enabled` (the
 * member chose to open it), never refetched on its own, and not retried after a refusal.
 */
export function useSolution(ref: string, enabled: boolean) {
    const { user } = useAuth();
    const qc = useQueryClient();
    return useQuery<CrSolution>({
        queryKey: crKeys.solution(ref, user?.id ?? null),
        queryFn: async () => {
            try {
                const solution = await api.getSolution(ref);
                // The API now knows it was opened: the viewer block says so
                void qc.invalidateQueries({ queryKey: [...crKeys.details(), ref] });
                return solution;
            } catch (err) {
                if (isStaleState(err)) void qc.invalidateQueries({ queryKey: [...crKeys.details(), ref] });
                throw err;
            }
        },
        enabled: enabled && !!ref && !!user,
        staleTime: Infinity,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
    });
}

/** Staff: every exercise with its counters, any state */
export function useManagedSnippets(params: CrManageFilters = {}, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: crKeys.adminList(params, user?.id ?? null),
        queryFn: () => api.listManaged({ ...params, limit: ADMIN_PAGE_SIZE }),
        enabled: enabled && !!user,
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/** Staff: one exercise with its answer key, for the editor */
export function useAdminSnippet(ref: string, enabled = true) {
    const { user } = useAuth();
    return useQuery<CrAdminSnippet>({
        queryKey: crKeys.adminSnippet(ref, user?.id ?? null),
        queryFn: () => api.getAdminSnippet(ref),
        enabled: enabled && !!ref && !!user,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

// ---------------------------------------------------------------------------
// Writes. The screens show their own errors, so these keep the caches right.
// ---------------------------------------------------------------------------

/** What changes for one exercise and for the member: the cards, the viewer block, progress and totals */
export function refreshSnippet(qc: QueryClient, ref?: string | null) {
    void qc.invalidateQueries({ queryKey: crKeys.lists() });
    void qc.invalidateQueries({ queryKey: ref ? [...crKeys.details(), ref] : crKeys.details() });
    void qc.invalidateQueries({ queryKey: ['code-review', 'progress'] });
    void qc.invalidateQueries({ queryKey: ['code-review', 'stats'] });
}

/** Change the viewer block of the cached detail */
function patchViewer(qc: QueryClient, ref: string, userId: string | null, change: (viewer: CrViewer) => CrViewer, patchSnippet?: (d: CrDetail) => CrDetail) {
    qc.setQueryData<CrDetail>(crKeys.detail(ref, userId), (old) => {
        if (!old?.viewer) return old;
        const next = { ...old, viewer: change(old.viewer) };
        return patchSnippet ? patchSnippet(next) : next;
    });
}

/**
 * Send the marks. They live in the call: the server grades them against its own key. A pass moves
 * the member's points, badges and streak, so those caches are refreshed too.
 */
export function useSubmitAttempt() {
    const qc = useQueryClient();
    const { user, refreshUser } = useAuth();
    const userId = user?.id ?? null;
    return useMutation<CrAttemptResult, unknown, { ref: string; marks: CrMark[] }>({
        mutationFn: (v) => api.submitAttempt(v.ref, v.marks),
        retry: 0,
        onSuccess: (result, v) => {
            patchViewer(qc, v.ref, userId, (viewer) => ({
                ...viewer,
                attempts: result.attempts,
                attemptsToday: viewer.attemptsToday + 1,
                attemptsLeftToday: result.attemptsLeftToday,
                bestPercent: result.bestPercent,
                bestScore: Math.max(viewer.bestScore, result.score),
                maxScore: result.maxScore || viewer.maxScore,
                passed: viewer.passed || result.passed,
                status: viewer.passed || result.passed ? 'passed' : 'in-progress',
                pointsAvailable: result.pointsAvailable,
                pointsEarned: viewer.pointsEarned + result.pointsAwarded,
                solutionUnlocked: true,
            }));
            refreshSnippet(qc, v.ref);
            void qc.invalidateQueries({ queryKey: crKeys.attempts(v.ref, userId) });
            if (result.firstPass || result.newBadges.length > 0) {
                void qc.invalidateQueries({ queryKey: ['leaderboard'] });
                void qc.invalidateQueries({ queryKey: ['badges'] });
                void qc.invalidateQueries({ queryKey: ['streak'] });
                void refreshUser?.();
            }
        },
        onError: (err, v) => {
            if (err instanceof ApiError && err.code === 'CR_ATTEMPT_LIMIT') {
                patchViewer(qc, v.ref, userId, (viewer) => ({ ...viewer, attemptsLeftToday: 0 }));
            } else if (isStaleState(err)) refreshSnippet(qc, v.ref);
        },
    });
}

/** Open a hint: it costs its points once, and opening it again costs nothing */
export function useUnlockHint() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation<CrHintResult, unknown, { ref: string; order: number }>({
        mutationFn: (v) => api.unlockHint(v.ref, v.order),
        retry: 0,
        onSuccess: (result, v) => {
            patchViewer(
                qc, v.ref, user?.id ?? null,
                (viewer) => ({
                    ...viewer,
                    hintCost: result.hintCost,
                    pointsAvailable: result.pointsAvailable,
                    hintsUnlocked: result.recorded && !viewer.hintsUnlocked.includes(result.hint.order) ? [...viewer.hintsUnlocked, result.hint.order] : viewer.hintsUnlocked,
                }),
                (d) => ({ ...d, hints: d.hints.map((h) => (h.order === result.hint.order ? { ...h, unlocked: true, text: result.hint.text } : h)) }),
            );
            void qc.invalidateQueries({ queryKey: [...crKeys.details(), v.ref] });
        },
        onError: (err, v) => { if (isStaleState(err)) refreshSnippet(qc, v.ref); },
    });
}

// ---- Staff ----

/** A saved exercise changes what every cache shows, here and on the app server */
const afterAdminWrite = (qc: QueryClient) => {
    void qc.invalidateQueries({ queryKey: crKeys.all });
    void refreshPublicCodeReview();
};

export function useCreateSnippet() {
    const qc = useQueryClient();
    return useMutation<CrAdminSnippet, unknown, CrSnippetPayload>({
        mutationFn: (payload) => api.createSnippet(payload),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
    });
}

export function useUpdateSnippet() {
    const qc = useQueryClient();
    return useMutation<CrAdminSnippet, unknown, { ref: string; payload: CrSnippetPayload }>({
        mutationFn: (v) => api.updateSnippet(v.ref, v.payload),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
    });
}

export function useSetPublished() {
    const qc = useQueryClient();
    return useMutation<CrManageCard, unknown, { ref: string; published: boolean }>({
        mutationFn: (v) => api.setPublished(v.ref, v.published),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
    });
}

export function useDeleteSnippet() {
    const qc = useQueryClient();
    return useMutation<{ _id: string; slug: string }, unknown, { ref: string }>({
        mutationFn: (v) => api.deleteSnippet(v.ref),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
        // Members passed it meanwhile: the list on screen was out of date, show the truth
        onError: (err) => { if (err instanceof ApiError && err.code === 'CR_HAS_PROGRESS') void qc.invalidateQueries({ queryKey: crKeys.all }); },
    });
}
