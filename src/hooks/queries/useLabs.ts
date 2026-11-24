import {
    keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import * as api from '@/lib/api/labs';
import { ApiError } from '@/lib/api';
import { lockedUntilFromError } from '@/lib/labs/errors';
import { lockEndsAt } from '@/lib/labs/lock';
import type {
    GlobalLeaderRow, HintResult, LabAdminView, LabCard, LabCategory, LabDetail, LabFacets, LabFilters, LabLeaderRow,
    LabPayload, LabProgressRow, LabStats, LabStatus, LabViewer, Page, StopResult, SubmitResult,
} from '@/types/lab';

/**
 * One place for every labs query key, so a change can invalidate by prefix. Anything that depends on
 * who is asking (`myStatus` on the cards, the viewer block of a lab, my progress and stats, the
 * staff views) carries the user id, so one account never reads another's cache after a switch.
 * The leaderboards and the category counts are public and the same for everyone.
 */
export const labKeys = {
    all: ['labs'] as const,
    /** The list carries `myStatus` for a member, so the viewer is in the key */
    lists: () => ['labs', 'list'] as const,
    list: (filters: LabFilters, userId: string | null = null) => ['labs', 'list', filters, userId] as const,
    categories: () => ['labs', 'categories'] as const,
    details: () => ['labs', 'detail'] as const,
    detail: (slug: string, userId: string | null = null) => ['labs', 'detail', slug, userId] as const,
    /** My progress rows and my progress on one lab */
    progress: () => ['labs', 'progress'] as const,
    myProgress: (params: object, userId: string | null = null) => ['labs', 'progress', 'mine', userId, params] as const,
    labProgress: (slug: string, userId: string | null = null) => ['labs', 'progress', 'lab', slug, userId] as const,
    stats: (userId: string | null = null) => ['labs', 'stats', userId] as const,
    boards: () => ['labs', 'leaderboard'] as const,
    globalBoard: (params: { category?: LabCategory | ''; limit?: number } = {}) => ['labs', 'leaderboard', 'global', params.category ?? '', params.limit ?? null] as const,
    /** The cards of one category, for "what to do next" */
    next: (category: string, userId: string | null = null) => ['labs', 'list', 'next', category, userId] as const,
    labBoard: (slug: string, limit?: number) => ['labs', 'leaderboard', 'lab', slug, limit ?? null] as const,
    admin: () => ['labs', 'admin'] as const,
    adminList: (params: object, userId: string | null = null) => ['labs', 'admin', 'list', userId, params] as const,
};

export const LABS_PAGE_SIZE = 12;
const ADMIN_PAGE_SIZE = 20;

type Pages<T> = InfiniteData<Page<T>, number>;
const nextPage = <T,>(last: Page<T>) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined);

/** Signed-in errors that mean "the page shows an old state": show the truth again */
const STALE_STATE_CODES = new Set(['LAB_ALREADY_COMPLETED', 'LAB_ALREADY_STARTED', 'LAB_NOT_STARTED', 'LAB_NOT_FOUND', 'LAB_HINT_NOT_FOUND']);
const isStaleState = (err: unknown) => err instanceof ApiError && !!err.code && STALE_STATE_CODES.has(err.code);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The public list with "load more". `filters.page` is ignored: the pages are the query's own.
 * `initialPage` is the first page rendered on the server, for the plain list only (the caller
 * leaves it out for any filter): it counts as fresh for a visitor, and is only a placeholder for a
 * member, whose cards also carry `myStatus`.
 */
