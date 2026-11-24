import type { Page, Route } from '@playwright/test';

/**
 * An in-memory stand-in for the internships API, so the e2e specs run without a backend. Reads
 * answer from `state`; writes change it and are also pushed to `calls` for assertions. The rules
 * mirror the real API (status moves, answers, seats), so the screens are exercised, not the mock.
 */

const DAY = 86_400_000;
export const iso = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3_600_000).toISOString();

export const OPEN_ID = 'a'.repeat(24);
export const CLOSED_ID = 'b'.repeat(24);
export const FULL_ID = 'c'.repeat(24);
export const DRAFT_ID = 'd'.repeat(24);
export const DONE_ID = 'e'.repeat(24);
export const MINE_ID = '1'.repeat(24);
export const THEIRS_ID = '2'.repeat(24);
export const Q_TEXT = '5'.repeat(24);
export const Q_PICK = '6'.repeat(24);
export const Q_FILE = '7'.repeat(24);

export interface Role { id: string; role: 'user' | 'moderator' | 'admin' | 'owner' | null }
export const MEMBER: Role = { id: 'user-1', role: 'user' };
export const MODERATOR: Role = { id: 'staff-1', role: 'moderator' };
export const VISITOR: Role = { id: '', role: null };

interface Cohort extends Record<string, unknown> { _id: string; title: string; type: string; status: string; capacity: number; acceptedCount: number; applicationCount: number; isActive: boolean; customFields: { _id: string; label: string; type: string; options: string[]; required: boolean }[]; applicationDeadline: string; startDate: string; endDate: string }

interface HistoryItem { status: string; at: string; actor: 'applicant' | 'staff'; note?: string }
interface Application extends Record<string, unknown> {
    _id: string; cohort: string; status: string; appliedAt: string; updatedAt: string; coverLetter: string; resumeUrl: string | null;
    answers: { field: string; label: string; value: string }[]; statusHistory: HistoryItem[];
    user: { _id: string; name: string; username: string; email: string };
}

const base = (over: Partial<Cohort> & { _id: string; title: string }): Cohort => ({
    description: `${over.title}: hands-on work with a mentor.`, type: 'internship', status: 'open', capacity: 10, acceptedCount: 3, applicationCount: 5, isActive: true,
    startDate: iso(30), endDate: iso(86), applicationDeadline: iso(10), technologies: ['Burp Suite', 'Python'],
    requirements: ['Basic networking'], responsibilities: ['Test a real application'], benefits: ['Mentorship'],
    syllabus: [{ week: 1, title: 'Foundations', description: 'HTTP and tooling', topics: ['HTTP'], deliverables: ['Setup report'] }],
    customFields: [], showcaseProjects: [], mentors: [], createdAt: iso(-20), updatedAt: iso(-1), createdBy: 'staff-1',
    ...over,
}) as Cohort;

export interface MockState {
    cohorts: Cohort[];
    applications: Application[];
    /** The list answers this many cards per page, to exercise "load more" */
    pageCap: number;
    /** `METHOD path-suffix` (for example `POST apply`) to an error answered once */
    failOnce: Record<string, { status: number; code?: string; message?: string; details?: { field: string; message: string }[]; meta?: Record<string, unknown> }>;
    calls: { method: string; path: string; body?: Record<string, unknown> }[];
}

const person = (id: string, name: string, username: string) => ({ _id: id, name, username, email: `${username}@example.org` });

