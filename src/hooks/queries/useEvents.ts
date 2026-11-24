import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api/events';
import { eventErrorMessage } from '@/lib/events/errors';
import type {
    EventDetail, EventListFilters, EventPage, EventViewer, RegistrationResult, ReminderOffset,
} from '@/types/event';

/** One place for every events query key, so a change can invalidate by prefix */
export const eventKeys = {
    all: ['events'] as const,
    lists: () => ['events', 'list'] as const,
    list: (filters: EventListFilters) => ['events', 'list', filters] as const,
    detail: (slug: string, userId: string | null = null) => ['events', 'detail', slug, userId] as const,
    details: () => ['events', 'detail'] as const,
    mine: () => ['events', 'mine'] as const,
    registrations: (params: object) => ['events', 'mine', 'registrations', params] as const,
    submissions: (params: object) => ['events', 'mine', 'submitted', params] as const,
    queue: (params: object) => ['events', 'queue', params] as const,
    feedback: (id: string) => ['events', 'feedback', id] as const,
    attendees: (id: string, params: object) => ['events', 'attendees', id, params] as const,
    /** Public data, the same for everyone: no viewer in the key */
    calendars: () => ['events', 'calendar'] as const,
    calendar: (range: { from: string; to: string }, category: string) => ['events', 'calendar', range.from, range.to, category] as const,
    archives: (filters: object) => ['events', 'archives', filters] as const,
    /** The answer depends on who is asking, so the member is in the key */
    calendarToken: (userId: string | null) => ['events', 'calendar-token', userId] as const,
    series: (id: string, userId: string | null = null) => ['events', 'series', id, userId] as const,
    seriesAll: () => ['events', 'series'] as const,
};

const PAGE_SIZE = 12;