export function useLabs(filters: LabFilters = {}, initialPage?: Page<LabCard> | null) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    const base: LabFilters = { limit: LABS_PAGE_SIZE, ...filters, page: undefined };
    const seed: Pages<LabCard> | undefined = initialPage ? { pages: [initialPage], pageParams: [1] } : undefined;
    return useInfiniteQuery({
        queryKey: labKeys.list(base, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listLabs({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: nextPage<LabCard>,
        // The cards of a member carry their own state: wait until the session is known
        enabled: !loading,
        staleTime: 5 * 60_000,
        initialData: !signedIn ? seed : undefined,
        // Keep the old list on screen while a new filter loads; the server copy is the first placeholder for a member
        placeholderData: (previous) => previous ?? (signedIn ? seed : undefined),
    });
}

/** Category and difficulty counts of the published labs, for the filters */
export function useLabCategories(initial?: LabFacets | null) {
    return useQuery({
        queryKey: labKeys.categories(),
        queryFn: api.getFacets,
        initialData: initial ?? undefined,
        staleTime: 5 * 60_000,
    });
}

/**
 * One lab with the viewer block. The copy rendered on the server has no viewer, so it differs by
 * who is looking:
 * - A visitor who is not signed in has the same answer, so it counts as fresh from the moment the
 *   page rendered, and nothing is fetched right after hydration.
 * - A signed-in member only gets it as `placeholderData`: shown while the answer with their own
 *   token is on its way, and never taken for the answer itself (`isPlaceholderData` tells them apart).
 */
export function useLab(slug: string, serverLab?: LabDetail | null) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    return useQuery({
        queryKey: labKeys.detail(slug, user?.id ?? null),
        queryFn: () => api.getLab(slug),
        enabled: !!slug && !loading,
        initialData: !signedIn ? (serverLab ?? undefined) : undefined,
        placeholderData: signedIn ? (serverLab ?? undefined) : undefined,
        staleTime: 30_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

/** The other labs of a category, so a finished lab can suggest the next one. Not fetched until `enabled`. */
export function useNextLabCards(category: LabCategory | undefined, enabled: boolean) {
    const { user, loading } = useAuth();
    return useQuery({
        queryKey: labKeys.next(category ?? '', user?.id ?? null),
        queryFn: async () => (await api.listLabs({ category, sort: 'difficulty', limit: 20 })).data,
        enabled: enabled && !!category && !loading,
        staleTime: 60_000,
    });
}

/** My progress row on one lab: null when I have not started it */
export function useLabProgress(slug: string, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: labKeys.labProgress(slug, user?.id ?? null),
        queryFn: () => api.getLabProgress(slug),
        enabled: enabled && !!slug && !!user,
        staleTime: 15_000,
    });
}

/** All my progress rows, one page at a time */
export function useMyLabProgress(params: { page?: number; limit?: number } = {}, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: labKeys.myProgress(params, user?.id ?? null),
        queryFn: () => api.listMyProgress(params),
        enabled: enabled && !!user,
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });
}

