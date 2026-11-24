import type { Page, Route } from '@playwright/test';

/**
 * An in-memory stand-in for the jobs API, so the e2e specs run without a backend. Reads answer from
 * `state`; writes change it and are also pushed to `calls` for assertions. The rules follow the real
 * API (who sees a job, the status moves, the review decisions, the report and save rules), so the
 * screens are exercised, not the mock.
 */

const DAY = 86_400_000;
export const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString();

export type Who = 'visitor' | 'member' | 'employer' | 'moderator' | 'admin';

const USERS: Record<Exclude<Who, 'visitor'>, { id: string; role: string }> = {
    member: { id: 'user-1', role: 'user' },
    employer: { id: 'emp-1', role: 'employer' },
    moderator: { id: 'mod-1', role: 'moderator' },
    admin: { id: 'adm-1', role: 'admin' },
};

export const LIVE_ID = 'a'.repeat(24);
export const SOC_ID = 'b'.repeat(24);
export const DRAFT_ID = 'c'.repeat(24);
export const PENDING_ID = 'd'.repeat(24);
export const REJECTED_ID = 'e'.repeat(24);
export const CLOSED_ID = 'f'.repeat(24);
export const QUEUED_A = '1'.repeat(24);
export const QUEUED_B = '2'.repeat(24);
export const OTHERS_PENDING_ID = '3'.repeat(24);

export type Status = 'draft' | 'pending' | 'approved' | 'rejected' | 'closed' | 'expired';

export interface JobRecord extends Record<string, unknown> {
    _id: string; slug: string; title: string; status: Status; owner: string; category: string; description: string;
    expiresAt: string; reportCount: number; moderation?: { reason?: string; at?: string };
    slugHistory?: string[];
}

interface CompanyRecord extends Record<string, unknown> { _id: string; name: string; slug: string; status: 'pending' | 'verified' | 'rejected'; owner: string }

export interface MockState {
    jobs: JobRecord[];
    companies: CompanyRecord[];
    /** Ids of the jobs the signed-in member saved */
    saved: Set<string>;
    reported: Set<string>;
    moderationEnabled: boolean;
    /** The list answers this many cards per page */
    pageCap: number;
    /** `METHOD path-suffix` to an error answered once */
    failOnce: Record<string, { status: number; code?: string; message?: string; details?: { field: string; message: string }[]; meta?: Record<string, unknown> }>;
    calls: { method: string; path: string; body?: Record<string, unknown> }[];
}

const make = (over: Partial<JobRecord> & { _id: string; title: string }): JobRecord => ({
    slug: `${over.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${over._id.slice(-6)}`,
    status: 'approved', owner: 'someone-else', category: 'pentesting', company: 'Acme Security', companyLogo: null, companyRef: { _id: 'c-acme', name: 'Acme Security', slug: 'acme-security', logo: null, status: 'verified', isVerified: true },
    employmentType: 'full-time', experienceLevel: 'senior', locationType: 'remote', location: null,
    salary: { min: 90000, max: 120000, currency: 'USD', period: 'yearly' }, skills: ['Burp Suite', 'Python'], isFeatured: false,
    applicationDeadline: null, expiresAt: iso(20), createdAt: iso(-3), updatedAt: iso(-1), viewCount: 41, reportCount: 0,
    description: `${over.title}: break things for a living and write it up so the team can fix them. Plenty of detail follows so the description is long enough.`,
    requirements: ['3+ years of web testing'], responsibilities: ['Run tests'], benefits: ['Conference budget'],
    applyUrl: 'https://careers.acme-security.com/apply/1', applyEmail: null, applicationCount: 0,
    ...over,
}) as JobRecord;

