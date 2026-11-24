import { useEffect, useRef } from 'react';
import {
    useInfiniteQuery, useMutation, useQuery, useQueryClient,
    type InfiniteData, type QueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useNotificationSocket } from '@/context/NotificationProvider';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api/mentorship';
import type { FinalFeedbackInput, MentorApplicationInput, RequestInput, SessionInput } from '@/lib/api/mentorship';
import { optimisticMessage } from '@/lib/mentorship/chat';
import { mentorshipErrorMessage } from '@/lib/mentorship/errors';
import type {
    Mentor, MentorListFilters, Mentorship, MentorshipMessage, MentorshipRequest, MentorshipSession, MentorshipSummary,
    MentorStatus, MessagePage, Page, ReportTarget, IncomingRequest,
} from '@/types/mentorship';

/**
 * Every mentorship query key starts with `['mentorship', ...]` and carries the signed-in user id,
 * so one member's data is never shown to the next person who signs in on the same browser.
 */
export const mentorshipKeys = {
    all: ['mentorship'] as const,
    mentors: (filters: MentorListFilters, uid: string | null) => ['mentorship', 'mentors', filters, uid] as const,
    featured: (uid: string | null) => ['mentorship', 'featured', uid] as const,
    mentor: (id: string, uid: string | null) => ['mentorship', 'mentor', id, uid] as const,
    reviews: (id: string) => ['mentorship', 'reviews', id] as const,
    eligibility: (uid: string | null) => ['mentorship', 'eligibility', uid] as const,
    myProfile: (uid: string | null) => ['mentorship', 'my-profile', uid] as const,
    requests: (uid: string | null) => ['mentorship', 'requests', uid] as const,
    myRequests: (params: object, uid: string | null) => ['mentorship', 'requests', uid, 'mine', params] as const,
    incoming: (params: object, uid: string | null) => ['mentorship', 'requests', uid, 'incoming', params] as const,
    lists: (uid: string | null) => ['mentorship', 'list', uid] as const,
    list: (params: object, uid: string | null) => ['mentorship', 'list', uid, params] as const,
    details: (uid: string | null) => ['mentorship', 'detail', uid] as const,
    detail: (id: string, uid: string | null) => ['mentorship', 'detail', uid, id] as const,
    summary: (uid: string | null) => ['mentorship', 'summary', uid] as const,
    messages: (id: string, uid: string | null) => ['mentorship', 'messages', uid, id] as const,
    outbox: (id: string, uid: string | null) => ['mentorship', 'outbox', uid, id] as const,
    sessions: (uid: string | null) => ['mentorship', 'sessions', uid] as const,
    sessionList: (id: string, scope: string, uid: string | null) => ['mentorship', 'sessions', uid, id, scope] as const,
    upcoming: (uid: string | null) => ['mentorship', 'sessions', uid, 'upcoming'] as const,
    pendingFeedback: (uid: string | null) => ['mentorship', 'sessions', uid, 'pending-feedback'] as const,
    feedback: (id: string, uid: string | null) => ['mentorship', 'feedback', uid, id] as const,
    applications: (params: object, uid: string | null) => ['mentorship', 'admin', uid, 'applications', params] as const,
    adminMentorships: (params: object, uid: string | null) => ['mentorship', 'admin', uid, 'mentorships', params] as const,
    reported: (uid: string | null) => ['mentorship', 'admin', uid, 'reported'] as const,
    context: (flagId: string, uid: string | null) => ['mentorship', 'admin', uid, 'context', flagId] as const,
};

const DIRECTORY_PAGE = 12;
const LIST_PAGE = 20;

const useUserId = () => {
    const { user, loading } = useAuth();
    return { uid: user?.id ?? null, user, loading };
};

const hasNext = (last: { pagination: { page: number; pages: number } }) => (last.pagination.page < last.pagination.pages ? last.pagination.page + 1 : undefined);

// ---------------------------------------------------------------------------
// Directory and mentor profiles (public: readable signed out)
// ---------------------------------------------------------------------------

