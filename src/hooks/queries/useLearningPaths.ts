import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api/learning';
import { learningErrorMessage } from '@/lib/learning/errors';
import { applyServerProgress, applyTick, rewardMessages } from '@/lib/learning/progress';
import type {
    AdminPathFilters, CatalogueFilters, Certificate, EditorPath, LearningCard, LearningDetail, LearningPage, LearningProgress,
    PathInput, ProgressChange,
} from '@/types/learning';

/** One place for every learning query key, so a change can invalidate by prefix */
export const learningKeys = {
    all: ['learning'] as const,
    lists: () => ['learning', 'list'] as const,
    list: (filters: CatalogueFilters, userId: string | null) => ['learning', 'list', filters, userId] as const,
    details: () => ['learning', 'detail'] as const,
    detail: (slug: string, userId: string | null = null) => ['learning', 'detail', slug, userId] as const,
    summary: (userId: string | null) => ['learning', 'summary', userId] as const,
    progress: (userId: string | null) => ['learning', 'progress', userId] as const,
    certificate: (id: string) => ['learning', 'certificate', id] as const,
    admin: () => ['learning', 'admin'] as const,
    adminList: (filters: AdminPathFilters) => ['learning', 'admin', 'list', filters] as const,
    editor: (ref: string) => ['learning', 'admin', 'editor', ref] as const,
};

const PAGE_SIZE = 12;