/** My totals and the split by difficulty */
export function useLabStats(enabled = true) {
    const { user } = useAuth();
    return useQuery<LabStats>({
        queryKey: labKeys.stats(user?.id ?? null),
        queryFn: api.getStats,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

/** The global board, or one category's. Public: the same for everyone, cached five minutes. */
export function useGlobalLeaderboard(params: { category?: LabCategory | ''; limit?: number } = {}, enabled = true) {
    return useQuery<GlobalLeaderRow[]>({
        queryKey: labKeys.globalBoard(params),
        queryFn: () => api.globalLeaderboard(params),
        enabled,
        placeholderData: keepPreviousData,
        staleTime: 5 * 60_000,
    });
}

/** The fastest, cleanest completions of one lab */
export function useLabLeaderboard(slug: string, limit = 10, enabled = true) {
    return useQuery<LabLeaderRow[]>({
        queryKey: labKeys.labBoard(slug, limit),
        queryFn: () => api.labLeaderboard(slug, limit),
        enabled: enabled && !!slug,
        staleTime: 5 * 60_000,
    });
}

/** Admin and owner: every lab with its counters, any status */
export function useManagedLabs(params: { page?: number; status?: LabStatus | '' } = {}, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: labKeys.adminList(params, user?.id ?? null),
        queryFn: () => api.listManagedLabs({ page: params.page, status: params.status, limit: ADMIN_PAGE_SIZE }),
        enabled: enabled && !!user,
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

// ---------------------------------------------------------------------------
// Writes. The screens show their own errors, so these keep the caches right.
// ---------------------------------------------------------------------------

/** What changes for one lab and for the member: the cards, the viewer block, progress and stats */
export function refreshLab(qc: QueryClient, slug?: string | null) {
    void qc.invalidateQueries({ queryKey: labKeys.lists() });
    void qc.invalidateQueries({ queryKey: slug ? [...labKeys.details(), slug] : labKeys.details() });
    void qc.invalidateQueries({ queryKey: labKeys.progress() });
    void qc.invalidateQueries({ queryKey: ['labs', 'stats'] });
}

/** A completion also moves the boards, the points ledger, streak and badges, and the user's own totals */
export function refreshAfterCompletion(qc: QueryClient, slug?: string | null) {
    refreshLab(qc, slug);
    void qc.invalidateQueries({ queryKey: labKeys.boards() });
    void qc.invalidateQueries({ queryKey: ['leaderboard'] });
    void qc.invalidateQueries({ queryKey: ['badges'] });
    void qc.invalidateQueries({ queryKey: ['streak'] });
}

/** Change the viewer block of the cached detail, for every viewer key of that lab */
function patchViewer(qc: QueryClient, slug: string, userId: string | null, change: (viewer: LabViewer) => LabViewer, patchLab?: (lab: LabDetail) => LabDetail) {
    qc.setQueryData<LabDetail>(labKeys.detail(slug, userId), (old) => {
        if (!old?.viewer) return old;
        const next = { ...old, viewer: change(old.viewer) };
        return patchLab ? patchLab(next) : next;
    });
}

/** Show the member's state on the cached cards at once; the refetch confirms it */
function patchCards(qc: QueryClient, slug: string, myStatus: LabCard['myStatus']) {
    for (const [key, data] of qc.getQueriesData<Pages<LabCard>>({ queryKey: labKeys.lists() })) {
        if (!data?.pages) continue;
        qc.setQueryData<Pages<LabCard>>(key, {
            ...data,
            pages: data.pages.map((p) => ({ ...p, data: p.data.map((c) => (c.slug === slug ? { ...c, myStatus } : c)) })),
        });
    }
}

export function useStartLab() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: (v: { slug: string }) => api.startLab(v.slug),
        retry: 0,
        onSuccess: (row: LabProgressRow, v) => {
            patchViewer(qc, v.slug, user?.id ?? null, (viewer) => ({ ...viewer, myStatus: 'in-progress', startedAt: row.startedAt, attempts: 0, lockedUntil: null, lockedForSeconds: null, lockEndsAt: null }));
            patchCards(qc, v.slug, 'in-progress');
            refreshLab(qc, v.slug);
        },
        onError: (err, v) => { if (isStaleState(err)) refreshLab(qc, v.slug); },
    });
}

/**
 * Send a flag. The flag lives in the call and nowhere else: the mutation is dropped from the cache
 * as soon as nothing observes it (`gcTime: 0`), and the screen calls `reset()` once it has the
 * verdict. A wrong flag keeps the member on the lab with the attempts left; a right one moves
 * everything the completion touches.
 */
export function useSubmitFlag() {
    const qc = useQueryClient();
    const { user, refreshUser } = useAuth();
    const userId = user?.id ?? null;
    return useMutation<SubmitResult, unknown, { slug: string; flag: string }>({
        mutationFn: (v) => api.submitFlag(v.slug, v.flag),
        retry: 0,
        gcTime: 0,
        onSuccess: (result, v) => {
            if (result.correct) {
                patchViewer(qc, v.slug, userId, (viewer) => ({
                    ...viewer, myStatus: 'completed', attempts: result.attempts, completedAt: result.completedAt,
                    pointsAwarded: result.pointsEarned, pointsAvailable: result.pointsEarned, lockedUntil: null, lockedForSeconds: null, lockEndsAt: null,
                }));
                patchCards(qc, v.slug, 'completed');
                refreshAfterCompletion(qc, v.slug);
                void refreshUser?.();
            } else {
                patchViewer(qc, v.slug, userId, (viewer) => ({
                    ...viewer, attempts: result.attempts, lockedUntil: result.lockedUntil, lockedForSeconds: result.lockedForSeconds, lockEndsAt: lockEndsAt(result, Date.now()),
                }));
                void qc.invalidateQueries({ queryKey: [...labKeys.details(), v.slug] });
                void qc.invalidateQueries({ queryKey: labKeys.progress() });
            }
        },
        onError: (err, v) => {
            // Locked: remember it on the cached lab, so leaving and coming back still shows the wait
            const until = lockedUntilFromError(err);
            if (until) patchViewer(qc, v.slug, userId, (viewer) => ({ ...viewer, lockEndsAt: until }));
            else if (isStaleState(err)) refreshLab(qc, v.slug);
        },
    });
}

/** Open a hint: it costs its penalty once, and opening it again costs nothing */
export function useUnlockHint() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation<HintResult, unknown, { slug: string; hintIndex: number }>({
        mutationFn: (v) => api.unlockHint(v.slug, v.hintIndex),
        retry: 0,
        onSuccess: (result, v) => {
            patchViewer(
                qc, v.slug, user?.id ?? null,
                (viewer) => ({ ...viewer, hintsUsed: result.hintsUsed, pointsAvailable: result.pointsAvailable }),
                (lab) => ({ ...lab, hints: lab.hints.map((h) => (h.index === result.hint.index ? { ...h, unlocked: true, text: result.hint.text } : h)) }),
            );
            void qc.invalidateQueries({ queryKey: [...labKeys.details(), v.slug] });
            void qc.invalidateQueries({ queryKey: labKeys.progress() });
        },
        onError: (err, v) => { if (isStaleState(err)) refreshLab(qc, v.slug); },
    });
}