/** The directory with "load more". `filters.page` is ignored: the pages are the query's own. */
export function useMentorList(filters: MentorListFilters) {
    const { uid, loading } = useUserId();
    const base = { limit: DIRECTORY_PAGE, ...filters, page: undefined };
    return useInfiniteQuery({
        queryKey: mentorshipKeys.mentors(base, uid),
        queryFn: ({ pageParam }) => api.listMentors({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: hasNext,
        enabled: !loading,
        staleTime: 60_000,
    });
}

export function useFeaturedMentors(limit = 3) {
    const { uid, loading } = useUserId();
    return useQuery({
        queryKey: [...mentorshipKeys.featured(uid), limit],
        queryFn: () => api.listFeaturedMentors(limit),
        enabled: !loading,
        staleTime: 5 * 60_000,
    });
}

/** One mentor. `initialData` (rendered on the server without a login) is treated as already stale. */
export function useMentor(id: string, initialData?: Mentor | null) {
    const { uid, loading } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.mentor(id, uid),
        queryFn: () => api.getMentor(id),
        enabled: !!id && !loading,
        initialData: initialData ?? undefined,
        initialDataUpdatedAt: 0,
        staleTime: 30_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

export function useMentorReviews(id: string, enabled = true) {
    return useInfiniteQuery({
        queryKey: mentorshipKeys.reviews(id),
        queryFn: ({ pageParam }) => api.listMentorReviews(id, pageParam, 5),
        initialPageParam: 1,
        getNextPageParam: hasNext,
        enabled: !!id && enabled,
        staleTime: 60_000,
    });
}

// ---------------------------------------------------------------------------
// My mentor profile
// ---------------------------------------------------------------------------

export function useEligibility(enabled = true) {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.eligibility(uid),
        queryFn: api.getEligibility,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

export function useMyMentorProfile(enabled = true) {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.myProfile(uid),
        queryFn: api.getMyMentorProfile,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export function useMyRequests(params: { status?: string } = {}, enabled = true) {
    const { uid, user } = useUserId();
    return useInfiniteQuery({
        queryKey: mentorshipKeys.myRequests(params, uid),
        queryFn: ({ pageParam }) => api.listMyRequests({ ...params, page: pageParam, limit: LIST_PAGE }),
        initialPageParam: 1,
        getNextPageParam: hasNext,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

export function useIncomingRequests(params: { status?: 'pending' | 'accepted' | 'declined' | 'all' } = { status: 'pending' }, enabled = true) {
    const { uid, user } = useUserId();
    return useInfiniteQuery({
        queryKey: mentorshipKeys.incoming(params, uid),
        queryFn: ({ pageParam }) => api.listIncomingRequests({ ...params, page: pageParam, limit: LIST_PAGE }),
        initialPageParam: 1,
        getNextPageParam: hasNext,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

// ---------------------------------------------------------------------------
// Mentorships
// ---------------------------------------------------------------------------

export function useMentorships(params: { role?: 'mentor' | 'mentee'; status?: string } = {}, enabled = true) {
    const { uid, user } = useUserId();
    return useInfiniteQuery({
        queryKey: mentorshipKeys.list(params, uid),
        queryFn: ({ pageParam }) => api.listMentorships({ ...params, page: pageParam, limit: LIST_PAGE }),
        initialPageParam: 1,
        getNextPageParam: hasNext,
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

/** What needs the member now. Polled slowly; the live event and every mutation refresh it sooner. */
export function useMentorshipSummary(enabled = true) {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.summary(uid),
        queryFn: api.getSummary,
        enabled: enabled && !!user,
        staleTime: 30_000,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
    });
}

export function useMentorship(id: string) {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.detail(id, uid),
        queryFn: () => api.getMentorship(id),
        enabled: !!id && !!user,
        staleTime: 15_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

export function useMentorshipFeedback(id: string, enabled = true) {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.feedback(id, uid),
        queryFn: () => api.listMentorshipFeedback(id),
        enabled: enabled && !!id && !!user,
        staleTime: 30_000,
    });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

type MessagesData = InfiniteData<MessagePage, string | null>;

/**
 * Oldest first, across every loaded page (page 0 is the newest), then the messages that are still
 * being sent or failed to send. Those live apart from the fetched pages, so a refresh never drops them.
 */
export function flattenMessagePages(data: InfiniteData<MessagePage, unknown> | undefined, outbox: MentorshipMessage[] = []): MentorshipMessage[] {
    const out: MentorshipMessage[] = [];
    if (data) for (let i = data.pages.length - 1; i >= 0; i -= 1) out.push(...data.pages[i].data);
    for (const m of outbox) if (!out.some((x) => x._id === m._id)) out.push(m);
    return out;
}

const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * The chat, newest page first and older ones on request (`before` = the oldest loaded id). It
 * refreshes every 10 seconds while the tab is visible, or every 60 seconds while the live
 * connection is up (a pushed message refreshes it at once).
 */
export function useMessages(id: string, { enabled = true }: { enabled?: boolean } = {}) {
    const { uid, user } = useUserId();
    const { connected } = useNotificationSocket();
    return useInfiniteQuery({
        queryKey: mentorshipKeys.messages(id, uid),
        queryFn: ({ pageParam }) => api.listMessages(id, { before: pageParam, limit: 50 }),
        initialPageParam: null as string | null,
        getNextPageParam: (last: MessagePage) => (last.pagination.hasMore ? last.pagination.nextBefore : undefined),
        enabled: enabled && !!id && !!user,
        staleTime: 5_000,
        refetchInterval: () => (isVisible() ? (connected ? 60_000 : 10_000) : false),
        refetchIntervalInBackground: false,
    });
}

/** A message pushed over the socket goes straight into the cache; the lists and badge refresh */
export function useLiveMentorship(activeId?: string) {
    const { socket } = useNotificationSocket();
    const { uid } = useUserId();
    const qc = useQueryClient();
    useEffect(() => {
        if (!socket || !uid) return undefined;
        const onMessage = (event: { mentorshipId?: string; message?: MentorshipMessage }) => {
            const id = event?.mentorshipId;
            if (!id) return;
            if (event.message) pushMessage(qc, id, uid, event.message);
            qc.invalidateQueries({ queryKey: mentorshipKeys.summary(uid) });
            qc.invalidateQueries({ queryKey: mentorshipKeys.lists(uid) });
            if (id !== activeId) qc.invalidateQueries({ queryKey: mentorshipKeys.detail(id, uid) });
        };
        socket.on('mentorship:message', onMessage);
        return () => { socket.off('mentorship:message', onMessage); };
    }, [socket, uid, activeId, qc]);
}

function pushMessage(qc: QueryClient, id: string, uid: string | null, message: MentorshipMessage) {
    qc.setQueryData<MessagesData>(mentorshipKeys.messages(id, uid), (old) => {
        if (!old || !old.pages.length) return old;
        if (old.pages.some((p) => p.data.some((m) => m._id === message._id))) return old;
        const [first, ...rest] = old.pages;
        return { ...old, pages: [{ ...first, data: [...first.data, message] }, ...rest] };
    });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

interface MutationOptions {
    /** The dialog shows the error itself, so no toast */
    inline?: boolean;
}

function useFailureToast(inline?: boolean) {
    const { addToast } = useToast();
    return (err: unknown) => {
        if (!inline) addToast({ variant: 'error', message: mentorshipErrorMessage(err) });
    };
}

function useSuccessToast() {
    const { addToast } = useToast();
    return (message: string, title?: string) => addToast({ variant: 'success', message, ...(title ? { title } : {}) });
}

/** Everything about this member's mentoring is read again (after a change that can move many lists) */
function invalidateMine(qc: QueryClient) {
    qc.invalidateQueries({ queryKey: mentorshipKeys.all });
}

export function useRegisterMentor(options: MutationOptions = {}) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(options.inline);
    return useMutation({
        mutationFn: (input: MentorApplicationInput) => api.registerMentor(input),
        retry: 0,
        onSuccess: (profile) => {
            qc.setQueryData(mentorshipKeys.myProfile(uid), profile);
            qc.invalidateQueries({ queryKey: mentorshipKeys.eligibility(uid) });
        },
        onError: fail,
    });
}

export function useUpdateMentorProfile(options: MutationOptions = {}) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(options.inline);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: (input: Parameters<typeof api.updateMyMentorProfile>[0]) => api.updateMyMentorProfile(input),
        retry: 0,
        onSuccess: (profile) => {
            qc.setQueryData(mentorshipKeys.myProfile(uid), profile);
            qc.invalidateQueries({ queryKey: ['mentorship', 'mentors'] });
            ok('Your mentor profile was saved.');
        },
        onError: fail,
    });
}

/** Pause or resume the listing; the switch moves at once and goes back if the API refuses */
export function useToggleMentorPause() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast();
    const ok = useSuccessToast();
    return useMutation<unknown, unknown, { pause: boolean }, { previous: unknown }>({
        mutationFn: ({ pause }) => (pause ? api.pauseMentorProfile() : api.resumeMentorProfile()),
        retry: 0,
        onMutate: async ({ pause }) => {
            const key = mentorshipKeys.myProfile(uid);
            await qc.cancelQueries({ queryKey: key });
            const previous = qc.getQueryData(key);
            qc.setQueryData(key, (old: unknown) => (old ? { ...(old as object), isPaused: pause } : old));
            return { previous };
        },
        onError: (err, _v, ctx) => {
            qc.setQueryData(mentorshipKeys.myProfile(uid), ctx?.previous);
            fail(err);
        },
        onSuccess: (profile, { pause }) => {
            qc.setQueryData(mentorshipKeys.myProfile(uid), profile);
            qc.invalidateQueries({ queryKey: ['mentorship', 'mentors'] });
            ok(pause ? 'You will not get new requests until you resume.' : 'You are listed again.');
        },
    });
}

export function useCreateRequest(options: MutationOptions = {}) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(options.inline);
    return useMutation({
        mutationFn: (input: RequestInput) => api.createRequest(input),
        retry: 0,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: mentorshipKeys.requests(uid) });
            qc.invalidateQueries({ queryKey: mentorshipKeys.summary(uid) });
        },
        onError: fail,
    });
}

type RequestPages = InfiniteData<Page<MentorshipRequest>, number>;

function patchMyRequests(qc: QueryClient, uid: string | null, id: string, patch: (r: MentorshipRequest) => MentorshipRequest) {
    const entries = qc.getQueriesData<RequestPages>({ queryKey: [...mentorshipKeys.requests(uid), 'mine'] });
    for (const [key, data] of entries) {
        if (!data) continue;
        qc.setQueryData<RequestPages>(key, { ...data, pages: data.pages.map((p) => ({ ...p, data: p.data.map((r) => (r._id === id ? patch(r) : r)) })) });
    }
    return entries;
}

export function useCancelRequest() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast();
    const ok = useSuccessToast();
    return useMutation<unknown, unknown, { id: string }, { snapshot: [readonly unknown[], RequestPages | undefined][] }>({
        mutationFn: ({ id }) => api.cancelRequest(id),
        retry: 0,
        onMutate: async ({ id }) => {
            await qc.cancelQueries({ queryKey: mentorshipKeys.requests(uid) });
            return { snapshot: patchMyRequests(qc, uid, id, (r) => ({ ...r, status: 'cancelled' })) };
        },
        onError: (err, _v, ctx) => {
            for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
            fail(err);
        },
        onSuccess: () => ok('Your request was cancelled.'),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: mentorshipKeys.requests(uid) });
            qc.invalidateQueries({ queryKey: mentorshipKeys.summary(uid) });
        },
    });
}

