import { API_URL, ApiError, fetchApi, tokenStore } from '@/lib/api';
import { fenceCode } from '@/lib/mentorship/chat';
import type {
    ExpertiseArea, FeedbackRow, IncomingRequest, Mentor, MentorApplication, MentorEligibility, MentorListFilters, MentorOwn,
    MentorReview, Mentorship, MentorshipMessage, MentorshipRequest, MentorshipSession, MentorshipSummary, MentorStatus,
    MessagePage, Page, ReportContext, ReportTarget, SkillLevel, ModerationMentorItem,
} from '@/types/mentorship';

/** A query string from the values that are set. Empty values, false flags and page 1 are left out. */
function query(values: Record<string, string | number | boolean | undefined | null>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === null || value === '' || value === false) continue;
        params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

const send = (path: string, method: string, body?: unknown) =>
    fetchApi(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

const post = (path: string, body?: unknown) => send(path, 'POST', body);
const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Directory and mentor profile
// ---------------------------------------------------------------------------

/** `hasCapacity` defaults to true on the server, so only `false` is sent */
export function mentorListQuery(filters: MentorListFilters = {}): string {
    return query({
        expertise: filters.expertise?.length ? filters.expertise.join(',') : undefined,
        minRating: filters.minRating && filters.minRating > 0 ? filters.minRating : undefined,
        hasCapacity: filters.hasCapacity === false ? 'false' : undefined,
        sort: filters.sort && filters.sort !== 'relevance' ? filters.sort : undefined,
        search: filters.search && filters.search.trim().length >= 2 ? filters.search.trim() : undefined,
        page: filters.page && filters.page > 1 ? filters.page : undefined,
        limit: filters.limit,
    });
}

export function listMentors(filters: MentorListFilters = {}): Promise<Page<Mentor>> {
    return fetchApi(`/api/mentors${mentorListQuery(filters)}`);
}

export async function listFeaturedMentors(limit = 6): Promise<Mentor[]> {
    return (await fetchApi(`/api/mentors/featured${query({ limit })}`)).data;
}

export async function getMentor(id: string): Promise<Mentor> {
    return (await fetchApi(`/api/mentors/${enc(id)}`)).data;
}

export function listMentorReviews(id: string, page = 1, limit = 10): Promise<Page<MentorReview>> {
    return fetchApi(`/api/mentors/${enc(id)}/reviews${query({ page: page > 1 ? page : undefined, limit })}`);
}

export async function getEligibility(): Promise<MentorEligibility> {
    return (await fetchApi('/api/mentors/eligibility')).data;
}

export interface MentorApplicationInput {
    expertiseAreas: ExpertiseArea[];
    bio: string;
    availability: { hoursPerWeek: number; timezone: string; preferredTimes: { dayOfWeek: number; startHour: number; endHour: number }[] };
    maxMentees: number;
    conductAccepted: true;
}

export async function registerMentor(input: MentorApplicationInput): Promise<MentorOwn> {
    return (await post('/api/mentors/register', input)).data;
}

/** The signed-in member's own profile in any status, or null when they never applied */
export async function getMyMentorProfile(): Promise<MentorOwn | null> {
    try {
        return (await fetchApi('/api/mentors/me')).data;
    } catch (err) {
        if ((err as { status?: number })?.status === 404) return null;
        throw err;
    }
}

export async function updateMyMentorProfile(input: Partial<Omit<MentorApplicationInput, 'conductAccepted'>>): Promise<MentorOwn> {
    return (await send('/api/mentors/me', 'PATCH', input)).data;
}

export async function pauseMentorProfile(): Promise<MentorOwn> {
    return (await post('/api/mentors/me/pause')).data;
}

export async function resumeMentorProfile(): Promise<MentorOwn> {
    return (await post('/api/mentors/me/resume')).data;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface RequestInput {
    expertiseAreas: ExpertiseArea[];
    goals: string;
    skillLevel: SkillLevel;
    mentorId?: string;
    conductAccepted: true;
}

export async function createRequest(input: RequestInput): Promise<MentorshipRequest> {
    return (await post('/api/mentorship-requests', input)).data;
}

export function listMyRequests(params: { status?: string; page?: number; limit?: number } = {}): Promise<Page<MentorshipRequest>> {
    return fetchApi(`/api/mentorship-requests/me${query({ status: params.status, page: params.page && params.page > 1 ? params.page : undefined, limit: params.limit })}`);
}

export async function getRequestMatches(id: string): Promise<MentorshipRequest> {
    return (await fetchApi(`/api/mentorship-requests/${enc(id)}/matches`)).data;
}

export async function cancelRequest(id: string): Promise<MentorshipRequest> {
    return (await fetchApi(`/api/mentorship-requests/${enc(id)}`, { method: 'DELETE' })).data;
}

export async function renewRequest(id: string): Promise<MentorshipRequest> {
    return (await post(`/api/mentorship-requests/${enc(id)}/renew`)).data;
}

export async function inviteMentor(requestId: string, mentorId: string): Promise<MentorshipRequest> {
    return (await post(`/api/mentorship-requests/${enc(requestId)}/select/${enc(mentorId)}`)).data;
}

export function listIncomingRequests(params: { status?: 'pending' | 'accepted' | 'declined' | 'all'; page?: number; limit?: number } = {}): Promise<Page<IncomingRequest>> {
    return fetchApi(`/api/mentors/me/requests${query({ status: params.status, page: params.page && params.page > 1 ? params.page : undefined, limit: params.limit })}`);
}

export async function acceptRequest(id: string): Promise<{ request: IncomingRequest; mentorship: Mentorship }> {
    return (await post(`/api/mentors/me/requests/${enc(id)}/accept`)).data;
}

export async function declineRequest(id: string, reason?: string): Promise<IncomingRequest> {
    return (await post(`/api/mentors/me/requests/${enc(id)}/decline`, { reason: reason?.trim() || undefined })).data;
}

// ---------------------------------------------------------------------------
// Mentorships
// ---------------------------------------------------------------------------

export function listMentorships(params: { role?: 'mentor' | 'mentee'; status?: string; page?: number; limit?: number } = {}): Promise<Page<Mentorship>> {
    return fetchApi(`/api/mentorships${query({ role: params.role, status: params.status, page: params.page && params.page > 1 ? params.page : undefined, limit: params.limit })}`);
}

export async function getSummary(): Promise<MentorshipSummary> {
    return (await fetchApi('/api/mentorships/summary')).data;
}

export async function getMentorship(id: string): Promise<Mentorship> {
    return (await fetchApi(`/api/mentorships/${enc(id)}`)).data;
}

export async function pauseMentorship(id: string, reason?: string): Promise<Mentorship> {
    return (await post(`/api/mentorships/${enc(id)}/pause`, { reason: reason?.trim() || undefined })).data;
}

export async function resumeMentorship(id: string): Promise<Mentorship> {
    return (await post(`/api/mentorships/${enc(id)}/resume`)).data;
}

export async function extendMentorship(id: string, months: number): Promise<Mentorship> {
    return (await post(`/api/mentorships/${enc(id)}/extend`, { months })).data;
}

export interface FinalFeedbackInput { rating?: number; comment?: string; shareName?: boolean }

const feedbackBody = (input: FinalFeedbackInput) => ({
    rating: input.rating,
    comment: input.comment?.trim() || undefined,
    shareName: input.shareName || undefined,
});

export async function completeMentorship(id: string, feedback: FinalFeedbackInput = {}): Promise<{ mentorship: Mentorship; feedback: unknown }> {
    return (await post(`/api/mentorships/${enc(id)}/complete`, feedbackBody(feedback))).data;
}

export async function listMentorshipFeedback(id: string): Promise<FeedbackRow[]> {
    return (await fetchApi(`/api/mentorships/${enc(id)}/feedback`)).data;
}

export async function submitFinalFeedback(id: string, input: FinalFeedbackInput & { rating: number }): Promise<FeedbackRow> {
    return (await post(`/api/mentorships/${enc(id)}/feedback`, feedbackBody(input))).data;
}

export interface ReportInput { target: ReportTarget; reason: string; details?: string; messageId?: string }

export async function reportMentorship(id: string, input: ReportInput): Promise<{ flagId: string; contentType: string }> {
    return (await post(`/api/mentorships/${enc(id)}/report`, {
        target: input.target,
        reason: input.reason,
        details: input.details?.trim() || undefined,
        messageId: input.target === 'message' ? input.messageId : undefined,
    })).data;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function listMessages(id: string, params: { before?: string | null; limit?: number } = {}): Promise<MessagePage> {
    return fetchApi(`/api/mentorships/${enc(id)}/messages${query({ before: params.before || undefined, limit: params.limit })}`);
}

export interface SendMessageInput { content: string; contentType: 'text' | 'code'; codeLanguage?: string }

export async function sendMessage(id: string, input: SendMessageInput): Promise<MentorshipMessage> {
    return (await post(`/api/mentorships/${enc(id)}/messages`, {
        content: input.contentType === 'code' ? fenceCode(input.content, input.codeLanguage) : input.content,
        contentType: input.contentType,
        codeLanguage: input.contentType === 'code' && input.codeLanguage?.trim() ? input.codeLanguage.trim() : undefined,
    })).data;
}

export interface UploadedFile { url: string; filename: string; mimetype: string; size: number }

/** The file goes to the media upload first (folder `mentorship`); only the returned address is sent to the chat */
export async function uploadChatFile(file: File): Promise<UploadedFile> {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', 'mentorship');
    const token = tokenStore.get();
    const res = await fetch(`${API_URL}/api/upload/media`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
    });
    if (!res.ok) {
        let message = 'The file could not be uploaded';
        let code: string | undefined;
        try {
            const body = await res.json();
            message = body?.error?.message || body?.message || message;
            code = body?.error?.code;
        } catch { /* not JSON */ }
        throw new ApiError(message, res.status, code);
    }
    return (await res.json()).data;
}

export async function sendFileMessage(id: string, file: { filename: string; url: string; size: number; mimeType: string }): Promise<MentorshipMessage> {
    return (await post(`/api/mentorships/${enc(id)}/messages/file`, file)).data;
}

export async function markMessagesRead(id: string): Promise<{ marked: number }> {
    return (await post(`/api/mentorships/${enc(id)}/messages/read`)).data;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function listSessions(id: string, params: { scope?: 'upcoming' | 'past' | 'all'; status?: string; page?: number; limit?: number } = {}): Promise<Page<MentorshipSession>> {
    return fetchApi(`/api/mentorships/${enc(id)}/sessions${query({ scope: params.scope && params.scope !== 'all' ? params.scope : undefined, status: params.status, page: params.page && params.page > 1 ? params.page : undefined, limit: params.limit })}`);
}

export async function listUpcomingSessions(limit = 10): Promise<MentorshipSession[]> {
    return (await fetchApi(`/api/sessions/upcoming${query({ limit })}`)).data;
}

export async function listPendingFeedback(limit = 20): Promise<MentorshipSession[]> {
    return (await fetchApi(`/api/sessions/feedback/pending${query({ limit })}`)).data;
}

export interface SessionInput {
    title: string;
    /** An exact instant (ISO with Z) */
    scheduledAt: string;
    /** The zone the person picked; the server keeps it as the display hint */
    timezone: string;
    duration: number;
    meetingUrl?: string;
    description?: string;
}

const sessionBody = (input: Partial<SessionInput>) => ({
    ...input,
    title: input.title?.trim(),
    meetingUrl: input.meetingUrl === undefined ? undefined : input.meetingUrl.trim(),
    description: input.description === undefined ? undefined : input.description.trim(),
});

export async function createSession(mentorshipId: string, input: SessionInput): Promise<MentorshipSession> {
    return (await post(`/api/mentorships/${enc(mentorshipId)}/sessions`, sessionBody(input))).data;
}

export async function updateSession(id: string, input: Partial<SessionInput>): Promise<MentorshipSession> {
    return (await send(`/api/sessions/${enc(id)}`, 'PATCH', sessionBody(input))).data;
}

export async function cancelSession(id: string, reason: string): Promise<MentorshipSession> {
    return (await send(`/api/sessions/${enc(id)}`, 'DELETE', { reason: reason.trim() })).data;
}

export async function completeSession(id: string, input: { actualDuration?: number; notes?: string } = {}): Promise<MentorshipSession> {
    return (await post(`/api/sessions/${enc(id)}/complete`, { actualDuration: input.actualDuration, notes: input.notes?.trim() || undefined })).data;
}

export async function saveSessionNotes(id: string, notes: string): Promise<MentorshipSession> {
    return (await post(`/api/sessions/${enc(id)}/notes`, { notes: notes.trim() })).data;
}

export async function submitSessionFeedback(id: string, input: FinalFeedbackInput & { rating: number }): Promise<FeedbackRow> {
    return (await post(`/api/sessions/${enc(id)}/feedback`, feedbackBody(input))).data;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export function listMentorApplications(params: { status?: MentorStatus | 'all'; page?: number; limit?: number } = {}): Promise<Page<MentorApplication>> {
    return fetchApi(`/api/admin/mentors${query({ status: params.status, page: params.page && params.page > 1 ? params.page : undefined, limit: params.limit })}`);
}

export async function reviewMentor(id: string, input: { decision: 'approve' | 'reject' | 'suspend'; note?: string; endMentorships?: boolean }): Promise<MentorOwn> {
    return (await send(`/api/admin/mentors/${enc(id)}/review`, 'PATCH', {
        decision: input.decision,
        note: input.note?.trim() || undefined,
        endMentorships: input.endMentorships || undefined,
    })).data;
}

export function listAdminMentorships(params: { status?: string; page?: number; limit?: number } = {}): Promise<Page<Mentorship>> {
    return fetchApi(`/api/admin/mentorships${query({ status: params.status, page: params.page && params.page > 1 ? params.page : undefined, limit: params.limit })}`);
}

export async function terminateMentorship(id: string, reason: string): Promise<Mentorship> {
    return (await post(`/api/admin/mentorships/${enc(id)}/terminate`, { reason: reason.trim() })).data;
}

export async function getReportContext(flagId: string): Promise<ReportContext> {
    return (await fetchApi(`/api/admin/mentorships/reports/${enc(flagId)}/context`)).data;
}

/** Reported chat messages waiting in the moderation queue (grouped per message, with the flag ids) */
export async function listReportedMessages(page = 1, limit = 20): Promise<{ items: ModerationMentorItem[]; total: number; totalPages: number }> {
    const res = await fetchApi(`/api/moderation/queue/items${query({ status: 'pending', contentType: 'mentorMessage', page: page > 1 ? page : undefined, limit })}`);
    return { items: res?.data ?? [], total: res?.pagination?.total ?? 0, totalPages: res?.pagination?.totalPages ?? 1 };
}
