import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import * as learning from '@/lib/api/learning';
import * as api from '@/lib/api/resources';
import { learningErrorMessage } from '@/lib/learning/errors';
import { applyVote, mapCached } from '@/lib/learning/resourcePatch';
import { parseHttpUrl } from '@/lib/learning/url';
import type {
    LinkStatus, ReadingStatus, RejectReason, ReportReason, Resource, ResourceFilters, ResourceInput, ResourcePage, ReviewQueue, UrlCheck, Vote, VoteResult,
} from '@/types/resource';

/** One place for every library query key, so a change can invalidate by prefix */
export const resourceKeys = {
    all: ['resources'] as const,
    lists: () => ['resources', 'list'] as const,
    list: (filters: ResourceFilters, userId: string | null) => ['resources', 'list', filters, userId] as const,
    details: () => ['resources', 'detail'] as const,
    detail: (slug: string, userId: string | null = null) => ['resources', 'detail', slug, userId] as const,
    facets: () => ['resources', 'facets'] as const,
    mine: (status: string, userId: string | null) => ['resources', 'my', status, userId] as const,
    reading: (status: string, userId: string | null) => ['resources', 'reading', status, userId] as const,
    review: (queue: string, q: string, userId: string | null) => ['resources', 'review', queue, q, userId] as const,
    checkUrl: (url: string) => ['resources', 'check-url', url] as const,
};

const PAGE_SIZE = 12;

const nextPage = (last: ResourcePage) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined);

