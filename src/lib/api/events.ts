import { API_URL, fetchApi } from '@/lib/api';
import type {
    ArchiveFilters, ArchivePage, AttendanceResult, AttendanceUndoResult, Attendee, AttendeesExport, CalendarQuery,
    CalendarResult, CalendarTokenCreated, CalendarTokenStatus, EventDetail, EventFeedbackPage, EventListFilters,
    EventPage, RegistrationResult, ReminderOffset, Series, SeriesCreated, SeriesEnded, SeriesPatchResult,
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


// ---------------------------------------------------------------------------
// Calendar, archive and calendar files
// ---------------------------------------------------------------------------

/** The rows a CSV export holds at most (the API stops here and says so) */
export const EXPORT_ROW_LIMIT = 5000;

function calendarParams(query: CalendarQuery): URLSearchParams {
    const params = new URLSearchParams();
    params.set('from', query.from);
    params.set('to', query.to);
    if (query.category) params.set('category', query.category);
    if (query.limit) params.set('limit', String(query.limit));
    return params;
}

/** A public, cached read: no token is sent, so everyone gets the same answer */
export async function getCalendar(query: CalendarQuery): Promise<CalendarResult> {
    const res = await fetchApi(`/api/events/calendar?${calendarParams(query).toString()}`, { requireAuth: false });
    return { items: res.data ?? [], meta: res.meta };
}

/** The range as a calendar file. A plain link: the browser downloads it, nothing here builds the file. */
export function calendarIcsUrl(query: CalendarQuery): string {
    return `${API_URL}/api/events/calendar.ics?${calendarParams(query).toString()}`;
}

/** One event as a calendar file */
export function eventIcsUrl(slug: string): string {
    return `${API_URL}/api/events/${encodeURIComponent(slug)}/ics`;
}

/** The same address for calendar apps that subscribe (`webcal://` is `https://` that opens the app) */
export function webcalUrl(url: string): string {
    return url.replace(/^https?:/i, 'webcal:');
}

function archiveParams(filters: ArchiveFilters & { page?: number }): string {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.q?.trim()) params.set('q', filters.q.trim());
    if (filters.page && filters.page > 1) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

export function listArchives(filters: ArchiveFilters & { page?: number } = {}): Promise<ArchivePage> {
    return fetchApi(`/api/events/archives${archiveParams(filters)}`, { requireAuth: false });
}

// ---------------------------------------------------------------------------
// The member's private calendar feed
// ---------------------------------------------------------------------------

export async function getCalendarTokenStatus(): Promise<CalendarTokenStatus> {
    return (await fetchApi('/api/events/me/calendar-token')).data;
}

/** Creates the feed address, or replaces it (the old one stops working). The URL is in this answer only. */
export async function createCalendarToken(): Promise<CalendarTokenCreated> {
    return (await post('/api/events/me/calendar-token')).data;
}

export async function revokeCalendarToken(): Promise<void> {
    await fetchApi('/api/events/me/calendar-token', { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/** The token is sent when there is one: the creator and administrators get more than the public */
export async function getSeries(id: string, limit?: number): Promise<Series> {
    const qs = limit ? `?limit=${limit}` : '';
    return (await fetchApi(`/api/events/series/${encodeURIComponent(id)}${qs}`)).data;
}

export async function createSeries(payload: Record<string, unknown>): Promise<SeriesCreated> {
    return (await post('/api/events/series', payload)).data;
}

export async function patchSeries(id: string, payload: Record<string, unknown>): Promise<SeriesPatchResult> {
    return (await fetchApi(`/api/events/series/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) })).data;
}

export async function pauseSeries(id: string): Promise<Series> {
    return (await post(`/api/events/series/${encodeURIComponent(id)}/pause`)).data;
}

export async function resumeSeries(id: string): Promise<Series> {
    return (await post(`/api/events/series/${encodeURIComponent(id)}/resume`)).data;
}

export async function endSeries(id: string, reason?: string): Promise<SeriesEnded> {
    return (await post(`/api/events/series/${encodeURIComponent(id)}/end`, reason ? { reason } : {})).data;
}

// ---------------------------------------------------------------------------
// Organizer exports
// ---------------------------------------------------------------------------

/** A file name that is safe on any system, from a slug */
export function exportFilename(slug: string): string {
    const clean = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
    return `${clean || 'event'}-attendees.csv`;
}

/**
 * The attendee list as a file. The call needs the member's token, so it is fetched with it (never a
 * link with the token in the address) and handed back as a Blob for the caller to save.
 *
 * The API says `X-Export-Truncated: true` when it stopped at the row limit. A browser only sees that
 * header when the API lists it in `Access-Control-Expose-Headers`; when it cannot be read, a file with
 * as many rows as the limit counts as cut off.
 */
export async function exportAttendees(id: string, slug: string): Promise<AttendeesExport> {
    const res = (await fetchApi(`/api/events/${encodeURIComponent(id)}/attendees.csv`, {
        raw: true,
        headers: { Accept: 'text/csv' },
    })) as Response;
    const blob = await res.blob();
    const header = res.headers.get('X-Export-Truncated');
    const text = await blob.text();
    // The header line is not a row; every cell is quoted and has no line break inside
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    const rows = Math.max(0, lines.length - 1);
    const truncated = header === null ? rows >= EXPORT_ROW_LIMIT : header === 'true';
    return { blob, filename: exportFilename(slug), truncated, rows };
}

export async function undoAttendance(id: string, userIds: string[]): Promise<AttendanceUndoResult> {
    return (await post(`/api/events/${encodeURIComponent(id)}/attendance/undo`, { userIds })).data;
}