export function useRenewRequest() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast();
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: ({ id }: { id: string }) => api.renewRequest(id),
        retry: 0,
        onSuccess: () => {
            ok('Your request was sent again.');
            qc.invalidateQueries({ queryKey: mentorshipKeys.requests(uid) });
            qc.invalidateQueries({ queryKey: mentorshipKeys.summary(uid) });
        },
        onError: fail,
    });
}

export function useInviteMentor() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast();
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: ({ requestId, mentorId }: { requestId: string; mentorId: string }) => api.inviteMentor(requestId, mentorId),
        retry: 0,
        onSuccess: () => {
            ok('The mentor was invited.');
            qc.invalidateQueries({ queryKey: mentorshipKeys.requests(uid) });
        },
        onError: fail,
    });
}

type IncomingPages = InfiniteData<Page<IncomingRequest>, number>;

export function useAcceptRequest() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast();
    return useMutation({
        mutationFn: ({ id }: { id: string }) => api.acceptRequest(id),
        retry: 0,
        onSuccess: ({ mentorship }) => {
            qc.setQueryData(mentorshipKeys.detail(mentorship._id, uid), mentorship);
            invalidateMine(qc);
        },
        onError: fail,
    });
}

export function useDeclineRequest(options: MutationOptions = {}) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(options.inline);
    const ok = useSuccessToast();
    return useMutation<unknown, unknown, { id: string; reason?: string }, { snapshot: [readonly unknown[], IncomingPages | undefined][] }>({
        mutationFn: ({ id, reason }) => api.declineRequest(id, reason),
        retry: 0,
        onMutate: async ({ id }) => {
            await qc.cancelQueries({ queryKey: mentorshipKeys.requests(uid) });
            const snapshot = qc.getQueriesData<IncomingPages>({ queryKey: [...mentorshipKeys.requests(uid), 'incoming'] });
            for (const [key, data] of snapshot) {
                if (data) qc.setQueryData<IncomingPages>(key, { ...data, pages: data.pages.map((p) => ({ ...p, data: p.data.filter((r) => r._id !== id) })) });
            }
            return { snapshot };
        },
        onError: (err, _v, ctx) => {
            for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
            fail(err);
        },
        onSuccess: () => ok('The request was declined.'),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: mentorshipKeys.requests(uid) });
            qc.invalidateQueries({ queryKey: mentorshipKeys.summary(uid) });
        },
    });
}