/** The library with "load more". `filters.page` is ignored: the pages are the query's own. */
export function useResourceList(filters: ResourceFilters) {
    const { user, loading } = useAuth();
    const base = { limit: PAGE_SIZE, ...filters, page: undefined };
    return useInfiniteQuery({
        queryKey: resourceKeys.list(base, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listResources({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: nextPage,
        // The viewer block needs the token, so wait until the session is known
        enabled: !loading,
        staleTime: 60_000,
    });
}

export function useResourceFacets() {
    return useQuery({ queryKey: resourceKeys.facets(), queryFn: api.getFacets, staleTime: 5 * 60_000 });
}

/** One resource. Server rendered `initialData` is treated as stale so a signed-in visitor refetches with the token. */
export function useResource(slug: string, initialData?: Resource | null) {
    const { user, loading } = useAuth();
    return useQuery({
        queryKey: resourceKeys.detail(slug, user?.id ?? null),
        queryFn: () => api.getResource(slug),
        enabled: !!slug && !loading,
        initialData: initialData ?? undefined,
        initialDataUpdatedAt: 0,
        staleTime: 30_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

export function useMyResourceSubmissions(status: string) {
    const { user } = useAuth();
    return useInfiniteQuery({
        queryKey: resourceKeys.mine(status, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listMySubmissions({ status: status === 'all' ? undefined : status, page: pageParam, limit: PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: nextPage,
        enabled: !!user,
        staleTime: 30_000,
    });
}

export function useReadingList(status: ReadingStatus | 'all') {
    const { user } = useAuth();
    return useInfiniteQuery({
        queryKey: resourceKeys.reading(status, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listReading({ status: status === 'all' ? undefined : status, page: pageParam, limit: PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: nextPage,
        enabled: !!user,
        staleTime: 30_000,
    });
}

export function useResourceReviewQueue(queue: ReviewQueue, q: string, { enabled = true }: { enabled?: boolean } = {}) {
    const { user } = useAuth();
    return useInfiniteQuery({
        queryKey: resourceKeys.review(queue, q, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listReviewQueue({ queue, q, page: pageParam, limit: 20 }),
        initialPageParam: 1,
        getNextPageParam: nextPage,
        enabled: enabled && !!user,
        staleTime: 15_000,
    });
}

/** Duplicate and shortener check for a link the member typed. No request is made for a link that cannot be valid. */
export function useCheckUrl(url: string) {
    const trimmed = url.trim();
    return useQuery<UrlCheck>({
        queryKey: resourceKeys.checkUrl(trimmed),
        queryFn: () => api.checkUrl(trimmed),
        enabled: trimmed.length > 0 && !!parseHttpUrl(trimmed),
        staleTime: 30_000,
        retry: false,
    });
}

// ---------------------------------------------------------------------------
// Optimistic changes to a resource wherever it is cached
// ---------------------------------------------------------------------------

type Snapshot = [readonly unknown[], unknown][];

async function patchEverywhere(qc: QueryClient, id: string, fn: (r: Resource) => Resource): Promise<Snapshot> {
    await qc.cancelQueries({ queryKey: resourceKeys.all });
    const snapshot = qc.getQueriesData({ queryKey: resourceKeys.all });
    for (const [key, data] of snapshot) {
        if (data) qc.setQueryData(key, mapCached(data, id, fn));
    }
    return snapshot;
}

function restore(qc: QueryClient, snapshot: Snapshot | undefined) {
    for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

export function useVoteResource() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<VoteResult, unknown, { id: string; slug: string; value: Vote }, { snapshot: Snapshot }>({
        mutationFn: ({ slug, value }) => api.voteResource(slug, value),
        retry: 0,
        onMutate: async ({ id, value }) => ({ snapshot: await patchEverywhere(qc, id, (r) => applyVote(r, value)) }),
        onError: (err, _v, ctx) => {
            restore(qc, ctx?.snapshot);
            addToast({ variant: 'error', message: learningErrorMessage(err) });
        },
        onSuccess: (result, { id }) => {
            // The server's tally is the truth
            for (const [key, data] of qc.getQueriesData({ queryKey: resourceKeys.all })) {
                if (data) qc.setQueryData(key, mapCached(data, id, (r) => ({
                    ...r, upvotes: result.upvotes, downvotes: result.downvotes, score: result.score,
                    viewer: r.viewer ? { ...r.viewer, vote: result.userVote } : r.viewer,
                })));
            }
        },
    });
}

export function useBookmarkResource() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, { id: string; bookmarked: boolean }, { snapshot: Snapshot }>({
        mutationFn: ({ id, bookmarked }) => (bookmarked ? learning.addBookmark('resource', id) : learning.removeBookmark('resource', id)),
        retry: 0,
        onMutate: async ({ id, bookmarked }) => ({
            snapshot: await patchEverywhere(qc, id, (r) => (r.viewer ? { ...r, viewer: { ...r.viewer, bookmarked } } : r)),
        }),
        onError: (err, _v, ctx) => {
            restore(qc, ctx?.snapshot);
            addToast({ variant: 'error', message: learningErrorMessage(err) });
        },
        onSuccess: (_r, { bookmarked }) => addToast({ variant: 'success', message: bookmarked ? 'Saved to your bookmarks.' : 'Removed from your bookmarks.' }),
    });
}

export function useSetReading() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, { id: string; slug: string; status: ReadingStatus | null }, { snapshot: Snapshot }>({
        mutationFn: ({ slug, status }) => api.setReading(slug, status),
        retry: 0,
        onMutate: async ({ id, status }) => ({
            snapshot: await patchEverywhere(qc, id, (r) => (r.viewer ? { ...r, viewer: { ...r.viewer, reading: status } } : r)),
        }),
        onError: (err, _v, ctx) => {
            restore(qc, ctx?.snapshot);
            addToast({ variant: 'error', message: learningErrorMessage(err) });
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['resources', 'reading'] });
        },
    });
}

/** The dialog shows the error itself, so a failed report keeps what the member typed */
export function useReportResource() {
    const { addToast } = useToast();
    return useMutation({
        mutationFn: ({ slug, reason, details }: { slug: string; reason: ReportReason; details?: string }) => api.reportResource(slug, { reason, details }),
        retry: 0,
        onSuccess: () => addToast({ variant: 'success', title: 'Report sent', message: 'Thank you. A moderator will take a look.' }),
    });
}

function refreshLibrary(qc: QueryClient) {
    void qc.invalidateQueries({ queryKey: resourceKeys.all });
}

/** A submission waits for review, so only the member's own lists change; the public library stays as it is */
export function useCreateResource() {
    const qc = useQueryClient();
    return useMutation<Resource, unknown, ResourceInput>({
        mutationFn: (input) => api.createResource(input),
        retry: 0,
        onSuccess: () => refreshLibrary(qc),
    });
}

export function useUpdateResource() {
    const qc = useQueryClient();
    return useMutation<Resource, unknown, { slug: string; input: ResourceInput }>({
        mutationFn: ({ slug, input }) => api.updateResource(slug, input),
        retry: 0,
        onSuccess: () => refreshLibrary(qc),
    });
}

export function useDeleteResource() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, { slug: string }>({
        mutationFn: ({ slug }) => api.deleteResource(slug),
        retry: 0,
        onSuccess: () => {
            addToast({ variant: 'success', message: 'Resource deleted.' });
            refreshLibrary(qc);
        },
        onError: (err) => addToast({ variant: 'error', message: learningErrorMessage(err) }),
    });
}

// ---------------------------------------------------------------------------
// Moderation (errors are shown by the dialog or row that asked)
// ---------------------------------------------------------------------------

export function useApproveResource() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, { slug: string; title?: string }>({
        mutationFn: ({ slug }) => api.approveResource(slug),
        retry: 0,
        onSuccess: (_r, { title }) => {
            addToast({ variant: 'success', message: title ? `Approved "${title}".` : 'Resource approved.' });
            refreshLibrary(qc);
        },
        onError: (err) => {
            addToast({ variant: 'error', message: learningErrorMessage(err) });
            // Someone else may have decided already
            refreshLibrary(qc);
        },
    });
}

export function useRejectResource() {
    const qc = useQueryClient();
    return useMutation<void, unknown, { slug: string; reason: RejectReason; note?: string }>({
        mutationFn: ({ slug, reason, note }) => api.rejectResource(slug, { reason, note }),
        retry: 0,
        onSuccess: () => refreshLibrary(qc),
    });
}

export function useSetLinkStatus() {
    const qc = useQueryClient();
    return useMutation<void, unknown, { slug: string; status: LinkStatus; note?: string }>({
        mutationFn: ({ slug, status, note }) => api.setLinkStatus(slug, { status, note }),
        retry: 0,
        onSuccess: () => refreshLibrary(qc),
    });
}

export function useFeatureResource() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, { slug: string; featured: boolean }>({
        mutationFn: ({ slug, featured }) => api.featureResource(slug, featured),
        retry: 0,
        onSuccess: (_r, { featured }) => {
            addToast({ variant: 'success', message: featured ? 'Resource featured.' : 'Resource no longer featured.' });
            refreshLibrary(qc);
        },
        onError: (err) => addToast({ variant: 'error', message: learningErrorMessage(err) }),
    });
}