/** The catalogue with "load more". `filters.page` is ignored: the pages are the query's own. */
export function useLearningList(filters: CatalogueFilters, { enabled = true }: { enabled?: boolean } = {}) {
    const { user, loading } = useAuth();
    const base = { limit: PAGE_SIZE, ...filters, page: undefined };
    return useInfiniteQuery({
        queryKey: learningKeys.list(base, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listPaths({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (last: LearningPage) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined),
        // The viewer block needs the token, so wait until the session is known
        enabled: enabled && !loading,
        staleTime: 60_000,
    });
}

/** Kept for callers that only need one page of cards */
export function useLearningPaths(filters: CatalogueFilters = {}) {
    const { user, loading } = useAuth();
    return useQuery({
        queryKey: [...learningKeys.lists(), 'page', filters, user?.id ?? null],
        queryFn: () => api.listPaths(filters),
        enabled: !loading,
        staleTime: 60_000,
    });
}

/**
 * One path with the viewer block. `initialData` (rendered on the server without a login) is treated
 * as already stale, so a signed-in visitor always refetches with their token.
 */
export function useLearningPath(slug: string, initialData?: LearningDetail | null) {
    const { user, loading } = useAuth();
    return useQuery({
        queryKey: learningKeys.detail(slug, user?.id ?? null),
        queryFn: () => api.getPath(slug),
        enabled: !!slug && !loading,
        initialData: initialData ?? undefined,
        initialDataUpdatedAt: 0,
        staleTime: 30_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

/** Totals, the paths in progress with their next step, and the latest completions */
export function useLearningSummary({ enabled = true }: { enabled?: boolean } = {}) {
    const { user } = useAuth();
    return useQuery({
        queryKey: learningKeys.summary(user?.id ?? null),
        queryFn: api.getSummary,
        enabled: enabled && !!user,
        staleTime: 60_000,
    });
}

export function useLearningProgressList({ enabled = true }: { enabled?: boolean } = {}) {
    const { user } = useAuth();
    return useQuery({
        queryKey: learningKeys.progress(user?.id ?? null),
        queryFn: api.listMyProgress,
        enabled: enabled && !!user,
        staleTime: 60_000,
    });
}

export function useCertificate(id: string, initialData?: Certificate | null) {
    return useQuery({
        queryKey: learningKeys.certificate(id),
        queryFn: () => api.verifyCertificate(id),
        enabled: !!id,
        initialData: initialData ?? undefined,
        staleTime: 5 * 60_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

// ---------------------------------------------------------------------------
// Joining, ticking and bookmarking, with the answer shown at once and undone if the API says no
// ---------------------------------------------------------------------------

type DetailSnapshot = [readonly unknown[], LearningDetail | undefined][];

const detailEntries = (qc: QueryClient, slug: string): DetailSnapshot =>
    qc.getQueriesData<LearningDetail>({ queryKey: [...learningKeys.details(), slug] });

async function patchDetails(qc: QueryClient, slug: string, patch: (d: LearningDetail) => LearningDetail): Promise<DetailSnapshot> {
    await qc.cancelQueries({ queryKey: [...learningKeys.details(), slug] });
    const snapshot = detailEntries(qc, slug);
    for (const [key, data] of snapshot) {
        if (data) qc.setQueryData<LearningDetail>(key, patch(data));
    }
    return snapshot;
}

function restore(qc: QueryClient, snapshot: DetailSnapshot | undefined) {
    for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

/** Everything that shows a total or a progress bar is stale after a tick */
function refreshAggregates(qc: QueryClient) {
    void qc.invalidateQueries({ queryKey: learningKeys.lists() });
    void qc.invalidateQueries({ queryKey: ['learning', 'summary'] });
    void qc.invalidateQueries({ queryKey: ['learning', 'progress'] });
}

interface TickVariables { slug: string; nodeId: string; done: boolean; title?: string }

/**
 * Ticks of one path run one after another (a quick A then B reaches the API in that order) and each
 * undoes only itself when it fails, from the cache as it is now. A stale snapshot would also undo
 * a later tick that is still on its way.
 */
const tickQueues = new Map<string, Promise<unknown>>();
const ticksPending = new Map<string, number>();

function enqueueTick<T>(slug: string, run: () => Promise<T>): Promise<T> {
    const previous = tickQueues.get(slug) ?? Promise.resolve();
    const next = previous.then(run, run);
    const tail = next.catch(() => undefined);
    tickQueues.set(slug, tail);
    void tail.then(() => { if (tickQueues.get(slug) === tail) tickQueues.delete(slug); });
    return next;
}

const pendingFor = (slug: string) => ticksPending.get(slug) ?? 0;

/** Tick or untick a step. The first tick joins the path (the API does that), so it works before enrolling. */
export function useTickNode() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<ProgressChange, unknown, TickVariables>({
        mutationFn: ({ slug, nodeId, done }) => enqueueTick(slug, () => (done ? api.completeNode(slug, nodeId) : api.uncompleteNode(slug, nodeId))),
        retry: 0,
        onMutate: async ({ slug, nodeId, done }) => {
            ticksPending.set(slug, pendingFor(slug) + 1);
            await patchDetails(qc, slug, (d) => applyTick(d, nodeId, done));
        },
        onError: (err, { slug, nodeId, done }) => {
            // Take back this tick only; ticks that came after it stay
            for (const [key, data] of detailEntries(qc, slug)) {
                if (data) qc.setQueryData<LearningDetail>(key, applyTick(data, nodeId, !done));
            }
            addToast({ variant: 'error', message: learningErrorMessage(err) });
            // Another tab may have changed things: show the truth, once the last tick has landed
            if (pendingFor(slug) <= 1) void qc.invalidateQueries({ queryKey: [...learningKeys.details(), slug] });
        },
        onSuccess: (change, { slug, title }) => {
            // The answer of a tick that is not the last one would not know about the later ticks
            if (pendingFor(slug) <= 1) {
                for (const [key, data] of detailEntries(qc, slug)) {
                    if (data) qc.setQueryData<LearningDetail>(key, applyServerProgress(data, change));
                }
            }
            for (const message of rewardMessages(change, title)) addToast({ variant: 'success', message });
            refreshAggregates(qc);
        },
        onSettled: (_data, _err, { slug }) => {
            const left = pendingFor(slug) - 1;
            if (left > 0) ticksPending.set(slug, left); else ticksPending.delete(slug);
        },
    });
}

/** Join explicitly, from the "Start" button. Ticking a step also joins. */
export function useEnroll() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<LearningProgress, unknown, { slug: string; title?: string }, { snapshot: DetailSnapshot }>({
        mutationFn: ({ slug }) => api.enrollInPath(slug),
        retry: 0,
        onMutate: async ({ slug }) => ({
            snapshot: await patchDetails(qc, slug, (d) => (d.viewer && !d.viewer.enrolled ? { ...d, viewer: { ...d.viewer, enrolled: true } } : d)),
        }),
        onError: (err, { slug }, ctx) => {
            restore(qc, ctx?.snapshot);
            addToast({ variant: 'error', message: learningErrorMessage(err) });
            // Already joined elsewhere: the page should say so
            void qc.invalidateQueries({ queryKey: [...learningKeys.details(), slug] });
        },
        onSuccess: (progress, { slug, title }) => {
            for (const [key, data] of detailEntries(qc, slug)) {
                if (data) qc.setQueryData<LearningDetail>(key, applyServerProgress(data, progress));
            }
            addToast({ variant: 'success', message: title ? `You joined ${title}.` : 'You joined.' });
            refreshAggregates(qc);
        },
    });
}

type ListSnapshot = [readonly unknown[], unknown][];

function patchCards(qc: QueryClient, id: string, patch: (c: LearningCard) => LearningCard): ListSnapshot {
    const snapshot = qc.getQueriesData({ queryKey: learningKeys.lists() });
    for (const [key, data] of snapshot) {
        if (!data) continue;
        const infinite = data as InfiniteData<LearningPage>;
        if (Array.isArray(infinite.pages)) {
            qc.setQueryData(key, { ...infinite, pages: infinite.pages.map((p) => ({ ...p, data: p.data.map((c) => (c.id === id ? patch(c) : c)) })) });
        } else if (Array.isArray((data as LearningPage).data)) {
            qc.setQueryData(key, { ...(data as LearningPage), data: (data as LearningPage).data.map((c) => (c.id === id ? patch(c) : c)) });
        }
    }
    return snapshot;
}

/** Bookmark or unbookmark a roadmap or path (the shared bookmark routes, content type `roadmap`) */
export function useBookmarkPath() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, { id: string; slug: string; bookmarked: boolean }, { details: DetailSnapshot; lists: ListSnapshot }>({
        mutationFn: ({ id, bookmarked }) => (bookmarked ? api.addBookmark('roadmap', id) : api.removeBookmark('roadmap', id)),
        retry: 0,
        onMutate: async ({ id, slug, bookmarked }) => {
            await qc.cancelQueries({ queryKey: learningKeys.lists() });
            const details = await patchDetails(qc, slug, (d) => (d.viewer ? { ...d, viewer: { ...d.viewer, bookmarked } } : d));
            const lists = patchCards(qc, id, (c) => (c.viewer ? { ...c, viewer: { ...c.viewer, bookmarked } } : c));
            return { details, lists };
        },
        onError: (err, _v, ctx) => {
            restore(qc, ctx?.details);
            for (const [key, data] of ctx?.lists ?? []) qc.setQueryData(key, data);
            addToast({ variant: 'error', message: learningErrorMessage(err) });
        },
        onSuccess: (_r, { bookmarked }) => {
            addToast({ variant: 'success', message: bookmarked ? 'Saved to your bookmarks.' : 'Removed from your bookmarks.' });
        },
    });
}

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

export function useAdminPaths(filters: AdminPathFilters, { enabled = true }: { enabled?: boolean } = {}) {
    const { user } = useAuth();
    const base = { limit: 20, ...filters, page: undefined };
    return useInfiniteQuery({
        queryKey: [...learningKeys.adminList(base), user?.id ?? null],
        queryFn: ({ pageParam }) => api.listAdminPaths({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (last: LearningPage) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined),
        enabled: enabled && !!user,
        staleTime: 15_000,
    });
}

export function useEditorPath(ref: string, { enabled = true }: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: learningKeys.editor(ref),
        queryFn: () => api.getEditorPath(ref),
        enabled: enabled && !!ref,
        // The editor holds its own copy; refetching under it would only cause surprises
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

/** After any authoring change the public catalogue, details and staff lists are out of date */
function refreshAuthoring(qc: QueryClient, saved?: EditorPath) {
    void qc.invalidateQueries({ queryKey: learningKeys.admin() });
    void qc.invalidateQueries({ queryKey: learningKeys.lists() });
    void qc.invalidateQueries({ queryKey: learningKeys.details() });
    if (saved) qc.setQueryData(learningKeys.editor(saved.id), saved);
}

export function useCreatePath() {
    const qc = useQueryClient();
    return useMutation<EditorPath, unknown, PathInput>({
        mutationFn: (input) => api.createPath(input),
        retry: 0,
        onSuccess: (saved) => refreshAuthoring(qc, saved),
    });
}

/** The error is left to the editor: a conflict or a list of bad items needs more than a toast */
export function useUpdatePath() {
    const qc = useQueryClient();
    return useMutation<EditorPath, unknown, { ref: string; input: PathInput }>({
        mutationFn: ({ ref, input }) => api.updatePath(ref, input),
        retry: 0,
        onSuccess: (saved) => refreshAuthoring(qc, saved),
    });
}

export function usePathTransition() {
    const qc = useQueryClient();
    return useMutation<EditorPath, unknown, { ref: string; action: api.PathTransition }>({
        mutationFn: ({ ref, action }) => api.transitionPath(ref, action),
        retry: 0,
        onSuccess: (saved) => refreshAuthoring(qc, saved),
    });
}

export function useRequestPathChanges() {
    const qc = useQueryClient();
    return useMutation<EditorPath, unknown, { ref: string; note: string }>({
        mutationFn: ({ ref, note }) => api.requestPathChanges(ref, note),
        retry: 0,
        onSuccess: (saved) => refreshAuthoring(qc, saved),
    });
}

export function useFeaturePath() {
    const qc = useQueryClient();
    return useMutation<EditorPath, unknown, { ref: string; featured: boolean }>({
        mutationFn: ({ ref, featured }) => api.featurePath(ref, featured),
        retry: 0,
        onSuccess: (saved) => refreshAuthoring(qc, saved),
    });
}

export function useDeletePath() {
    const qc = useQueryClient();
    return useMutation<{ deleted: boolean; archived: boolean }, unknown, { ref: string }>({
        mutationFn: ({ ref }) => api.deletePath(ref),
        retry: 0,
        onSuccess: () => refreshAuthoring(qc),
    });
}