/** The public list with "load more". `filters.page` is ignored: the pages are the query's own. */
export function useEventList(filters: EventListFilters, { enabled = true }: { enabled?: boolean } = {}) {
    const { user, loading } = useAuth();
    const base = { limit: PAGE_SIZE, ...filters, page: undefined };
    return useInfiniteQuery({
        queryKey: [...eventKeys.list(base), user?.id ?? null],
        queryFn: ({ pageParam }) => api.listEvents({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (last: EventPage) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined),
        // The viewer block needs the token, so wait until the session is known
        enabled: enabled && !loading,
        staleTime: 60_000,
    });
}

/** A single page of a list (the calendar month, the review queue) */
export function useEventPage(filters: EventListFilters, { enabled = true, key = 'page' }: { enabled?: boolean; key?: string } = {}) {
    const { user, loading } = useAuth();
    return useQuery({
        queryKey: ['events', 'list', key, filters, user?.id ?? null],
        queryFn: () => api.listEvents(filters),
        enabled: enabled && !loading,
        staleTime: 60_000,
    });
}

/**
 * One event with the viewer block. `initialData` (rendered on the server without a login) is treated
 * as already stale, so a signed-in visitor always refetches with their token.
 */
export function useEvent(slug: string, initialData?: EventDetail | null) {
    const { user, loading } = useAuth();
    return useQuery({
        queryKey: eventKeys.detail(slug, user?.id ?? null),
        queryFn: () => api.getEvent(slug),
        enabled: !!slug && !loading,
        initialData: initialData ?? undefined,
        initialDataUpdatedAt: 0,
        staleTime: 30_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

export function useMyRegistrations(params: { status?: 'registered' | 'waitlisted' | 'attended'; scope?: 'upcoming' | 'past' | 'all' }, enabled = true) {
    const { user } = useAuth();
    return useInfiniteQuery({
        queryKey: [...eventKeys.registrations(params), user?.id ?? null],
        queryFn: ({ pageParam }) => api.listMyRegistrations({ ...params, page: pageParam, limit: PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: (last: EventPage) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined),
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

export function useMySubmissions(enabled = true) {
    const { user } = useAuth();
    return useInfiniteQuery({
        queryKey: [...eventKeys.submissions({}), user?.id ?? null],
        queryFn: ({ pageParam }) => api.listMySubmissions({ page: pageParam, limit: PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: (last: EventPage) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined),
        enabled: enabled && !!user,
        staleTime: 30_000,
    });
}

// ---------------------------------------------------------------------------
// Registration, with the answer shown at once and undone if the API says no
// ---------------------------------------------------------------------------

type DetailSnapshot = [readonly unknown[], EventDetail | undefined][];

/** The cached detail of this event (any viewer), as [key, data] pairs */
function detailEntries(qc: QueryClient, slug: string): DetailSnapshot {
    return qc.getQueriesData<EventDetail>({ queryKey: [...eventKeys.details(), slug] });
}

type Patch = (event: EventDetail) => EventDetail;

async function applyOptimistic(qc: QueryClient, slug: string, patch: Patch): Promise<DetailSnapshot> {
    await qc.cancelQueries({ queryKey: [...eventKeys.details(), slug] });
    const snapshot = detailEntries(qc, slug);
    for (const [key, data] of snapshot) {
        if (data) qc.setQueryData<EventDetail>(key, patch(data));
    }
    return snapshot;
}

function rollback(qc: QueryClient, snapshot: DetailSnapshot | undefined) {
    for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

const withViewer = (event: EventDetail, viewer: Partial<EventViewer>): EventViewer => ({
    registered: false, waitlisted: false, attended: false, position: null, reminder: null,
    canRegister: false, canJoinWaitlist: false, canFeedback: false, hasFeedback: false, joinOpensAt: null, canManage: false,
    ...event.viewer,
    ...viewer,
});

const spots = (event: EventDetail, delta: number) =>
    event.spotsLeft === null || event.spotsLeft === undefined ? null : Math.max(0, event.spotsLeft + delta);

/** What the page shows while the register call is in flight */
export const optimistic = {
    register: (event: EventDetail): EventDetail => {
        const viewer = event.viewer;
        const toWaitlist = event.isFull ? event.waitlistEnabled : !!viewer && !viewer.canRegister && viewer.canJoinWaitlist;
        if (toWaitlist) {
            return { ...event, waitlistCount: event.waitlistCount + 1, viewer: withViewer(event, { waitlisted: true, position: event.waitlistCount + 1, canJoinWaitlist: false, canRegister: false }) };
        }
        const left = spots(event, -1);
        return {
            ...event,
            registeredCount: event.registeredCount + 1,
            spotsLeft: left,
            isFull: left === 0,
            viewer: withViewer(event, { registered: true, waitlisted: false, position: null, canRegister: false, canJoinWaitlist: false }),
        };
    },
    unregister: (event: EventDetail): EventDetail => {
        const left = spots(event, 1);
        return {
            ...event,
            registeredCount: Math.max(0, event.registeredCount - 1),
            spotsLeft: left,
            isFull: false,
            joinLink: null,
            viewer: withViewer(event, { registered: false, reminder: null, canRegister: true, canJoinWaitlist: false }),
        };
    },
    joinWaitlist: (event: EventDetail): EventDetail => ({
        ...event,
        waitlistCount: event.waitlistCount + 1,
        viewer: withViewer(event, { waitlisted: true, position: event.waitlistCount + 1, canJoinWaitlist: false }),
    }),
    leaveWaitlist: (event: EventDetail): EventDetail => ({
        ...event,
        waitlistCount: Math.max(0, event.waitlistCount - 1),
        viewer: withViewer(event, { waitlisted: false, position: null, canJoinWaitlist: event.waitlistEnabled }),
    }),
    reminder: (offset: ReminderOffset | null): Patch => (event) => ({
        ...event,
        viewer: withViewer(event, {
            reminder: offset === null ? null : {
                offsetMinutes: offset,
                remindAt: new Date(new Date(event.startDate).getTime() - offset * 60_000).toISOString(),
                sent: false,
            },
        }),
    }),
};

interface Target { id: string; slug: string }

function useRegistrationMutation<V extends Target, R>(
    run: (v: V) => Promise<R>,
    patch: Patch,
    messages: { success?: (result: R) => string | null },
) {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<R, unknown, V, { snapshot: DetailSnapshot }>({
        mutationFn: run,
        retry: 0,
        onMutate: async (v) => ({ snapshot: await applyOptimistic(qc, v.slug, patch) }),
        onError: (err, _v, ctx) => {
            rollback(qc, ctx?.snapshot);
            addToast({ variant: 'error', message: eventErrorMessage(err) });
        },
        onSuccess: (result) => {
            const message = messages.success?.(result);
            if (message) addToast({ variant: 'success', message });
        },
        // The server is the truth: counts, position and the join link come back with the refetch
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: eventKeys.all });
        },
    });
}

export function useRegisterForEvent() {
    return useRegistrationMutation<Target & { shareActivity?: boolean }, RegistrationResult>(
        (v) => api.registerForEvent(v.id, { shareActivity: v.shareActivity }),
        optimistic.register,
        {
            success: (r) => (r.status === 'waitlisted'
                ? `You are on the waiting list${r.position ? ` at position ${r.position}` : ''}.`
                : 'You are registered. See you there!'),
        },
    );
}

export function useUnregisterFromEvent() {
    return useRegistrationMutation<Target, void>((v) => api.unregisterFromEvent(v.id), optimistic.unregister, {
        success: () => 'Your registration was cancelled.',
    });
}

export function useJoinWaitlist() {
    return useRegistrationMutation<Target, RegistrationResult>((v) => api.joinWaitlist(v.id), optimistic.joinWaitlist, {
        success: (r) => (r.status === 'registered' ? 'A seat was free, so you are registered.' : `You are on the waiting list${r.position ? ` at position ${r.position}` : ''}.`),
    });
}

export function useLeaveWaitlist() {
    return useRegistrationMutation<Target, void>((v) => api.leaveWaitlist(v.id), optimistic.leaveWaitlist, {
        success: () => 'You left the waiting list.',
    });
}

export function useSetReminder() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation<void, unknown, Target & { offsetMinutes: ReminderOffset | null }, { snapshot: DetailSnapshot }>({
        mutationFn: (v) => api.setReminder(v.id, v.offsetMinutes),
        retry: 0,
        onMutate: async (v) => ({ snapshot: await applyOptimistic(qc, v.slug, optimistic.reminder(v.offsetMinutes)) }),
        onError: (err, _v, ctx) => {
            rollback(qc, ctx?.snapshot);
            addToast({ variant: 'error', message: eventErrorMessage(err) });
        },
        onSuccess: (_r, v) => {
            addToast({ variant: 'success', message: v.offsetMinutes === null ? 'Reminder turned off.' : `We will remind you ${v.offsetMinutes === 60 ? '1 hour' : '1 day'} before.` });
        },
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: eventKeys.all });
        },
    });
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function useEventFeedback(id: string | undefined, enabled = true) {
    return useQuery({
        queryKey: eventKeys.feedback(id ?? ''),
        queryFn: () => api.getEventFeedback(id as string),
        enabled: !!id && enabled,
        staleTime: 60_000,
    });
}

export function useSubmitEventFeedback() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation({
        mutationFn: (v: { id: string; rating: number; comment?: string }) => api.submitEventFeedback(v.id, v),
        retry: 0,
        onSuccess: () => {
            addToast({ variant: 'success', message: 'Thanks for your feedback.' });
            void qc.invalidateQueries({ queryKey: eventKeys.all });
        },
        onError: (err) => addToast({ variant: 'error', message: eventErrorMessage(err) }),
    });
}

// ---------------------------------------------------------------------------
// Submit, edit, review, organize. The calling form shows the error itself, so these only invalidate.
// ---------------------------------------------------------------------------

export function useCreateEvent() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: Record<string, unknown>) => api.createEvent(payload),
        retry: 0,
        onSuccess: () => void qc.invalidateQueries({ queryKey: eventKeys.all }),
    });
}