// --- the mentorship itself --------------------------------------------------

/** The pause and resume the page shows at once, from what the viewer block allows */
export const optimisticMentorship = {
    pause: (m: Mentorship): Mentorship => ({
        ...m, status: 'paused', pausedAt: new Date().toISOString(),
        viewer: { ...m.viewer, canPause: false, canResume: true, canSchedule: false, canMessage: false },
    }),
    resume: (m: Mentorship): Mentorship => ({
        ...m, status: 'active', pausedAt: null, pauseReason: null,
        viewer: { ...m.viewer, canPause: true, canResume: false, canSchedule: true, canMessage: true },
    }),
};

function setDetail(qc: QueryClient, uid: string | null, mentorship: Mentorship) {
    qc.setQueryData(mentorshipKeys.detail(mentorship._id, uid), mentorship);
    qc.invalidateQueries({ queryKey: mentorshipKeys.lists(uid) });
    qc.invalidateQueries({ queryKey: mentorshipKeys.summary(uid) });
}

export function useToggleMentorshipPause(id: string, options: MutationOptions = {}) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(options.inline);
    const ok = useSuccessToast();
    return useMutation<Mentorship, unknown, { pause: boolean; reason?: string }, { previous: Mentorship | undefined }>({
        mutationFn: ({ pause, reason }) => (pause ? api.pauseMentorship(id, reason) : api.resumeMentorship(id)),
        retry: 0,
        onMutate: async ({ pause }) => {
            const key = mentorshipKeys.detail(id, uid);
            await qc.cancelQueries({ queryKey: key });
            const previous = qc.getQueryData<Mentorship>(key);
            if (previous) qc.setQueryData<Mentorship>(key, pause ? optimisticMentorship.pause(previous) : optimisticMentorship.resume(previous));
            return { previous };
        },
        onError: (err, _v, ctx) => {
            qc.setQueryData(mentorshipKeys.detail(id, uid), ctx?.previous);
            fail(err);
        },
        onSuccess: (mentorship, { pause }) => {
            setDetail(qc, uid, mentorship);
            ok(pause ? 'The mentorship is paused.' : 'The mentorship is active again.');
        },
    });
}