/** Take back a start that has no hints and no wrong flags. Anything else is kept. */
export function useStopLab() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation<StopResult, unknown, { slug: string }>({
        mutationFn: (v) => api.stopLab(v.slug),
        retry: 0,
        onSuccess: (result, v) => {
            if (result.reset) {
                patchViewer(qc, v.slug, user?.id ?? null, (viewer) => ({ ...viewer, myStatus: 'not-started', startedAt: null, attempts: 0, lockedUntil: null, lockedForSeconds: null, lockEndsAt: null }));
                patchCards(qc, v.slug, 'not-started');
            }
            refreshLab(qc, v.slug);
        },
        onError: (err, v) => { if (isStaleState(err)) refreshLab(qc, v.slug); },
    });
}

// ---- Admin and owner ----

export function useCreateLab() {
    const qc = useQueryClient();
    return useMutation<LabAdminView, unknown, LabPayload>({
        mutationFn: (payload) => api.createLab(payload),
        retry: 0,
        onSuccess: () => void qc.invalidateQueries({ queryKey: labKeys.all }),
    });
}

export function useUpdateLab() {
    const qc = useQueryClient();
    return useMutation<LabAdminView, unknown, { slug: string; payload: LabPayload }>({
        mutationFn: (v) => api.updateLab(v.slug, v.payload),
        retry: 0,
        onSuccess: () => void qc.invalidateQueries({ queryKey: labKeys.all }),
    });
}

export function useDeleteLab() {
    const qc = useQueryClient();
    return useMutation<{ _id: string; slug: string }, unknown, { slug: string }>({
        mutationFn: (v) => api.deleteLab(v.slug),
        retry: 0,
        onSuccess: () => void qc.invalidateQueries({ queryKey: labKeys.all }),
    });
}
