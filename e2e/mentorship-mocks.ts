import type { Page, Route } from '@playwright/test';

/**
 * A small in-memory stand-in for the mentorship API, so the e2e specs run without a backend.
 * Requests are answered from `state`; every write is also pushed to `calls` for assertions.
 */

const DAY = 24 * 60 * 60 * 1000;
export const iso = (offsetDays: number, hours = 0) => new Date(Date.now() + offsetDays * DAY + hours * 3600_000).toISOString();

export const ME = { _id: 'user-1', username: 'testuser', name: 'Test User', avatar: null };
const ADA = { _id: 'user-ada', username: 'ada', name: 'Ada Lovelace', avatar: null };
const LINUS = { _id: 'user-linus', username: 'linus', name: 'Linus Torvalds', avatar: null };

export const MENTORSHIP_ID = 'b'.repeat(24);
export const MENTOR_ID = 'a'.repeat(24);

export const mentor = (over: Record<string, unknown> = {}) => ({
    _id: MENTOR_ID,
    user: ADA,
    expertiseAreas: ['web-security', 'pentesting', 'osint'],
    bio: 'Ten years of application security work. I like helping people land their first bug bounty and learn to write a clear report.',
    availability: { hoursPerWeek: 4, timezone: 'Europe/Berlin', preferredTimes: [{ dayOfWeek: 1, startHour: 18, endHour: 20 }, { dayOfWeek: 3, startHour: 9, endHour: 11 }] },
    maxMentees: 3, spotsLeft: 2, hasCapacity: true, isPaused: false, rating: 4.6, totalRatings: 12, completedMentorships: 5, totalSessionsCompleted: 30,
    isVerified: true, isFeatured: true, createdAt: iso(-90),
    ...over,
});

export const viewerBlock = (over: Record<string, unknown> = {}) => ({
    role: 'mentee', canPause: true, canResume: false, canComplete: true, canExtend: true, canSchedule: true, canMessage: true,
    canReport: true, canGiveFinalFeedback: false, hasGivenFinalFeedback: false, ...over,
});

export const mentorship = (over: Record<string, unknown> = {}) => ({
    _id: MENTORSHIP_ID, status: 'active', mentor: ADA, mentee: ME,
    mentorProfile: { _id: MENTOR_ID, expertiseAreas: ['web-security'], rating: 4.6, totalRatings: 12, timezone: 'Asia/Kolkata' },
    channel: 'c1', goals: 'Learn web application testing step by step and write my first report.', skillLevel: 'beginner', expertiseAreas: ['web-security', 'pentesting'],
    startDate: iso(-30), expectedEndDate: iso(60), actualEndDate: null, daysRemaining: 60, termMonths: 3, extensions: [], canExtend: true,
    totalHours: 3, sessionsCompleted: 2, lastMessageAt: iso(0, -1), unreadMessages: 0, pausedAt: null, pauseReason: null, endedByRole: null, endReason: null,
    finalFeedback: { mine: null, theirs: null }, viewer: viewerBlock(), ...over,
});

export const session = (over: Record<string, unknown> = {}) => ({
    _id: 'c'.repeat(24), mentorship: MENTORSHIP_ID, title: 'First call: goals and plan', description: 'Agree on goals and how we will work.', agenda: null,
    scheduledAt: iso(3), timezone: 'Asia/Kolkata', duration: 60, endsAt: iso(3, 1), meetingUrl: 'https://meet.example.org/abc-defg', status: 'scheduled',
    cancelReason: null, completedAt: null, actualDuration: null, notes: null, feedback: { deadline: null, submitted: false, canSubmit: false },
    viewer: { role: 'mentee', canReschedule: true, canCancel: true, canComplete: false, canAddNotes: true, isProposer: true }, ...over,
});

export const message = (over: Record<string, unknown> = {}) => ({
    _id: 'd'.repeat(24), channel: 'c1', sender: ADA, content: 'Welcome! Tell me what you would like to learn first.', contentType: 'text', codeLanguage: null,
    attachment: null, hidden: false, isRead: true, readAt: null, createdAt: iso(0, -3), ...over,
});

