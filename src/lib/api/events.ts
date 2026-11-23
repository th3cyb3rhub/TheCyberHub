import { fetchApi } from '@/lib/api';
import type {
    AttendanceResult, Attendee, EventDetail, EventFeedbackPage, EventListFilters, EventPage, RegistrationResult,
    ReminderOffset,
} from '@/types/event';

/** Query string for the list endpoints. Empty values are left out; page 1 and the default scope are implied. */
export function eventListQuery(filters: EventListFilters = {}): string {
    const params = new URLSearchParams();
    const set = (key: string, value: unknown) => {
        if (value === undefined || value === null || value === '' || value === false) return;
        params.set(key, String(value));
    };
    if (filters.scope && filters.scope !== 'upcoming') set('scope', filters.scope);
    set('category', filters.category);
    set('format', filters.format);
    set('eventType', filters.eventType);
    set('featured', filters.featured);
    set('q', filters.q?.trim());
    set('from', filters.from);
    set('to', filters.to);
    set('status', filters.status);
    set('sort', filters.sort);
    if (filters.page && filters.page > 1) set('page', filters.page);
    set('limit', filters.limit);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

/** Public, but the token is sent when there is one so every event carries the viewer block (and reviewers get more) */
export function listEvents(filters: EventListFilters = {}): Promise<EventPage> {
    return fetchApi(`/api/events${eventListQuery(filters)}`);
}

export async function getEvent(slugOrId: string): Promise<EventDetail> {
    const res = await fetchApi(`/api/events/${encodeURIComponent(slugOrId)}`);
    return res.data;
}

export function listMyRegistrations(params: { status?: 'registered' | 'waitlisted' | 'attended'; scope?: 'upcoming' | 'past' | 'all'; page?: number; limit?: number } = {}): Promise<EventPage> {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.scope) qs.set('scope', params.scope);
    if (params.page && params.page > 1) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const s = qs.toString();
    return fetchApi(`/api/events/my-registrations${s ? `?${s}` : ''}`);
}

export function listMySubmissions(params: { status?: string; page?: number; limit?: number } = {}): Promise<EventPage> {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.page && params.page > 1) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const s = qs.toString();
    return fetchApi(`/api/events/mine/submitted${s ? `?${s}` : ''}`);
}

const post = (path: string, body?: unknown) =>
    fetchApi(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** `shareActivity: false` keeps the registration out of the activity feed (the API default is to share) */
export async function registerForEvent(id: string, options: { shareActivity?: boolean } = {}): Promise<RegistrationResult> {
    const body = options.shareActivity === undefined ? undefined : { shareActivity: options.shareActivity };
    return (await post(`/api/events/${id}/register`, body)).data;
}

export async function unregisterFromEvent(id: string): Promise<void> {
    await fetchApi(`/api/events/${id}/register`, { method: 'DELETE' });
}

export async function joinWaitlist(id: string): Promise<RegistrationResult> {
    return (await post(`/api/events/${id}/waitlist`)).data;
}

export async function leaveWaitlist(id: string): Promise<void> {
    await fetchApi(`/api/events/${id}/waitlist`, { method: 'DELETE' });
}

/** An offset sets the reminder; null turns it off */
export async function setReminder(id: string, offsetMinutes: ReminderOffset | null): Promise<void> {
    if (offsetMinutes === null) await fetchApi(`/api/events/${id}/remind`, { method: 'DELETE' });
    else await post(`/api/events/${id}/remind`, { offsetMinutes });
}

export async function getEventFeedback(id: string, page = 1, limit = 10): Promise<EventFeedbackPage> {
    const res = await fetchApi(`/api/events/${id}/feedback?page=${page}&limit=${limit}`, { requireAuth: false });
    return res.data;
}

export async function submitEventFeedback(id: string, input: { rating: number; comment?: string }): Promise<void> {
    await post(`/api/events/${id}/feedback`, { rating: input.rating, comment: input.comment?.trim() || undefined });
}

export async function createEvent(payload: Record<string, unknown>): Promise<EventDetail> {
    return (await post('/api/events', payload)).data;
}

export async function updateEvent(id: string, payload: Record<string, unknown>): Promise<EventDetail> {
    return (await fetchApi(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) })).data;
}

export async function deleteEvent(id: string): Promise<void> {
    await fetchApi(`/api/events/${id}`, { method: 'DELETE' });
}

export async function approveEvent(id: string): Promise<EventDetail> {
    return (await post(`/api/events/${id}/approve`)).data;
}

export async function rejectEvent(id: string, reason: string): Promise<EventDetail> {
    return (await post(`/api/events/${id}/reject`, { reason })).data;
}

export async function cancelEvent(id: string, reason: string): Promise<EventDetail> {
    return (await post(`/api/events/${id}/cancel`, { reason })).data;
}

export function listAttendees(id: string, params: { status?: string; page?: number; limit?: number } = {}): Promise<{ data: Attendee[]; pagination: { page: number; limit: number; total: number; pages: number; hasMore: boolean } }> {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    qs.set('page', String(params.page ?? 1));
    qs.set('limit', String(params.limit ?? 50));
    return fetchApi(`/api/events/${id}/attendees?${qs.toString()}`);
}

export async function markAttendance(id: string, userIds: string[]): Promise<AttendanceResult> {
    return (await post(`/api/events/${id}/attendance`, { userIds })).data;
}