export function useExtendMentorship(id: string, options: MutationOptions = {}) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(options.inline);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: ({ months }: { months: number }) => api.extendMentorship(id, months),
        retry: 0,
        onSuccess: (mentorship, { months }) => {
            setDetail(qc, uid, mentorship);
            qc.invalidateQueries({ queryKey: mentorshipKeys.sessions(uid) });
            ok(`The mentorship now runs ${months} ${months === 1 ? 'month' : 'months'} longer.`);
        },
        onError: fail,
    });
}

export function useCompleteMentorship(id: string, options: MutationOptions = {}) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(options.inline);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: (feedback: FinalFeedbackInput) => api.completeMentorship(id, feedback),
        retry: 0,
        onSuccess: ({ mentorship }) => {
            setDetail(qc, uid, mentorship);
            qc.invalidateQueries({ queryKey: mentorshipKeys.sessions(uid) });
            qc.invalidateQueries({ queryKey: mentorshipKeys.feedback(id, uid) });
            ok('The mentorship is completed. Thank you for taking part.');
        },
        onError: fail,
    });
}

export function useFinalFeedback(id: string, options: MutationOptions = {}) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(options.inline);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: (input: FinalFeedbackInput & { rating: number }) => api.submitFinalFeedback(id, input),
        retry: 0,
        onSuccess: () => {
            ok('Thank you for your feedback.');
            qc.invalidateQueries({ queryKey: mentorshipKeys.detail(id, uid) });
            qc.invalidateQueries({ queryKey: mentorshipKeys.feedback(id, uid) });
            qc.invalidateQueries({ queryKey: ['mentorship', 'mentors'] });
        },
        onError: fail,
    });
}