export interface MockState {
    mentors: Record<string, unknown>[];
    eligibility: Record<string, unknown>;
    myProfile: Record<string, unknown> | null;
    myRequests: Record<string, unknown>[];
    incoming: Record<string, unknown>[];
    mentorships: Record<string, unknown>[];
    sessions: Record<string, unknown>[];
    /** Oldest first */
    messages: Record<string, unknown>[];
    summary: Record<string, unknown>;
    applications: Record<string, unknown>[];
    adminMentorships: Record<string, unknown>[];
    reported: Record<string, unknown>[];
    context: Record<string, unknown> | null;
    feedback: Record<string, unknown>[];
    /** `METHOD /path` to an error code and status, to make a write fail */
    failures: Record<string, { status: number; code: string; message: string }>;
}

export function defaultState(): MockState {
    const mentors = [
        mentor(),
        mentor({ _id: 'e'.repeat(24), user: LINUS, expertiseAreas: ['malware-analysis', 'reverse-engineering'], isFeatured: false, isVerified: false, rating: 4.1, totalRatings: 4, spotsLeft: 1 }),
        mentor({ _id: 'f'.repeat(24), user: { _id: 'u3', username: 'grace', name: 'Grace Hopper', avatar: null }, expertiseAreas: ['career-guidance'], isFeatured: false, rating: 0, totalRatings: 0, completedMentorships: 0 }),
    ];
    return {
        mentors,
        eligibility: { eligible: true, reason: null, points: 250, requiredPoints: 100, invited: false, hasProfile: false, profileStatus: null },
        myProfile: null,
        myRequests: [],
        incoming: [],
        mentorships: [mentorship({ unreadMessages: 1 })],
        sessions: [session()],
        messages: [message({ _id: '1'.repeat(24) }), message({ _id: '2'.repeat(24), sender: ME, content: 'I would like to start with SQL injection.', isRead: true, createdAt: iso(0, -2) })],
        summary: { pendingInvites: 0, unreadMessages: 1, pendingFeedback: 0, activeMentorships: 1, openRequest: null, nextSession: null },
        applications: [], adminMentorships: [], reported: [], context: null, feedback: [],
        failures: {},
    };
}

export interface Call { method: string; path: string; body: unknown; search: string }

const corsHeaders = (route: Route) => ({
    'access-control-allow-origin': route.request().headers()['origin'] || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
});

const reply = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: corsHeaders(route), body: JSON.stringify(body) });

const list = (data: unknown[]) => ({ success: true, data, pagination: { page: 1, limit: 20, total: data.length, pages: 1 } });