export function freshState(over: Partial<MockState> = {}): MockState {
    return {
        jobs: [
            make({ _id: LIVE_ID, title: 'Senior Pentester', slug: 'senior-pentester-aaaaaa' }),
            make({ _id: SOC_ID, title: 'SOC Analyst', slug: 'soc-analyst-bbbbbb', category: 'soc', experienceLevel: 'mid', skills: ['Splunk'], viewCount: 7 }),
            make({ _id: DRAFT_ID, title: 'Draft Role Of Mine', status: 'draft', owner: 'emp-1', slug: 'draft-role-of-mine-cccccc' }),
            make({ _id: PENDING_ID, title: 'Pending Role Of Mine', status: 'pending', owner: 'emp-1', slug: 'pending-role-of-mine-dddddd' }),
            make({ _id: REJECTED_ID, title: 'Rejected Role Of Mine', status: 'rejected', owner: 'emp-1', slug: 'rejected-role-of-mine-eeeeee', moderation: { reason: 'Add a real apply link and the pay range' } }),
            make({ _id: CLOSED_ID, title: 'Closed Role Of Mine', status: 'closed', owner: 'emp-1', slug: 'closed-role-of-mine-ffffff' }),
            make({ _id: QUEUED_A, title: 'Queued Role Alpha', status: 'pending', owner: 'emp-2', slug: 'queued-role-alpha-111111', companyRef: { _id: 'c-new', name: 'NewCo', slug: 'newco', logo: null, status: 'pending', isVerified: false }, company: 'NewCo' }),
            make({ _id: QUEUED_B, title: 'Queued Role Beta', status: 'pending', owner: 'emp-2', slug: 'queued-role-beta-222222', description: 'A job with <script>window.__pwned = true</script> in its text, which must be shown as text and never run. More words to pass the minimum length.' }),
        ],
        companies: [
            { _id: 'c-acme', name: 'Acme Security', slug: 'acme-security', status: 'verified', owner: 'emp-1', description: 'We test things.', industry: 'Security', size: '11-50', location: 'Berlin', website: 'https://acme-security.com', logo: null, socialLinks: null, createdAt: iso(-90) },
            { _id: 'c-new', name: 'NewCo', slug: 'newco', status: 'pending', owner: 'emp-2', description: 'A new company.', industry: 'Consulting', size: '1-10', location: 'Oslo', website: 'https://newco.io', logo: null, socialLinks: null, createdAt: iso(-1) },
        ],
        saved: new Set<string>(),
        reported: new Set<string>(),
        moderationEnabled: true,
        pageCap: 100,
        failOnce: {},
        calls: [],
        ...over,
    };
}

const cors = (route: Route) => ({
    'access-control-allow-origin': route.request().headers()['origin'] || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
});
const send = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: cors(route), body: JSON.stringify(body) });
const fail = (route: Route, status: number, code: string, message: string, extra: Record<string, unknown> = {}) => send(route, status, { success: false, error: { code, message, ...extra } });
const paged = (items: unknown[], page: number, limit: number, extra: Record<string, unknown> = {}) => {
    const start = (page - 1) * limit;
    const slice = items.slice(start, start + limit);
    return { success: true, data: slice, pagination: { page, limit, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / limit)), pages: Math.max(1, Math.ceil(items.length / limit)), hasMore: start + slice.length < items.length }, ...extra };
};

const isLive = (j: JobRecord) => j.status === 'approved' && new Date(j.expiresAt).getTime() > Date.now();