export function useReport(id: string) {
    const fail = useFailureToast(true);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: (input: { target: ReportTarget; reason: string; details?: string; messageId?: string }) => api.reportMentorship(id, input),
        retry: 0,
        onSuccess: () => ok('Thank you. Our team will review your report.', 'Report sent'),
        onError: fail,
    });
}

// --- chat -------------------------------------------------------------------

let pendingCounter = 0;

type Outbox = MentorshipMessage[];

function patchOutbox(qc: QueryClient, key: readonly unknown[], patch: (messages: Outbox) => Outbox) {
    qc.setQueryData<Outbox>(key, (old) => patch(old ?? []));
}

/** The messages of this chat that are still being sent or failed to send. Kept in their own query so polling cannot replace them. */
export function useOutbox(id: string): MentorshipMessage[] {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const key = mentorshipKeys.outbox(id, uid);
    const query = useQuery<Outbox>({
        queryKey: key,
        // Never fetched: a refresh of "everything mentorship" hands back what is already there
        queryFn: () => qc.getQueryData<Outbox>(key) ?? [],
        initialData: [],
        staleTime: Infinity,
        gcTime: 30 * 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    return query.data;
}

/** Sends a text or code message. It shows at once, and stays in the list marked as failed if the API says no. */
export function useSendMessage(id: string) {
    const qc = useQueryClient();
    const { uid, user } = useUserId();
    const fail = useFailureToast();
    const outbox = mentorshipKeys.outbox(id, uid);
    return useMutation<MentorshipMessage, unknown, { content: string; contentType: 'text' | 'code'; codeLanguage?: string; retryOf?: string }, { tempId: string }>({
        mutationFn: ({ content, contentType, codeLanguage }) => api.sendMessage(id, { content, contentType, codeLanguage }),
        retry: 0,
        onMutate: (v) => {
            const tempId = v.retryOf ?? `pending-${Date.now()}-${pendingCounter += 1}`;
            const sender = { _id: user?.id ?? '', username: user?.username ?? '', name: user?.name, avatar: user?.avatar ?? null };
            const temp = optimisticMessage({ id: tempId, sender, channel: '', content: v.content, contentType: v.contentType, codeLanguage: v.codeLanguage });
            patchOutbox(qc, outbox, (list) => (list.some((m) => m._id === tempId) ? list.map((m) => (m._id === tempId ? temp : m)) : [...list, temp]));
            return { tempId };
        },
        onSuccess: (message, _v, ctx) => {
            // Swap in the saved message, so it does not flash out between the two lists
            pushMessage(qc, id, uid, message);
            patchOutbox(qc, outbox, (list) => list.filter((m) => m._id !== ctx?.tempId));
            qc.invalidateQueries({ queryKey: mentorshipKeys.lists(uid) });
        },
        onError: (err, _v, ctx) => {
            patchOutbox(qc, outbox, (list) => list.map((m) => (m._id === ctx?.tempId ? { ...m, pending: 'failed' as const } : m)));
            fail(err);
        },
    });
}

/** Drops a message that failed to send */
export function useDiscardMessage(id: string) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    return (messageId: string) => patchOutbox(qc, mentorshipKeys.outbox(id, uid), (list) => list.filter((m) => m._id !== messageId));
}

/** Uploads a file, then posts it to the chat */
export function useSendFile(id: string) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast();
    return useMutation({
        mutationFn: async ({ file }: { file: File }) => {
            const uploaded = await api.uploadChatFile(file);
            // What the upload service stored is what the chat records, not what the browser claimed
            return api.sendFileMessage(id, { filename: uploaded.filename || file.name, url: uploaded.url, size: uploaded.size || file.size, mimeType: uploaded.mimetype || file.type });
        },
        retry: 0,
        onSuccess: (message) => {
            if (uid) pushMessage(qc, id, uid, message);
            qc.invalidateQueries({ queryKey: mentorshipKeys.lists(uid) });
        },
        onError: fail,
    });
}