/** Installs the mentorship routes on a page. Call after `signInAs`: later routes win. */
export async function mockMentorshipApi(page: Page, state: MockState = defaultState()) {
    const calls: Call[] = [];

    await page.route('**/api/**', async (route) => {
        const req = route.request();
        const method = req.method();
        const url = new URL(req.url());
        const path = url.pathname;
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders(route) });
        if (!/^\/api\/(mentors|mentorship|mentorships|sessions|admin\/mentor|moderation\/queue\/items|upload\/media)/.test(path)) return route.fallback();

        let body: unknown = null;
        try { body = req.postDataJSON(); } catch { body = null; }
        if (method !== 'GET') calls.push({ method, path, body, search: url.search });

        const fail = state.failures[`${method} ${path}`];
        if (fail) return reply(route, { success: false, error: { code: fail.code, message: fail.message } }, fail.status);
        const ok = (data: unknown) => reply(route, { success: true, data });
        const m = (re: RegExp) => path.match(re);

        // --- directory and profiles
        if (method === 'GET' && path === '/api/mentors/featured') return ok(state.mentors.filter((x) => x.isFeatured));
        if (method === 'GET' && path === '/api/mentors/eligibility') return ok(state.eligibility);
        if (method === 'GET' && path === '/api/mentors/me') return state.myProfile ? ok(state.myProfile) : reply(route, { success: false, error: { code: 'NOT_FOUND', message: 'No profile' } }, 404);
        if (method === 'POST' && path === '/api/mentors/register') {
            state.myProfile = { ...mentor({ _id: 'p'.repeat(24), user: ME }), ...(body as object), status: 'pending', reviewNote: null, reviewedAt: null, conductAcceptedAt: iso(0), currentMenteeCount: 0 };
            return ok(state.myProfile);
        }
        if (method === 'GET' && path === '/api/mentors/me/requests') return reply(route, list(state.incoming));
        let g = m(/^\/api\/mentors\/me\/requests\/([^/]+)\/(accept|decline)$/);
        if (method === 'POST' && g) {
            const row = state.incoming.find((r) => r._id === g![1]);
            if (row) {
                row.status = g[2] === 'accept' ? 'accepted' : 'declined';
                row.invitation = { ...(row.invitation as object), response: g[2] === 'accept' ? 'accepted' : 'declined' };
            }
            return ok(g[2] === 'accept' ? { request: row, mentorship: mentorship({ viewer: viewerBlock({ role: 'mentor' }) }) } : row);
        }
        g = m(/^\/api\/mentors\/([^/]+)\/reviews$/);
        if (method === 'GET' && g) return reply(route, list([{ rating: 5, comment: 'Patient, clear and very practical.', createdAt: iso(-10), menteeFirstName: 'Sam' }, { rating: 4, comment: 'Great feedback on my report.', createdAt: iso(-40), menteeFirstName: null }]));
        g = m(/^\/api\/mentors\/([^/]+)$/);
        if (method === 'GET' && g) {
            const found = state.mentors.find((x) => x._id === g![1]);
            return found ? ok(found) : reply(route, { success: false, error: { code: 'MENTOR_NOT_FOUND', message: 'Not found' } }, 404);
        }
        if (method === 'GET' && path === '/api/mentors') {
            const q = url.searchParams;
            let rows = state.mentors.slice();
            const topics = q.get('expertise')?.split(',').filter(Boolean) ?? [];
            if (topics.length) rows = rows.filter((r) => topics.some((t) => (r.expertiseAreas as string[]).includes(t)));
            const search = q.get('search')?.toLowerCase();
            if (search) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search));
            return reply(route, list(rows));
        }

        // --- requests
        if (method === 'POST' && path === '/api/mentorship-requests') {
            const input = body as Record<string, unknown>;
            const created = { _id: 'r'.repeat(24), status: 'matched', goals: input.goals, skillLevel: input.skillLevel, expertiseAreas: input.expertiseAreas, isDirect: !!input.mentorId, createdAt: iso(0), expiresAt: iso(14), mentorship: null,
                matchedMentors: state.mentors.slice(0, 2).map((x, i) => ({ mentor: x, matchScore: 90 - i * 15, response: 'pending', invitedAt: i === 0 ? iso(0) : null, respondedAt: null, declineReason: null, autoDeclined: false })) };
            state.myRequests = [created];
            return ok(created);
        }
        if (method === 'GET' && path === '/api/mentorship-requests/me') return reply(route, list(state.myRequests));
        g = m(/^\/api\/mentorship-requests\/([^/]+)\/matches$/);
        if (method === 'GET' && g) return ok(state.myRequests.find((r) => r._id === g![1]) ?? state.myRequests[0]);
        g = m(/^\/api\/mentorship-requests\/([^/]+)\/renew$/);
        if (method === 'POST' && g) {
            const row = state.myRequests.find((r) => r._id === g![1]);
            if (row) Object.assign(row, { status: 'matched', expiresAt: iso(14) });
            return ok(row);
        }
        g = m(/^\/api\/mentorship-requests\/([^/]+)\/select\/([^/]+)$/);
        if (method === 'POST' && g) return ok(state.myRequests.find((r) => r._id === g![1]));
        g = m(/^\/api\/mentorship-requests\/([^/]+)$/);
        if (method === 'DELETE' && g) {
            const row = state.myRequests.find((r) => r._id === g![1]);
            if (row) row.status = 'cancelled';
            return ok(row);
        }

        // --- mentorships
        if (method === 'GET' && path === '/api/mentorships/summary') return ok(state.summary);
        if (method === 'GET' && path === '/api/mentorships') return reply(route, list(state.mentorships));
        g = m(/^\/api\/mentorships\/([^/]+)\/messages\/read$/);
        if (method === 'POST' && g) return ok({ marked: 1 });
        g = m(/^\/api\/mentorships\/([^/]+)\/messages\/file$/);
        if (method === 'POST' && g) {
            const f = body as { filename: string; url: string; size: number; mimeType: string };
            const saved = message({ _id: String(state.messages.length + 10).padStart(24, '0'), sender: ME, content: f.filename, contentType: 'file', attachment: f, createdAt: iso(0) });
            state.messages.push(saved);
            return ok(saved);
        }
        g = m(/^\/api\/mentorships\/([^/]+)\/messages$/);
        if (method === 'GET' && g) {
            const before = url.searchParams.get('before');
            const limit = Number(url.searchParams.get('limit') ?? 50);
            const all = state.messages;
            const end = before ? all.findIndex((x) => x._id === before) : all.length;
            const start = Math.max(0, end - limit);
            const slice = all.slice(start, end);
            return reply(route, { success: true, data: slice, pagination: { limit, hasMore: start > 0, nextBefore: start > 0 && slice.length ? slice[0]._id : null } });
        }
        if (method === 'POST' && g) {
            const input = body as { content: string; contentType: string; codeLanguage?: string };
            const saved = message({ _id: String(state.messages.length + 10).padStart(24, '0'), sender: ME, content: input.content, contentType: input.contentType, codeLanguage: input.codeLanguage ?? null, createdAt: iso(0), isRead: false });
            state.messages.push(saved);
            return ok(saved);
        }
        g = m(/^\/api\/mentorships\/([^/]+)\/sessions$/);
        if (method === 'GET' && g) return reply(route, list(state.sessions));
        if (method === 'POST' && g) {
            const input = body as Record<string, unknown>;
            const created = session({ _id: String(state.sessions.length + 20).padStart(24, '0'), ...input, endsAt: iso(5, 1) });
            state.sessions.push(created);
            return ok(created);
        }
        g = m(/^\/api\/mentorships\/([^/]+)\/feedback$/);
        if (method === 'GET' && g) return ok(state.feedback);
        if (method === 'POST' && g) return ok({ _id: 'fb1', type: 'final', ...(body as object), mine: true, createdAt: iso(0) });
        g = m(/^\/api\/mentorships\/([^/]+)\/(pause|resume|extend|complete|report)$/);
        if (method === 'POST' && g) {
            const cur = state.mentorships[0];
            if (g[2] === 'pause') Object.assign(cur, { status: 'paused', pausedAt: iso(0) }, { viewer: viewerBlock({ canPause: false, canResume: true, canSchedule: false, canMessage: false }) });
            if (g[2] === 'resume') Object.assign(cur, mentorship({ _id: MENTORSHIP_ID }));
            if (g[2] === 'report') return ok({ flagId: 'flag1', contentType: 'mentorMessage' });
            return ok(cur);
        }
        g = m(/^\/api\/mentorships\/([^/]+)$/);
        if (method === 'GET' && g) {
            const found = state.mentorships.find((x) => x._id === g![1]);
            return found ? ok(found) : reply(route, { success: false, error: { code: 'MENTORSHIP_NOT_FOUND', message: 'Not found' } }, 404);
        }

        // --- sessions
        if (method === 'GET' && path === '/api/sessions/upcoming') return ok(state.sessions);
        if (method === 'GET' && path === '/api/sessions/feedback/pending') return ok([]);
        g = m(/^\/api\/sessions\/([^/]+)(?:\/(complete|notes|feedback))?$/);
        if (g) {
            const row = state.sessions.find((s) => s._id === g![1]);
            if (method === 'DELETE' && row) Object.assign(row, { status: 'cancelled', cancelReason: (body as { reason: string }).reason });
            if (method === 'PATCH' && row) Object.assign(row, body as object);
            return ok(row ?? {});
        }

        // --- staff
        if (method === 'GET' && path === '/api/admin/mentors') return reply(route, list(state.applications));
        g = m(/^\/api\/admin\/mentors\/([^/]+)\/review$/);
        if (method === 'PATCH' && g) {
            const row = state.applications.find((a) => a._id === g![1]);
            if (row) row.status = (body as { decision: string }).decision === 'approve' ? 'approved' : 'rejected';
            return ok(row);
        }
        if (method === 'GET' && path === '/api/admin/mentorships') return reply(route, list(state.adminMentorships));
        g = m(/^\/api\/admin\/mentorships\/([^/]+)\/terminate$/);
        if (method === 'POST' && g) return ok(state.adminMentorships.find((x) => x._id === g![1]));
        if (method === 'GET' && /\/api\/admin\/mentorships\/reports\/[^/]+\/context$/.test(path)) return ok(state.context);
        if (method === 'GET' && path === '/api/moderation/queue/items') return reply(route, list(state.reported));

        return route.fallback();
    });

    return { state, calls };
}