export function freshState(over: Partial<MockState> = {}): MockState {
    return {
        cohorts: [
            base({
                _id: OPEN_ID, title: 'Summer Security Internship', capacity: 10, acceptedCount: 3,
                customFields: [
                    { _id: Q_TEXT, label: 'Your favourite tool', type: 'text', options: [], required: true },
                    { _id: Q_PICK, label: 'Preferred track', type: 'dropdown', options: ['Offensive', 'Defensive'], required: true },
                    { _id: Q_FILE, label: 'Sample report', type: 'file', options: [], required: false },
                ],
                mentors: [{ _id: 'm1', name: 'Ada Lovelace', username: 'ada', avatar: null }],
            }),
            base({ _id: CLOSED_ID, title: 'Autumn Mentorship', type: 'mentorship', status: 'closed', applicationDeadline: iso(-3), startDate: iso(5), endDate: iso(60), capacity: 0, acceptedCount: 0 }),
            base({ _id: FULL_ID, title: 'Winter Cohort', capacity: 2, acceptedCount: 2 }),
            base({ _id: DRAFT_ID, title: 'Hidden Draft Program', status: 'draft', acceptedCount: 0, applicationCount: 0 }),
            base({ _id: DONE_ID, title: 'Spring 2026 Cohort', status: 'completed', startDate: iso(-120), endDate: iso(-60), applicationDeadline: iso(-130), showcaseProjects: [{ title: 'Subdomain Scanner', description: 'A fast scanner.', teamMembers: ['Grace'], demoLink: 'https://demo.example.org/scan', repoLink: 'https://github.com/example/scanner' }] }),
        ],
        applications: [
            {
                _id: THEIRS_ID, cohort: OPEN_ID, status: 'pending', appliedAt: iso(-2), updatedAt: iso(-2), coverLetter: 'I would like to learn.\nSecond line.', resumeUrl: 'https://example.org/cv.pdf',
                githubUrl: 'https://github.com/grace', answers: [{ field: Q_TEXT, label: 'Your favourite tool', value: '<img src=x onerror=alert(1)>' }],
                statusHistory: [{ status: 'pending', at: iso(-2), actor: 'applicant' }], user: person('applicant-1', 'Grace Hopper', 'grace'),
            },
        ],
        pageCap: 100,
        failOnce: {},
        calls: [],
        ...over,
    };
}

/** An application of the signed-in member, for specs that start with one */
export function myApplication(over: Partial<Application> = {}): Application {
    return {
        _id: MINE_ID, cohort: OPEN_ID, status: 'reviewing', appliedAt: iso(-5), updatedAt: iso(-2), coverLetter: 'I love breaking things responsibly.', resumeUrl: null,
        answers: [{ field: Q_TEXT, label: 'Your favourite tool', value: 'Burp' }],
        statusHistory: [
            { status: 'pending', at: iso(-5), actor: 'applicant' },
            { status: 'reviewing', at: iso(-2), actor: 'staff', note: 'Reading your repo now' },
        ],
        user: person(MEMBER.id, 'Test User', 'testuser'),
        ...over,
    };
}

const TRANSITIONS: Record<string, string[]> = { pending: ['reviewing', 'accepted', 'rejected'], reviewing: ['accepted', 'rejected'], accepted: [], rejected: [], withdrawn: [] };

const cors = (route: Route) => ({
    'access-control-allow-origin': route.request().headers()['origin'] || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
});
const send = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: cors(route), body: JSON.stringify(body) });
const fail = (route: Route, status: number, code: string, message: string, extra: Record<string, unknown> = {}) => send(route, status, { success: false, error: { code, message, ...extra } });
const paged = (items: unknown[], page: number, limit: number) => {
    const start = (page - 1) * limit;
    const slice = items.slice(start, start + limit);
    return { success: true, count: slice.length, data: slice, pagination: { page, limit, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / limit)), hasMore: start + slice.length < items.length } };
};