/** Marks the other person's messages read and clears the badges, once per batch of new messages */
export function useMarkRead(id: string, unread: number, active: boolean) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const sent = useRef(0);
    useEffect(() => {
        // Nothing unread: the next batch of new messages, of any size, is marked again
        if (unread <= 0) { sent.current = 0; return; }
        if (!active || !uid || sent.current === unread) return;
        sent.current = unread;
        api.markMessagesRead(id).then(() => {
            qc.setQueryData<Mentorship>(mentorshipKeys.detail(id, uid), (old) => (old ? { ...old, unreadMessages: 0 } : old));
            qc.invalidateQueries({ queryKey: mentorshipKeys.summary(uid) });
            qc.invalidateQueries({ queryKey: mentorshipKeys.lists(uid) });
        }).catch(() => {
            // The next poll tries again
            sent.current = 0;
        });
    }, [id, unread, active, uid, qc]);
}

// --- sessions ---------------------------------------------------------------

export function useSessions(id: string, scope: 'upcoming' | 'past' | 'all' = 'all') {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.sessionList(id, scope, uid),
        queryFn: () => api.listSessions(id, { scope, limit: 50 }),
        enabled: !!id && !!user,
        staleTime: 15_000,
    });
}

export function useUpcomingSessions(limit = 5, enabled = true) {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: [...mentorshipKeys.upcoming(uid), limit],
        queryFn: () => api.listUpcomingSessions(limit),
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

export function usePendingFeedback(enabled = true) {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.pendingFeedback(uid),
        queryFn: () => api.listPendingFeedback(20),
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

function refreshSessions(qc: QueryClient, uid: string | null) {
    qc.invalidateQueries({ queryKey: mentorshipKeys.sessions(uid) });
    qc.invalidateQueries({ queryKey: mentorshipKeys.summary(uid) });
}

export function useCreateSession(mentorshipId: string) {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(true);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: (input: SessionInput) => api.createSession(mentorshipId, input),
        retry: 0,
        onSuccess: (session) => {
            refreshSessions(qc, uid);
            ok(session.warnings?.includes('outside_mentor_availability')
                ? 'The session is scheduled. It is outside the mentor\'s usual hours, which is only a hint.'
                : 'The session is scheduled. The other person was told.');
        },
        onError: fail,
    });
}

export function useUpdateSession() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(true);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<SessionInput> }) => api.updateSession(id, input),
        retry: 0,
        onSuccess: () => {
            refreshSessions(qc, uid);
            ok('The session was updated. The other person was told.');
        },
        onError: fail,
    });
}

type SessionPage = Page<MentorshipSession>;

export function useCancelSession() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(true);
    const ok = useSuccessToast();
    return useMutation<MentorshipSession, unknown, { id: string; reason: string }, { snapshot: [readonly unknown[], SessionPage | undefined][] }>({
        mutationFn: ({ id, reason }) => api.cancelSession(id, reason),
        retry: 0,
        onMutate: async ({ id, reason }) => {
            await qc.cancelQueries({ queryKey: mentorshipKeys.sessions(uid) });
            const snapshot = qc.getQueriesData<SessionPage>({ queryKey: mentorshipKeys.sessions(uid) });
            for (const [key, data] of snapshot) {
                if (data && Array.isArray(data.data)) {
                    qc.setQueryData<SessionPage>(key, {
                        ...data,
                        data: data.data.map((s) => (s._id === id ? { ...s, status: 'cancelled' as const, cancelReason: reason, viewer: { ...s.viewer, canCancel: false, canReschedule: false, canComplete: false } } : s)),
                    });
                }
            }
            return { snapshot };
        },
        onError: (err, _v, ctx) => {
            for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
            fail(err);
        },
        onSuccess: () => ok('The session was cancelled. The other person was told.'),
        onSettled: () => refreshSessions(qc, uid),
    });
}