export async function mockJobsApi(page: Page, who: Who, state: MockState = freshState()): Promise<MockState> {
    const me = who === 'visitor' ? null : USERS[who];
    const staff = who === 'moderator' || who === 'admin';
    // A member who registers as an employer becomes one for the rest of the page's life
    let upgraded = false;
    const poster = () => who === 'employer' || who === 'admin' || upgraded;
    if (me) await page.addInitScript(() => window.localStorage.setItem('token', 'e2e-token'));

    const cardOf = (j: JobRecord) => {
        const { owner, status, moderation, reportCount, applicationCount, requirements, responsibilities, benefits, applyUrl, applyEmail, updatedAt, slugHistory, ...rest } = j;
        void owner; void status; void moderation; void reportCount; void applicationCount; void requirements; void responsibilities; void benefits; void applyUrl; void applyEmail; void updatedAt; void slugHistory;
        return { ...rest, description: String(j.description).slice(0, 300), isActive: isLive(j) };
    };
    const detailOf = (j: JobRecord) => {
        const mine = !!me && j.owner === me.id;
        const base: Record<string, unknown> = { ...cardOf(j), description: j.description, requirements: j.requirements, responsibilities: j.responsibilities, benefits: j.benefits, applyUrl: j.applyUrl, applyEmail: j.applyEmail, updatedAt: j.updatedAt, companyWebsite: 'https://acme-security.com', companyDescription: null };
        if (me) base.viewer = { saved: state.saved.has(j._id), isOwner: mine };
        else base.viewer = null;
        if (mine || staff) Object.assign(base, { status: j.status, moderation: j.moderation ?? {}, applicationCount: j.applicationCount });
        if (staff) Object.assign(base, { reportCount: j.reportCount, heldForReports: false, postedBy: { _id: j.owner, username: j.owner, name: j.owner === 'emp-2' ? 'Nora Newco' : 'Pat Poster', email: `${j.owner}@example.org`, role: 'employer' } });
        return base;
    };
    const find = (ref: string) => state.jobs.find((j) => j._id === ref || j.slug === ref || j.slugHistory?.includes(ref));
    const visible = (j: JobRecord) => isLive(j) || staff || (!!me && j.owner === me.id);
    const companyOf = (owner: string) => state.companies.find((c) => c.owner === owner);

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

        if (path === '/api/auth/me') {
            return me ? send(route, 200, { success: true, data: { id: me.id, _id: me.id, name: 'Test User', username: 'testuser', email: 'test@acme-security.com', role: upgraded ? 'employer' : me.role, isVerified: true, provider: 'local' } }) : fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
        }
        const isJobs = path.startsWith('/api/jobs') || path.startsWith('/api/companies') || path.startsWith('/api/bookmarks') || path.startsWith('/api/moderation');
        if (!isJobs) {
            if (path === '/api/notifications/unread-count') return send(route, 200, { success: true, data: { count: 0, byType: {} } });
            return send(route, 200, { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1, hasMore: false } });
        }

        state.calls.push({ method, path, ...(method === 'GET' ? {} : { body }) });

        const once = Object.entries(state.failOnce).find(([k]) => k.split(' ')[0] === method && path.endsWith(k.split(' ')[1]));
        if (once && method !== 'GET') {
            delete state.failOnce[once[0]];
            const f = once[1];
            return fail(route, f.status, f.code ?? 'INTERNAL_ERROR', f.message ?? 'Something failed', { ...(f.details ? { details: f.details } : {}), ...(f.meta ? { meta: f.meta } : {}) });
        }

        const reviewerOnly = () => (staff ? null : fail(route, token ? 403 : 401, token ? 'AUTHZ_FORBIDDEN' : 'AUTH_REQUIRED', 'Forbidden'));
        const posterOnly = () => (poster() ? null : fail(route, token ? 403 : 401, token ? 'AUTHZ_FORBIDDEN' : 'AUTH_REQUIRED', 'Forbidden'));

        // ---- bookmarks (save)
        if (path === '/api/bookmarks' && method === 'POST') {
            if (!me) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
            const j = find(String(body.contentId));
            if (!j || !isLive(j)) return fail(route, 404, 'JOB_NOT_FOUND', 'Job not found');
            state.saved.add(j._id);
            return send(route, 201, { success: true, data: { saved: true } });
        }
        let r = path.match(/^\/api\/bookmarks\/job\/([^/]+)$/);
        if (r && method === 'DELETE') {
            if (!me) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
            state.saved.delete(r[1]);
            return send(route, 200, { success: true });
        }

        // ---- the moderation queue (reported jobs)
        if (path === '/api/moderation/items/review' && method === 'POST') {
            const denied = reviewerOnly(); if (denied) return denied;
            const j = find(String(body.contentId));
            if (!j) return fail(route, 404, 'JOB_NOT_FOUND', 'Job not found');
            if (body.action === 'dismiss') { j.reportCount = 0; if (j.status === 'pending') j.status = 'approved'; }
            return send(route, 200, { success: true });
        }

        // ---- companies
        if (path === '/api/companies/become-employer' && method === 'POST') {
            if (!me) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
            if (!String(body.name ?? '').trim()) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ field: 'name', message: 'Company name is required' }] });
            const c: CompanyRecord = { _id: 'c-mine', name: String(body.name), slug: 'my-company', status: 'pending', owner: me.id };
            state.companies.push(c);
            upgraded = true;
            return send(route, 201, { success: true, data: c });
        }
        if (path === '/api/companies/my/profile') {
            const denied = posterOnly(); if (denied) return denied;
            if (method === 'GET') return send(route, 200, { success: true, data: companyOf(me!.id) ?? null });
            if (method === 'POST') {
                const mineCompany = companyOf(me!.id);
                if (!String(body.name ?? '').trim()) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ field: 'name', message: 'Company name is required' }] });
                if (mineCompany) { Object.assign(mineCompany, body, { status: mineCompany.status === 'rejected' ? 'pending' : mineCompany.status }); return send(route, 200, { success: true, data: mineCompany }); }
                const c: CompanyRecord = { _id: 'c-mine', slug: 'my-company', ...(body as object), name: String(body.name), status: 'pending', owner: me!.id };
                state.companies.push(c);
                return send(route, 200, { success: true, data: c });
            }
        }
        if (path === '/api/companies/admin' && method === 'GET') {
            const denied = reviewerOnly(); if (denied) return denied;
            const want = q.get('status') || 'pending';
            const rows = state.companies.filter((c) => want === 'all' || c.status === want).map((c) => ({ ...c, owner: { _id: c.owner, username: c.owner, name: 'Owner', email: `${c.owner}@example.org` }, jobs: { pending: state.jobs.filter((j) => j.owner === c.owner && j.status === 'pending').length } }));
            return send(route, 200, paged(rows, Number(q.get('page') || 1), Number(q.get('limit') || 20)));
        }
        r = path.match(/^\/api\/companies\/admin\/([^/]+)\/(approve|reject)$/);
        if (r && method === 'POST') {
            const denied = reviewerOnly(); if (denied) return denied;
            const c = state.companies.find((x) => x._id === r![1]);
            if (!c) return fail(route, 404, 'COMPANY_NOT_FOUND', 'Company not found');
            c.status = r[2] === 'approve' ? 'verified' : 'rejected';
            if (r[2] === 'reject') c.moderation = { reason: String(body.reason ?? '') };
            return send(route, 200, { success: true, data: c });
        }
        r = path.match(/^\/api\/companies\/([^/]+)\/jobs$/);
        if (r && method === 'GET') {
            const c = state.companies.find((x) => x.slug === r![1] && x.status !== 'rejected');
            if (!c) return fail(route, 404, 'COMPANY_NOT_FOUND', 'Company not found');
            return send(route, 200, paged(state.jobs.filter((j) => isLive(j) && (j.companyRef as { slug: string }).slug === c.slug).map(cardOf), 1, 20));
        }
        r = path.match(/^\/api\/companies\/([^/]+)$/);
        if (r && method === 'GET') {
            const c = state.companies.find((x) => x.slug === r![1] && x.status !== 'rejected');
            return c ? send(route, 200, { success: true, data: c }) : fail(route, 404, 'COMPANY_NOT_FOUND', 'Company not found');
        }

        // ---- the public list and the member lists
        if (path === '/api/jobs' && method === 'GET') {
            const limit = Math.min(Number(q.get('limit') || 20), state.pageCap);
            let items = state.jobs.filter(isLive);
            if (q.get('category')) items = items.filter((j) => j.category === q.get('category'));
            const needle = (q.get('search') || q.get('q') || '').toLowerCase();
            if (needle) items = items.filter((j) => `${j.title} ${j.company} ${(j.skills as string[]).join(' ')}`.toLowerCase().includes(needle));
            return send(route, 200, paged(items.map(cardOf), Number(q.get('page') || 1), limit, me ? { viewer: { savedIds: Array.from(state.saved) } } : {}));
        }
        if (path === '/api/jobs/saved/me' && method === 'GET') {
            if (!me) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
            const ids = Array.from(state.saved);
            const live = ids.map((id) => find(id)).filter((j): j is JobRecord => !!j && isLive(j));
            return send(route, 200, paged(live.map((j) => ({ ...cardOf(j), savedAt: iso(-1) })), 1, 20, { unavailable: ids.length - live.length }));
        }
        if (path === '/api/jobs/mine' && method === 'GET') {
            const denied = posterOnly(); if (denied) return denied;
            let mine = state.jobs.filter((j) => j.owner === me!.id);
            if (q.get('status')) mine = mine.filter((j) => j.status === q.get('status'));
            return send(route, 200, paged(mine.map((j) => ({ ...cardOf(j), status: j.status, moderation: j.moderation ?? {}, applicationCount: j.applicationCount })), 1, 20));
        }
        if (path === '/api/jobs/mine/stats' && method === 'GET') {
            const denied = posterOnly(); if (denied) return denied;
            const mine = state.jobs.filter((j) => j.owner === me!.id);
            const byStatus: Record<string, number> = {};
            for (const j of mine) byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
            return send(route, 200, { success: true, data: { totalJobs: mine.length, activeJobs: mine.filter(isLive).length, totalViews: 120, totalApplications: 9, byStatus } });
        }

        // ---- review
        if (path === '/api/jobs/admin' && method === 'GET') {
            const denied = reviewerOnly(); if (denied) return denied;
            const reported = q.get('reported') === 'true';
            const status = q.get('status') || (reported ? 'all' : 'pending');
            let items = state.jobs.filter((j) => (status === 'all' || j.status === status) && (!reported || j.reportCount > 0));
            const needle = (q.get('q') || '').toLowerCase();
            if (needle) items = items.filter((j) => `${j.title} ${j.company}`.toLowerCase().includes(needle));
            return send(route, 200, paged(items.map(detailOf), Number(q.get('page') || 1), Number(q.get('limit') || 20)));
        }
        if (path === '/api/jobs/admin/stats' && method === 'GET') {
            const denied = reviewerOnly(); if (denied) return denied;
            const jobs: Record<string, number> = {};
            for (const j of state.jobs) jobs[j.status] = (jobs[j.status] ?? 0) + 1;
            return send(route, 200, { success: true, data: { jobs, live: state.jobs.filter(isLive).length, reported: state.jobs.filter((j) => j.reportCount > 0).length, pendingCompanies: state.companies.filter((c) => c.status === 'pending').length, moderationEnabled: state.moderationEnabled } });
        }
        r = path.match(/^\/api\/jobs\/admin\/([^/]+)\/(approve|reject)$/);
        if (r && method === 'POST') {
            const denied = reviewerOnly(); if (denied) return denied;
            const j = find(r[1]);
            if (!j) return fail(route, 404, 'JOB_NOT_FOUND', 'Job not found');
            if (r[2] === 'approve') {
                if (j.status === 'approved') return send(route, 200, { success: true, data: detailOf(j) });
                if (j.status !== 'pending' && j.status !== 'rejected') return fail(route, 409, 'JOB_INVALID_TRANSITION', 'no', { meta: { status: j.status, to: 'approved' } });
                j.status = 'approved';
                if (new Date(j.expiresAt).getTime() < Date.now()) j.expiresAt = iso(30);
                return send(route, 200, { success: true, data: detailOf(j) });
            }
            const reason = String(body.reason ?? '').trim();
            if (reason.length < 3) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ field: 'reason', message: 'Give the poster a reason (at least 3 characters)' }] });
            if (j.status !== 'pending' && j.status !== 'approved') return fail(route, 409, 'JOB_INVALID_TRANSITION', 'no', { meta: { status: j.status, to: 'rejected' } });
            j.status = 'rejected';
            j.moderation = { reason, at: new Date().toISOString() };
            return send(route, 200, { success: true, data: detailOf(j) });
        }

        // ---- one job
        r = path.match(/^\/api\/jobs\/([^/]+)\/apply$/);
        if (r && method === 'POST') {
            const j = find(r[1]);
            if (!j || !isLive(j)) return fail(route, 404, 'JOB_NOT_FOUND', 'Job not found');
            j.applicationCount = Number(j.applicationCount) + 1;
            return send(route, 200, { success: true, data: { applyUrl: j.applyUrl, applyEmail: j.applyEmail } });
        }
        r = path.match(/^\/api\/jobs\/([^/]+)\/report$/);
        if (r && method === 'POST') {
            if (!me) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
            const j = find(r[1]);
            if (!j || !isLive(j)) return fail(route, 404, 'JOB_NOT_FOUND', 'Job not found');
            if (j.owner === me.id) return fail(route, 400, 'JOB_OWN_REPORT', 'You cannot report your own job');
            if (state.reported.has(j._id)) return fail(route, 409, 'CONFLICT', 'You have already reported this job');
            state.reported.add(j._id);
            j.reportCount += 1;
            return send(route, 201, { success: true, data: { reported: true } });
        }
        r = path.match(/^\/api\/jobs\/([^/]+)\/(submit|close|reopen)$/);
        if (r && method === 'POST') {
            const denied = posterOnly(); if (denied) return denied;
            const j = find(r[1]);
            if (!j || (j.owner !== me!.id && who !== 'admin')) return fail(route, 404, 'JOB_NOT_FOUND', 'Job not found');
            const action = r[2];
            const allowed: Record<string, Status[]> = { submit: ['draft', 'rejected'], close: ['draft', 'pending', 'approved', 'rejected'], reopen: ['closed', 'expired'] };
            if (!allowed[action].includes(j.status)) return fail(route, 409, 'JOB_INVALID_TRANSITION', 'no', { meta: { status: j.status, to: action } });
            if (action === 'close') j.status = 'closed';
            else {
                const verified = companyOf(j.owner)?.status === 'verified';
                j.status = !state.moderationEnabled || verified || who === 'admin' ? 'approved' : 'pending';
                if (action === 'reopen') j.expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : iso(30);
            }
            return send(route, 200, { success: true, data: detailOf(j) });
        }
        if (path === '/api/jobs' && method === 'POST') {
            const denied = posterOnly(); if (denied) return denied;
            const details: { field: string; message: string }[] = [];
            if (String(body.title ?? '').trim().length < 5) details.push({ field: 'title', message: 'Title must be at least 5 characters' });
            if (String(body.description ?? '').trim().length < 50) details.push({ field: 'description', message: 'Description must be at least 50 characters' });
            if (body.applyUrl && !/^https?:\/\//.test(String(body.applyUrl))) details.push({ field: 'applyUrl', message: 'Must be an http or https link' });
            if (details.length) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details });
            const company = companyOf(me!.id);
            if (company?.status === 'rejected') return fail(route, 403, 'COMPANY_REJECTED', 'Company rejected', { meta: { reason: company.moderation ? (company.moderation as { reason: string }).reason : 'Not approved' } });
            const open = state.jobs.filter((j) => j.owner === me!.id && ['draft', 'pending', 'approved'].includes(j.status)).length;
            if (open >= 10 && company?.status !== 'verified') return fail(route, 409, 'JOB_LIMIT_REACHED', 'Limit', { meta: { limit: 10 } });
            const verified = company?.status === 'verified' || who === 'admin';
            const status: Status = body.saveAsDraft ? 'draft' : !state.moderationEnabled || verified ? 'approved' : 'pending';
            const id = String(state.jobs.length + 1).padStart(24, '9');
            const j = make({ ...(body as object), _id: id, title: String(body.title), owner: me!.id, status, slug: `${String(body.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${id.slice(-6)}`, company: company?.name ?? 'Acme Security', expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : iso(30) } as never);
            state.jobs.push(j);
            return send(route, 201, { success: true, data: detailOf(j) });
        }
        r = path.match(/^\/api\/jobs\/([^/]+)$/);
        if (r && method === 'PUT') {
            const denied = posterOnly(); if (denied) return denied;
            const j = find(r[1]);
            if (!j || (j.owner !== me!.id && who !== 'admin')) return fail(route, 404, 'JOB_NOT_FOUND', 'Job not found');
            const details: { field: string; message: string }[] = [];
            if (body.title !== undefined && String(body.title).trim().length < 5) details.push({ field: 'title', message: 'Title must be at least 5 characters' });
            if (details.length) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details });
            const { salary, ...rest } = body as Record<string, unknown> & { salary?: Record<string, unknown> };
            Object.assign(j, rest, { updatedAt: new Date().toISOString() });
            if (salary) j.salary = Object.keys(salary).length ? salary : null;
            return send(route, 200, { success: true, data: detailOf(j) });
        }
        if (r && method === 'DELETE') {
            const denied = posterOnly(); if (denied) return denied;
            const j = find(r[1]);
            if (!j || (j.owner !== me!.id && who !== 'admin')) return fail(route, 404, 'JOB_NOT_FOUND', 'Job not found');
            state.jobs = state.jobs.filter((x) => x !== j);
            return send(route, 200, { success: true });
        }
        if (r && method === 'GET') {
            const j = find(r[1]);
            if (!j || !visible(j)) return fail(route, 404, 'JOB_NOT_FOUND', 'Job not found');
            const meta: Record<string, string> = {};
            if (j.slug !== r[1] && j._id !== r[1]) { meta.redirectedFromSlug = r[1]; meta.canonicalSlug = j.slug; }
            return send(route, 200, { success: true, data: detailOf(j), meta });
        }
        return fail(route, 404, 'NOT_FOUND', 'Not found');
    });
    return state;
}