export function useUpdateEvent() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { id: string; payload: Record<string, unknown> }) => api.updateEvent(v.id, v.payload),
        retry: 0,
        onSuccess: () => void qc.invalidateQueries({ queryKey: eventKeys.all }),
    });
}

/** Reviewers: pending submissions (or any stored status) */
export function useReviewQueue(status: string, enabled = true, extra: EventListFilters = {}) {
    const { user } = useAuth();
    return useInfiniteQuery({
        queryKey: [...eventKeys.queue({ status, ...extra }), user?.id ?? null],
        queryFn: ({ pageParam }) => api.listEvents({ ...(status ? { status: status as EventListFilters['status'] } : { scope: 'all' }), ...extra, sort: status === 'pending' ? 'createdAt' : '-startDate', limit: 20, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (last: EventPage) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined),
        enabled: enabled && !!user,
        staleTime: 15_000,
    });
}

function useModeration<V>(run: (v: V) => Promise<unknown>, success: string) {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation({
        mutationFn: run,
        retry: 0,
        onSuccess: () => {
            addToast({ variant: 'success', message: success });
            void qc.invalidateQueries({ queryKey: eventKeys.all });
        },
        onError: (err) => addToast({ variant: 'error', message: eventErrorMessage(err) }),
    });
}

export const useApproveEvent = () => useModeration((v: { id: string }) => api.approveEvent(v.id), 'Event approved. The submitter was notified.');
export const useRejectEvent = () => useModeration((v: { id: string; reason: string }) => api.rejectEvent(v.id, v.reason), 'Event rejected. The submitter was notified.');
export const useCancelEvent = () => useModeration((v: { id: string; reason: string }) => api.cancelEvent(v.id, v.reason), 'Event cancelled. Registered members were notified.');
export const useDeleteEvent = () => useModeration((v: { id: string }) => api.deleteEvent(v.id), 'Event deleted.');
export const useToggleFeatured = () => useModeration((v: { id: string; featured: boolean }) => api.updateEvent(v.id, { isFeatured: v.featured }), 'Event updated.');

const ATTENDEE_PAGE = 50;

/** One status of an event's attendees, a page at a time */
export function useEventAttendees(id: string | undefined, params: { status?: 'registered' | 'waitlisted' | 'attended' } = {}, enabled = true) {
    return useInfiniteQuery({
        queryKey: eventKeys.attendees(id ?? '', params),
        queryFn: ({ pageParam }) => api.listAttendees(id as string, { ...params, page: pageParam, limit: ATTENDEE_PAGE }),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.pagination.hasMore ? last.pagination.page + 1 : undefined),
        enabled: !!id && enabled,
        staleTime: 15_000,
    });
}

export function useMarkAttendance() {
    const qc = useQueryClient();
    const { addToast } = useToast();
    return useMutation({
        mutationFn: (v: { id: string; userIds: string[] }) => api.markAttendance(v.id, v.userIds),
        retry: 0,
        onSuccess: (result) => {
            const parts = [`${result.marked.length} marked as attended`];
            if (result.alreadyMarked.length) parts.push(`${result.alreadyMarked.length} already marked`);
            if (result.notRegistered.length) parts.push(`${result.notRegistered.length} not registered`);
            addToast({ variant: result.marked.length ? 'success' : 'info', message: `${parts.join(', ')}.` });
            void qc.invalidateQueries({ queryKey: ['events', 'attendees'] });
            void qc.invalidateQueries({ queryKey: eventKeys.details() });
        },
        onError: (err) => addToast({ variant: 'error', message: eventErrorMessage(err) }),
    });
}