/** The API's rule for a link (parseHttpUrl and isInternalHost): http(s), no credentials, and a public host: no IP address, no internal name */
const isInternalHost = (hostname: string) => {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (host.includes(':') || /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(host)) return true;
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (/\.(local|internal|lan|home|corp|intranet|test|invalid|example)$/.test(host)) return true;
    if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
    return !host.includes('.');
};
const isLink = (v: string) => {
    try {
        const u = new URL(v.trim());
        return v.trim().length <= 2048 && (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password && !!u.hostname && !isInternalHost(u.hostname);
    } catch { return false; }
};

export async function mockInternshipsApi(page: Page, who: Role, state: MockState = freshState()): Promise<MockState> {
    const staff = who.role === 'moderator' || who.role === 'admin' || who.role === 'owner';
    if (who.role) await page.addInitScript(() => window.localStorage.setItem('token', 'e2e-token'));

    const card = (c: Cohort) => {
        const now = Date.now();
        const status = c.status === 'open' && new Date(c.applicationDeadline).getTime() <= now ? 'closed' : c.status;
        const view: Record<string, unknown> = {
            _id: c._id, title: c.title, description: c.description, type: c.type, status, capacity: c.capacity,
            spotsLeft: c.capacity > 0 ? Math.max(0, c.capacity - c.acceptedCount) : null, applicationsOpen: status === 'open',
            startDate: c.startDate, endDate: c.endDate, applicationDeadline: c.applicationDeadline, technologies: c.technologies,
        };
        if (staff) Object.assign(view, { isActive: c.isActive, acceptedCount: c.acceptedCount, applicationCount: c.applicationCount, storedStatus: c.status, createdBy: c.createdBy, createdAt: c.createdAt, updatedAt: c.updatedAt });
        return view;
    };
    const detail = (c: Cohort) => {
        const mine = who.role ? state.applications.find((a) => a.cohort === c._id && a.user._id === who.id) : undefined;
        const open = card(c).applicationsOpen as boolean;
        return {
            ...card(c), requirements: c.requirements, responsibilities: c.responsibilities, benefits: c.benefits, syllabus: c.syllabus,
            customFields: c.customFields, showcaseProjects: c.showcaseProjects, mentors: c.mentors,
            viewer: who.role ? { userApplication: mine ? { _id: mine._id, status: mine.status, appliedAt: mine.appliedAt, updatedAt: mine.updatedAt } : null, canApply: !mine && open } : null,
        };
    };
    const applicantView = (a: Application) => {
        const c = state.cohorts.find((x) => x._id === a.cohort);
        const last = [...a.statusHistory].reverse().find((h) => h.actor === 'staff' && h.note);
        return {
            _id: a._id, cohort: c ? { _id: c._id, title: c.title, status: c.status, type: c.type, startDate: c.startDate, endDate: c.endDate, applicationDeadline: c.applicationDeadline } : null,
            status: a.status, coverLetter: a.coverLetter, githubUrl: a.githubUrl ?? null, linkedinUrl: null, portfolioUrl: null, resumeUrl: a.resumeUrl, answers: a.answers,
            appliedAt: a.appliedAt, updatedAt: a.updatedAt, statusHistory: a.statusHistory.map(({ status, at, note }) => ({ status, at, ...(note ? { note } : {}) })), reviewNote: last?.note ?? null,
        };
    };
    const staffRow = (a: Application) => ({ _id: a._id, cohort: a.cohort, status: a.status, appliedAt: a.appliedAt, updatedAt: a.updatedAt, resumeUrl: a.resumeUrl, user: a.user });
    const staffDetail = (a: Application) => ({ ...staffRow(a), coverLetter: a.coverLetter, githubUrl: a.githubUrl ?? null, linkedinUrl: null, portfolioUrl: null, answers: a.answers, statusHistory: a.statusHistory.map((h) => ({ ...h, by: 'x' })), reviewedBy: null, reviewedAt: null });

    await page.route('**/api/**', async (route) => {
        const req = route.request();
        const method = req.method();
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
        const url = new URL(req.url());
        const path = url.pathname;
        const q = url.searchParams;
        const token = !!req.headers()['authorization'];
        let body: Record<string, unknown> = {};
        try { body = req.postDataJSON() ?? {}; } catch { body = {}; }
        const key = `${method} ${path.replace(/^\/api\/internships/, '')}`;

        if (path === '/api/auth/me') {
            return who.role ? send(route, 200, { success: true, data: { id: who.id, _id: who.id, name: 'Test User', username: 'testuser', email: 'test@example.com', role: who.role, isVerified: true, provider: 'local' } }) : fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
        }
        if (!path.startsWith('/api/internships')) {
            if (path === '/api/notifications/unread-count') return send(route, 200, { success: true, data: { count: 0, byType: {} } });
            return send(route, 200, { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1, hasMore: false } });
        }

        state.calls.push({ method, path: path.replace(/^\/api\/internships/, '') || '/', ...(method === 'GET' ? {} : { body }) });

        void key;
        const once = Object.entries(state.failOnce).find(([k]) => k.split(' ')[0] === method && path.endsWith(k.split(' ')[1]));
        if (once && method !== 'GET') {
            delete state.failOnce[once[0]];
            const f = once[1];
            return fail(route, f.status, f.code ?? 'INTERNAL_ERROR', f.message ?? 'Something failed', { ...(f.details ? { details: f.details } : {}), ...(f.meta ? { meta: f.meta } : {}) });
        }

        const m = (re: RegExp) => path.replace(/^\/api\/internships/, '').match(re);

        // ---- lists
        if (method === 'GET' && (path === '/api/internships' || path === '/api/internships/')) {
            // Like the API: `all` (staff) is everything; otherwise only active cohorts, and for the public only the listed statuses.
            // A staff `status` is a filter on its own (stored status, with the deadline deciding open and closed).
            const all = staff && q.get('all') === 'true';
            const limit = Math.min(Number(q.get('limit') || 20), state.pageCap);
            const wanted = staff ? q.get('status') : null;
            const now = Date.now();
            const byStatus = (c: Cohort, status: string) => (status === 'open' ? c.status === 'open' && new Date(c.applicationDeadline).getTime() > now
                : status === 'closed' ? c.status === 'closed' || (c.status === 'open' && new Date(c.applicationDeadline).getTime() <= now)
                    : c.status === status);
            let items = state.cohorts.filter((c) => (all ? true : c.isActive && (wanted ? true : ['open', 'closed', 'in-progress'].includes(c.status))));
            if (wanted) items = items.filter((c) => byStatus(c, wanted));
            if (q.get('type')) items = items.filter((c) => c.type === q.get('type'));
            return send(route, 200, paged(items.map(card), Number(q.get('page') || 1), limit));
        }
        if (method === 'GET' && path === '/api/internships/past') {
            const done = state.cohorts.filter((c) => c.status === 'completed').map((c) => ({ _id: c._id, title: c.title, description: c.description, type: c.type, startDate: c.startDate, endDate: c.endDate, technologies: c.technologies, capacity: c.capacity, showcaseProjects: c.showcaseProjects }));
            return send(route, 200, paged(done, 1, 6));
        }
        if (method === 'GET' && path === '/api/internships/applications/me') {
            if (!token) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
            let mine = state.applications.filter((a) => a.user._id === who.id);
            if (q.get('status')) mine = mine.filter((a) => a.status === q.get('status'));
            return send(route, 200, paged(mine.map(applicantView), 1, 20));
        }

        // ---- applications
        let r = m(/^\/applications\/([0-9a-f]{24})\/withdraw$/);
        if (method === 'PUT' && r) {
            const a = state.applications.find((x) => x._id === r![1] && x.user._id === who.id);
            if (!a) return fail(route, 404, 'INTERNSHIP_APPLICATION_NOT_FOUND', 'Application not found');
            if (a.status === 'rejected') return fail(route, 409, 'INTERNSHIP_INVALID_TRANSITION', 'no', { meta: { from: 'rejected', to: 'withdrawn', allowed: [] } });
            if (a.status !== 'withdrawn') {
                const c = state.cohorts.find((x) => x._id === a.cohort);
                if (c) { c.applicationCount -= 1; if (a.status === 'accepted') c.acceptedCount -= 1; }
                a.status = 'withdrawn';
                a.statusHistory.push({ status: 'withdrawn', at: new Date().toISOString(), actor: 'applicant', ...(body.reason ? { note: String(body.reason) } : {}) });
            }
            return send(route, 200, { success: true, data: applicantView(a) });
        }
        r = m(/^\/applications\/([0-9a-f]{24})\/status$/);
        if (method === 'PUT' && r) {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const a = state.applications.find((x) => x._id === r![1]);
            if (!a) return fail(route, 404, 'INTERNSHIP_APPLICATION_NOT_FOUND', 'Application not found');
            if (a.user._id === who.id) return fail(route, 403, 'INTERNSHIP_SELF_REVIEW', 'You cannot review your own application');
            const to = String(body.status);
            if (!TRANSITIONS[a.status].includes(to)) return fail(route, 409, 'INTERNSHIP_INVALID_TRANSITION', 'no', { meta: { from: a.status, to, allowed: TRANSITIONS[a.status] } });
            const c = state.cohorts.find((x) => x._id === a.cohort)!;
            if (to === 'accepted') {
                if (c.capacity > 0 && c.acceptedCount >= c.capacity) return fail(route, 409, 'INTERNSHIP_FULL', 'This cohort has no seats left');
                c.acceptedCount += 1;
            }
            a.status = to;
            a.updatedAt = new Date().toISOString();
            a.statusHistory.push({ status: to, at: a.updatedAt, actor: 'staff', ...(body.note ? { note: String(body.note) } : {}) });
            return send(route, 200, { success: true, data: staffDetail(a) });
        }
        r = m(/^\/applications\/([0-9a-f]{24})$/);
        if (method === 'GET' && r) {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const a = state.applications.find((x) => x._id === r![1]);
            return a ? send(route, 200, { success: true, data: staffDetail(a) }) : fail(route, 404, 'INTERNSHIP_APPLICATION_NOT_FOUND', 'Application not found');
        }

        // ---- one cohort
        r = m(/^\/([0-9a-f]{24})\/applications$/);
        if (method === 'GET' && r) {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            let rows = state.applications.filter((a) => a.cohort === r![1]);
            if (q.get('status')) rows = rows.filter((a) => a.status === q.get('status'));
            return send(route, 200, paged(rows.map(staffRow), Number(q.get('page') || 1), Number(q.get('limit') || 20)));
        }
        r = m(/^\/([0-9a-f]{24})\/apply$/);
        if (method === 'POST' && r) {
            if (!token) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
            const c = state.cohorts.find((x) => x._id === r![1]);
            if (!c || !c.isActive || c.status === 'draft') return fail(route, 404, 'INTERNSHIP_NOT_FOUND', 'Cohort not found');
            if (!card(c).applicationsOpen) return fail(route, 409, 'INTERNSHIP_CLOSED', 'This cohort is not accepting applications');
            if (state.applications.some((a) => a.cohort === c._id && a.user._id === who.id)) return fail(route, 409, 'INTERNSHIP_ALREADY_APPLIED', 'You have already applied to this cohort');
            const answers = (body.answers as { field: string; value: string }[] | undefined) ?? [];
            const details: { field: string; message: string }[] = [];
            for (const f of c.customFields) {
                const given = answers.find((a) => a.field === f._id)?.value?.trim() ?? '';
                if (!given) { if (f.required) details.push({ field: `answers.${f._id}`, message: `${f.label} is required` }); continue; }
                if (f.type === 'dropdown' && !f.options.includes(given)) details.push({ field: `answers.${f._id}`, message: `${f.label} must be one of the options` });
                if (f.type === 'file' && !isLink(given)) details.push({ field: `answers.${f._id}`, message: `${f.label} must be a valid http or https link` });
            }
            if (String(body.coverLetter ?? '').trim().length < 10) details.push({ field: 'coverLetter', message: 'Cover letter must be at least 10 characters' });
            if (details.length) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details });
            const app: Application = {
                _id: '3'.repeat(24), cohort: c._id, status: 'pending', appliedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), coverLetter: String(body.coverLetter), resumeUrl: (body.resumeUrl as string) || null,
                answers: answers.map((a) => ({ field: a.field, label: c.customFields.find((f) => f._id === a.field)?.label ?? '', value: a.value })),
                statusHistory: [{ status: 'pending', at: new Date().toISOString(), actor: 'applicant' }], user: person(who.id, 'Test User', 'testuser'),
            };
            state.applications.push(app);
            c.applicationCount += 1;
            return send(route, 201, { success: true, data: applicantView(app) });
        }
        r = m(/^\/([0-9a-f]{24})$/);
        if (method === 'GET' && r) {
            const c = state.cohorts.find((x) => x._id === r![1]);
            if (!c || (!staff && (!c.isActive || c.status === 'draft'))) return fail(route, 404, 'INTERNSHIP_NOT_FOUND', 'Cohort not found');
            return send(route, 200, { success: true, data: detail(c) });
        }
        if (method === 'PUT' && r) {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const c = state.cohorts.find((x) => x._id === r![1]);
            if (!c) return fail(route, 404, 'INTERNSHIP_NOT_FOUND', 'Cohort not found');
            if (typeof body.capacity === 'number' && body.capacity > 0 && body.capacity < c.acceptedCount) return fail(route, 409, 'INTERNSHIP_CAPACITY_TOO_LOW', 'too low');
            Object.assign(c, body, { updatedAt: new Date().toISOString() });
            return send(route, 200, { success: true, data: detail(c) });
        }
        if (method === 'POST' && (path === '/api/internships' || path === '/api/internships/')) {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const c = base({ ...(body as object), _id: String(state.cohorts.length + 1).padStart(24, '9'), title: String(body.title), acceptedCount: 0, applicationCount: 0, isActive: true } as never);
            state.cohorts.push(c);
            return send(route, 201, { success: true, data: detail(c) });
        }
        return fail(route, 404, 'NOT_FOUND', 'Not found');
    });
    return state;
}