export function useCompleteSession() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast();
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: ({ id, ...input }: { id: string; actualDuration?: number; notes?: string }) => api.completeSession(id, input),
        retry: 0,
        onSuccess: () => {
            refreshSessions(qc, uid);
            qc.invalidateQueries({ queryKey: mentorshipKeys.details(uid) });
            ok('The session is marked as held. You are both asked for feedback.');
        },
        onError: fail,
    });
}

export function useSaveSessionNotes() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(true);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: ({ id, notes }: { id: string; notes: string }) => api.saveSessionNotes(id, notes),
        retry: 0,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: mentorshipKeys.sessions(uid) });
            ok('Your notes were saved. Only you can see them.');
        },
        onError: fail,
    });
}

export function useSessionFeedback() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(true);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: ({ id, ...input }: { id: string; rating: number; comment?: string; shareName?: boolean }) => api.submitSessionFeedback(id, input),
        retry: 0,
        onSuccess: () => {
            refreshSessions(qc, uid);
            qc.invalidateQueries({ queryKey: ['mentorship', 'feedback'] });
            ok('Thank you for your feedback.');
        },
        onError: fail,
    });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export function useMentorApplications(status: MentorStatus | 'all', enabled = true) {
    const { uid, user } = useUserId();
    return useInfiniteQuery({
        queryKey: mentorshipKeys.applications({ status }, uid),
        queryFn: ({ pageParam }) => api.listMentorApplications({ status, page: pageParam, limit: LIST_PAGE }),
        initialPageParam: 1,
        getNextPageParam: hasNext,
        enabled: enabled && !!user,
        staleTime: 15_000,
    });
}

export function useReviewMentor() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(true);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: ({ id, ...input }: { id: string; decision: 'approve' | 'reject' | 'suspend'; note?: string; endMentorships?: boolean }) => api.reviewMentor(id, input),
        retry: 0,
        onSuccess: (_profile, { decision }) => {
            ok(decision === 'approve' ? 'The mentor is approved and listed.' : decision === 'reject' ? 'The application was rejected.' : 'The mentor was suspended.');
            qc.invalidateQueries({ queryKey: ['mentorship', 'admin', uid] });
            qc.invalidateQueries({ queryKey: ['mentorship', 'mentors'] });
        },
        onError: fail,
    });
}

export function useAdminMentorships(status: string, enabled = true) {
    const { uid, user } = useUserId();
    return useInfiniteQuery({
        queryKey: mentorshipKeys.adminMentorships({ status }, uid),
        queryFn: ({ pageParam }) => api.listAdminMentorships({ status, page: pageParam, limit: LIST_PAGE }),
        initialPageParam: 1,
        getNextPageParam: hasNext,
        enabled: enabled && !!user,
        staleTime: 15_000,
    });
}

export function useTerminateMentorship() {
    const qc = useQueryClient();
    const { uid } = useUserId();
    const fail = useFailureToast(true);
    const ok = useSuccessToast();
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => api.terminateMentorship(id, reason),
        retry: 0,
        onSuccess: () => {
            ok('The mentorship was ended. Both people were told.');
            qc.invalidateQueries({ queryKey: ['mentorship', 'admin', uid] });
        },
        onError: fail,
    });
}

export function useReportedMessages(enabled = true) {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.reported(uid),
        queryFn: () => api.listReportedMessages(1, 50),
        enabled: enabled && !!user,
        staleTime: 15_000,
    });
}

export function useReportContext(flagId: string | null) {
    const { uid, user } = useUserId();
    return useQuery({
        queryKey: mentorshipKeys.context(flagId ?? '', uid),
        queryFn: () => api.getReportContext(flagId as string),
        enabled: !!flagId && !!user,
        // Every view is written to the audit log: read it once per open
        staleTime: Infinity,
        gcTime: 0,
        retry: false,
    });
}

export type { MentorshipSummary };
