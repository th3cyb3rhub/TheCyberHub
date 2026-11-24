import type { Page, Route } from '@playwright/test';
import { json, preflight, signInAs, testUser } from './helpers';

/**
 * An in-memory stand-in for the roadmap, learning path and resource APIs, so the e2e specs run
 * without a backend. Reads answer from `state`; writes change it and are pushed to `calls`.
 */

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString();
const page1 = (n: number, limit = 12) => ({ page: 1, limit, total: n, totalPages: 1, hasMore: false });

export const OBJECT_ID = 'a'.repeat(24);

interface MockNode { id: string; key: string; title: string; description: string; stage: string; duration: string; optional: boolean; requires: string[]; items: unknown[] }

const node = (key: string, title: string, stage: string, over: Partial<MockNode> = {}): MockNode => ({
    id: `n-${key}`, key, title, description: `${title}: what it is and why it matters.`, stage, duration: '2 hours', optional: false, requires: [], items: [], ...over,
});

export const MODULES: MockNode[] = [
    node('http', 'How the web works', 'Foundations', {
        items: [
            { kind: 'resource', ref: OBJECT_ID, title: 'OWASP Top 10', optional: false, href: '/resources/owasp-top-10', external: false, resourceType: 'article', isFree: true, difficulty: 'beginner', domain: 'owasp.org' },
            { kind: 'external', ref: 'https://developer.mozilla.org/en-US/docs/Web/HTTP', title: 'MDN: HTTP', optional: true, href: 'https://developer.mozilla.org/en-US/docs/Web/HTTP', external: true, domain: 'developer.mozilla.org' },
        ],
    }),
    node('burp', 'Set up Burp Suite', 'Foundations', { requires: ['http'], duration: '1 hour', items: [{ kind: 'tool', ref: 'jwt-analyzer', title: 'JWT analyzer', optional: false, href: '/tools/jwt-analyzer', external: false }] }),
    node('xss', 'Cross-site scripting', 'Attacks', { requires: ['burp'], items: [{ kind: 'challenge', ref: 'reflected-xss', title: 'Reflected XSS lab', optional: false, href: '/challenges/reflected-xss', external: false, difficulty: 'beginner' }] }),
    node('sqli', 'SQL injection', 'Attacks', { requires: ['burp'] }),
    node('auth', 'Broken authentication', 'Attacks', { requires: ['xss', 'sqli'] }),
    node('report', 'Write a clear report', 'Wrap up', { optional: true, requires: ['auth'], items: [{ kind: 'external', ref: 'https://example.org/bad', title: 'Sample report (link may be broken)', optional: true, href: 'https://example.org/bad', external: true, domain: 'example.org', linkStatus: 'broken' }] }),
];

const STAGES = [
    { title: 'Foundations', moduleIds: ['n-http', 'n-burp'] },
    { title: 'Attacks', moduleIds: ['n-xss', 'n-sqli', 'n-auth'] },
    { title: 'Wrap up', moduleIds: ['n-report'] },
];

const card = (over: Record<string, unknown> = {}) => ({
    id: 'p-web', slug: 'web-hacking', title: 'Web application hacking', kind: 'roadmap', shortDescription: 'From how HTTP works to finding and reporting your first real bugs.',
    category: 'offensive', difficulty: 'beginner', estimatedDuration: '8 weeks', skills: ['http', 'burp', 'xss', 'sqli'], moduleCount: MODULES.length,
    requiredCount: MODULES.filter((m) => !m.optional).length, enrollmentCount: 128, completionCount: 9, isFeatured: true, publishedAt: iso(-60), viewer: null, ...over,
});

export const CARDS = [
    card(),
    card({ id: 'p-blue', slug: 'blue-team', title: 'Blue team fundamentals', category: 'defensive', difficulty: 'intermediate', shortDescription: 'Logging, detection and incident response for defenders.', enrollmentCount: 54, completionCount: 3, isFeatured: false, skills: ['siem', 'dfir'] }),
    card({ id: 'p-cloud', slug: 'cloud-security', title: 'Cloud security', category: 'cloud', difficulty: 'advanced', shortDescription: 'Identity, networking and misconfigurations in AWS and Azure.', enrollmentCount: 31, completionCount: 1, isFeatured: false, skills: ['iam', 'aws'] }),
];
export const PATH_CARDS = [
    card({ id: 'p-linux', slug: 'linux-basics', kind: 'path', title: 'Linux for hackers', category: 'beginner', shortDescription: 'The shell, files, permissions and processes.', moduleCount: 5, requiredCount: 5, enrollmentCount: 200, isFeatured: false, skills: ['bash', 'linux'] }),
];

export const RESOURCES = [
    { id: OBJECT_ID, slug: 'owasp-top-10', title: 'OWASP Top 10', description: 'The ten most critical web application security risks, with examples and prevention advice for each.', url: 'https://owasp.org/Top10', domain: 'owasp.org', type: 'article', topic: 'web-security', difficulty: 'beginner', isFree: true, tags: ['owasp', 'web'], upvotes: 24, downvotes: 1, score: 23, views: 1320, isFeatured: true, linkStatus: 'ok', submittedBy: { username: 'ada', avatar: null, id: 'u-ada' }, createdAt: iso(-40), approvedAt: iso(-39), status: 'approved' },
    { id: 'b'.repeat(24), slug: 'portswigger-academy', title: 'Web Security Academy', description: 'Free, hands-on labs for every class of web vulnerability from the makers of Burp Suite.', url: 'https://portswigger.net/web-security', domain: 'portswigger.net', type: 'course', topic: 'web-security', difficulty: 'intermediate', isFree: true, tags: ['burp', 'labs'], upvotes: 41, downvotes: 0, score: 41, views: 2210, isFeatured: false, linkStatus: 'ok', submittedBy: { username: 'linus', avatar: null, id: 'u-linus' }, createdAt: iso(-30), approvedAt: iso(-29), status: 'approved' },
    { id: 'c'.repeat(24), slug: 'blue-team-handbook', title: 'Blue Team Handbook', description: 'A field guide for incident responders: triage, containment and what to log from day one.', url: 'https://example.org/blue-team', domain: 'example.org', type: 'book', topic: 'blue-team', difficulty: 'advanced', isFree: false, tags: ['dfir'], upvotes: 8, downvotes: 2, score: 6, views: 340, isFeatured: false, linkStatus: 'ok', submittedBy: { username: 'sam', avatar: null, id: 'u-sam' }, createdAt: iso(-20), approvedAt: iso(-19), status: 'approved' },
].map((r) => ({ ...r, viewer: null as unknown }));

export interface LearningState {
    ticked: string[];
    enrolled: boolean;
    bookmarked: boolean;
    updatedAt: string;
    /** The editor's save answers PATH_CONFLICT once, as if someone else saved first */
    conflictOnSave: boolean;
    pathStatus: 'draft' | 'in_review' | 'published' | 'archived';
    queue: { slug: string; title: string; status: 'pending' | 'approved' | 'rejected'; url: string; openReports?: number; linkStatus?: string }[];
    calls: { method: string; path: string; body?: unknown }[];
}

export const freshState = (over: Partial<LearningState> = {}): LearningState => ({
    ticked: [], enrolled: false, bookmarked: false, updatedAt: '2026-11-01T10:00:00.000Z', conflictOnSave: false, pathStatus: 'draft',
    queue: [
        { slug: 'new-xss-guide', title: 'A practical XSS guide', status: 'pending', url: 'https://example.org/xss' },
        { slug: 'shady-tool', title: 'Free exploit kit download', status: 'pending', url: 'https://example.org/kit', openReports: 2, linkStatus: 'broken' },
    ],
    calls: [], ...over,
});

const NEXT_RULES = (done: Set<string>) => {
    const keyDone = new Set(MODULES.filter((m) => done.has(m.id)).map((m) => m.key));
    const waiting = (m: MockNode) => m.requires.filter((k) => !keyDone.has(k));
    let blocked: unknown = null;
    for (let index = 0; index < MODULES.length; index += 1) {
        const m = MODULES[index];
        if (m.optional || done.has(m.id)) continue;
        const missing = waiting(m);
        if (!missing.length) return { ...m, index, reason: 'continue', waitingFor: [] };
        if (!blocked) blocked = { ...m, index, reason: 'blocked', waitingFor: missing };
    }
    if (blocked) return blocked;
    for (let index = 0; index < MODULES.length; index += 1) {
        const m = MODULES[index];
        if (m.optional && !done.has(m.id)) return { ...m, index, reason: 'optional', waitingFor: [] };
    }
    return null;
};

function progressFor(state: LearningState) {
    const done = new Set(state.ticked);
    const required = MODULES.filter((m) => !m.optional);
    const requiredCompleted = required.filter((m) => done.has(m.id)).length;
    const percent = Math.round((requiredCompleted / required.length) * 100);
    const complete = requiredCompleted === required.length;
    return {
        pathId: 'p-web', pathSlug: 'web-hacking', kind: 'roadmap', status: complete ? 'completed' : done.size ? 'in-progress' : 'enrolled', progress: percent, percent,
        completedModules: state.ticked, completedCount: done.size, requiredCount: required.length, requiredCompleted, totalModules: MODULES.length,
        enrolledAt: iso(-3), startedAt: iso(-3), completedAt: complete ? iso(0) : null, lastActivityAt: iso(0), currentStreak: 2, longestStreak: 3,
        certificateId: complete ? 'CH-DEMO-2026' : null,
    };
}

export function detailFor(state: LearningState, signedIn: boolean, canEdit = false) {
    const progress = progressFor(state);
    const enrolled = state.enrolled || state.ticked.length > 0;
    return {
        ...card({ viewer: undefined }),
        description: 'A hands-on route through web hacking. Start with how the web works, set up your tools, then attack the classic bug classes one by one and finish by writing a report.',
        prerequisites: [], stages: STAGES, modules: MODULES, archived: false, updatedAt: state.updatedAt,
        viewer: signedIn ? { enrolled, bookmarked: state.bookmarked, progress: enrolled ? progress : null, next: NEXT_RULES(new Set(state.ticked)), certificateId: progress.certificateId, canEdit } : null,
    };
}

/** The author is the signed-in member for a moderator, so the editor lets them change it */
const editorPath = (state: LearningState, authorId = 'u-ada') => ({
    ...card({ viewer: undefined }), status: state.pathStatus, description: 'A hands-on route through web hacking.', seo: { metaDescription: 'Learn web hacking step by step.' }, prerequisites: [],
    reviewedAt: null, stages: STAGES, updatedAt: state.updatedAt, createdBy: { id: authorId, username: authorId === 'u-ada' ? 'ada' : testUser.username },
    modules: MODULES.map((m) => ({ ...m, items: m.items.map((i) => { const { kind, ref, title, optional } = i as Record<string, unknown>; return { kind, ref, title, optional }; }) })),
});

const resourceViewer = (over: Record<string, unknown> = {}) => ({ vote: 0, bookmarked: false, reading: null, isOwner: false, canEdit: false, canDelete: false, canModerate: false, ...over });

const reply = (route: Route, body: unknown, status = 200) => json(route, body, status);
const failure = (route: Route, status: number, code: string, message: string, extra: Record<string, unknown> = {}) => reply(route, { success: false, error: { code, message, ...extra } }, status);

export interface MockOptions { role?: 'user' | 'moderator' | 'admin' | null; state?: LearningState }

/** Install after (or instead of) signInAs: call with `role: null` for a visitor. */
export async function mockLearningApi(page: Page, { role = 'user', state = freshState() }: MockOptions = {}) {
    const signedIn = role !== null;
    if (signedIn) await signInAs(page, { ...testUser, id: testUser._id, role });
    else await page.route('**/api/auth/me', (route) => (route.request().method() === 'OPTIONS' ? preflight(route) : reply(route, { success: false, message: 'Unauthorized' }, 401)));
    const canEdit = role === 'moderator' || role === 'admin';

    await page.route('**/api/**', async (route) => {
        const req = route.request();
        const method = req.method();
        const url = new URL(req.url());
        const path = url.pathname;
        if (method === 'OPTIONS') return preflight(route);
        // The dashboard's daily challenge card expects an object; no challenge today keeps it out of the way
        if (path.startsWith('/api/daily-challenge')) return failure(route, 404, 'NOT_FOUND', 'No challenge today');
        if (path === '/api/onboarding' && method === 'GET') {
            // The dashboard shows an onboarding card; a finished one keeps it out of the way
            return reply(route, { success: true, data: { state: { step: 4, completedAt: iso(-10), skippedAt: null, checklistDismissedAt: iso(-9) }, needsOnboarding: false, interests: [], experienceLevel: null, goal: null, checklist: [], progress: { done: 5, total: 5 }, next: { challenge: null, event: null } } });
        }
        if (!/^\/api\/(learning-paths|certificates|resources|bookmarks)/.test(path)) return route.fallback();
        let body: unknown;
        try { body = req.postDataJSON(); } catch { body = undefined; }
        if (method !== 'GET') state.calls.push({ method, path, body });
        const q = url.searchParams;

        // ---- learning paths
        if (path === '/api/learning-paths' && method === 'GET') {
            const kind = q.get('kind');
            const list = kind === 'path' ? PATH_CARDS : CARDS;
            const search = (q.get('search') ?? '').toLowerCase();
            const data = list.filter((c) => (!q.get('category') || c.category === q.get('category')) && (!q.get('difficulty') || c.difficulty === q.get('difficulty')) && (!search || c.title.toLowerCase().includes(search)));
            return reply(route, { success: true, data: signedIn ? data.map((c) => ({ ...c, viewer: { enrolled: c.slug === 'web-hacking' && state.enrolled, status: null, percent: 0, bookmarked: false } })) : data, pagination: page1(data.length) });
        }
        if (path === '/api/learning-paths/user/summary') {
            const progress = progressFor(state);
            const active = state.enrolled || state.ticked.length > 0;
            return reply(route, { success: true, data: { totals: { enrolled: active ? 1 : 0, inProgress: active ? 1 : 0, completed: 0, roadmapsCompleted: 0 }, continue: active ? [{ path: card(), progress, next: NEXT_RULES(new Set(state.ticked)) }] : [], recentlyCompleted: [] } });
        }
        if (path === '/api/learning-paths/user/progress') return reply(route, { success: true, data: [] });
        if (path === '/api/learning-paths/admin/list') {
            const mine = [{ ...card({ viewer: undefined }), status: state.pathStatus, createdBy: { id: 'u-ada', username: 'ada' }, updatedAt: state.updatedAt }, { ...CARDS[1], viewer: undefined, status: 'published', createdBy: { id: 'u-ada', username: 'ada' }, updatedAt: iso(-5) }];
            return reply(route, { success: true, data: mine, counts: { draft: state.pathStatus === 'draft' ? 1 : 0, in_review: 0, published: 1 + (state.pathStatus === 'published' ? 1 : 0), archived: 0 }, pagination: page1(mine.length, 20) });
        }
        if (/^\/api\/learning-paths\/admin\/[^/]+$/.test(path) && method === 'GET') return reply(route, { success: true, data: editorPath(state, role === 'moderator' ? testUser._id : undefined) });
        if (/^\/api\/learning-paths\/[^/]+$/.test(path) && method === 'PUT') {
            if (state.conflictOnSave) {
                state.conflictOnSave = false;
                state.updatedAt = '2026-11-05T10:00:00.000Z';
                return failure(route, 409, 'PATH_CONFLICT', 'Conflict', { meta: { updatedAt: state.updatedAt } });
            }
            state.updatedAt = new Date().toISOString();
            return reply(route, { success: true, data: { ...editorPath(state, role === 'moderator' ? testUser._id : undefined), ...(body as object) } });
        }
        const transition = /^\/api\/learning-paths\/[^/]+\/(submit|publish|unpublish|archive|restore)$/.exec(path);
        if (transition && method === 'POST') {
            state.pathStatus = ({ submit: 'in_review', publish: 'published', unpublish: 'draft', archive: 'archived', restore: 'draft' } as const)[transition[1] as 'submit'];
            return reply(route, { success: true, data: editorPath(state, role === 'moderator' ? testUser._id : undefined) });
        }
        const tick = /^\/api\/learning-paths\/[^/]+\/modules\/([^/]+)\/(complete|uncomplete)$/.exec(path);
        if (tick && method === 'POST') {
            const id = decodeURIComponent(tick[1]);
            if (!MODULES.some((m) => m.id === id)) return failure(route, 404, 'MODULE_NOT_FOUND', 'No such step');
            if (tick[2] === 'complete' && !state.ticked.includes(id)) state.ticked.push(id);
            if (tick[2] === 'uncomplete') state.ticked = state.ticked.filter((t) => t !== id);
            state.enrolled = true;
            const progress = progressFor(state);
            return reply(route, { success: true, data: { ...progress, changed: true, completedNow: progress.status === 'completed' && tick[2] === 'complete', rewards: { pointsAwarded: tick[2] === 'complete' ? 5 : 0, badges: [] }, next: NEXT_RULES(new Set(state.ticked)) } });
        }
        if (/\/enroll$/.test(path) && method === 'POST') { state.enrolled = true; return reply(route, { success: true, data: progressFor(state) }); }
        if (/^\/api\/learning-paths\/[^/]+\/certificate$/.test(path)) return reply(route, { success: true, data: { certificateId: 'CH-DEMO-2026', recipient: { username: testUser.username }, path: { title: 'Web application hacking', slug: 'web-hacking', kind: 'roadmap' }, completedAt: iso(0), selfPaced: true } });
        if (/^\/api\/learning-paths\/[^/]+$/.test(path) && method === 'GET') {
            const slug = decodeURIComponent(path.split('/').pop() ?? '');
            if (slug === 'web-hacking') return reply(route, { success: true, data: detailFor(state, signedIn, canEdit) });
            if (slug === 'linux-basics') return reply(route, { success: true, data: { ...detailFor(state, signedIn), ...PATH_CARDS[0], id: 'p-linux', slug, modules: MODULES.slice(0, 3), stages: [{ title: '', moduleIds: ['n-http', 'n-burp', 'n-xss'] }], viewer: signedIn ? { enrolled: false, bookmarked: false, progress: null, next: MODULES[0], certificateId: null, canEdit: false } : null } });
            return failure(route, 404, 'PATH_NOT_FOUND', 'Not found');
        }
        if (/^\/api\/certificates\//.test(path)) {
            const id = decodeURIComponent(path.split('/').pop() ?? '');
            if (id.toLowerCase() !== 'ch-demo-2026') return failure(route, 404, 'CERTIFICATE_NOT_FOUND', 'Not found');
            return reply(route, { success: true, data: { valid: true, certificateId: 'CH-DEMO-2026', recipient: { username: 'testuser' }, path: { title: 'Web application hacking', slug: 'web-hacking', kind: 'roadmap' }, completedAt: iso(-1), selfPaced: true } });
        }
        if (path.startsWith('/api/bookmarks')) { state.bookmarked = method === 'POST'; return reply(route, { success: true }); }

        // ---- resources
        if (path === '/api/resources/facets') return reply(route, { success: true, data: { total: 3, topics: [{ value: 'web-security', count: 2 }, { value: 'blue-team', count: 1 }], types: [{ value: 'article', count: 1 }, { value: 'course', count: 1 }, { value: 'book', count: 1 }], difficulties: [{ value: 'beginner', count: 1 }, { value: 'intermediate', count: 1 }, { value: 'advanced', count: 1 }], free: { free: 2, paid: 1 } } });
        if (path === '/api/resources/check-url') {
            const target = q.get('url') ?? '';
            const dup = target.includes('owasp.org');
            return reply(route, { success: true, data: { valid: true, reason: null, normalized: target, domain: new URL(target).hostname, blocked: false, duplicate: dup ? { status: 'approved', slug: 'owasp-top-10', title: 'OWASP Top 10' } : null } });
        }
        if (path === '/api/resources/review') {
            const queue = q.get('queue') ?? 'pending';
            const rows = state.queue.filter((r) => (queue === 'pending' ? r.status === 'pending' : queue === 'reported' ? !!r.openReports : queue === 'broken' ? r.linkStatus === 'broken' : queue === 'rejected' ? r.status === 'rejected' : true)).map((r) => ({
                ...RESOURCES[0], id: r.slug, slug: r.slug, title: r.title, url: r.url, domain: new URL(r.url).hostname, status: r.status, approvedAt: null, linkStatus: r.linkStatus ?? 'unknown', openReports: r.openReports ?? 0,
                submittedBy: { username: 'sam', avatar: null, id: 'u-sam' }, submitterRecord: { approved: 3, rejected: 1, pending: 1 }, sameDomainCount: 2, description: 'A short summary written by the person who shared it, for moderators to check against the page.',
            }));
            return reply(route, { success: true, data: rows, counts: { pending: state.queue.filter((r) => r.status === 'pending').length, broken: 1 }, pagination: page1(rows.length, 20) });
        }
        const moderate = /^\/api\/resources\/([^/]+)\/(approve|reject)$/.exec(path);
        if (moderate && method === 'PATCH') {
            const row = state.queue.find((r) => r.slug === moderate[1]);
            if (row) row.status = moderate[2] === 'approve' ? 'approved' : 'rejected';
            return reply(route, { success: true, data: {} });
        }
        if (path === '/api/resources/my') return reply(route, { success: true, data: [{ ...RESOURCES[0], slug: 'my-pending', title: 'My pending guide', status: 'pending', approvedAt: null }, { ...RESOURCES[1], slug: 'my-rejected', title: 'My rejected link', status: 'rejected', rejectionCode: 'duplicate', rejectionReason: 'Already covered by the Web Security Academy.', approvedAt: null }], counts: { pending: 1, approved: 0, rejected: 1 }, pagination: page1(2) });
        if (path === '/api/resources/reading') return reply(route, { success: true, data: [], pagination: page1(0) });
        if (path === '/api/resources' && method === 'GET') {
            const search = (q.get('q') ?? '').toLowerCase();
            const data = RESOURCES.filter((r) => (!q.get('type') || r.type === q.get('type')) && (!q.get('topic') || r.topic === q.get('topic')) && (!q.get('difficulty') || r.difficulty === q.get('difficulty')) && (!search || r.title.toLowerCase().includes(search))).map((r) => ({ ...r, viewer: signedIn ? resourceViewer() : null }));
            return reply(route, { success: true, data, pagination: page1(data.length) });
        }
        if (path === '/api/resources' && method === 'POST') {
            return reply(route, { success: true, data: { ...RESOURCES[0], ...(body as object), id: 'new', slug: 'new-submission', status: 'pending', approvedAt: null } }, 201);
        }
        const vote = /^\/api\/resources\/([^/]+)\/vote$/.exec(path);
        if (vote && method === 'POST') {
            const value = (body as { value: number }).value;
            return reply(route, { success: true, data: { userVote: value, upvotes: 24 + (value === 1 ? 1 : 0), downvotes: 1, score: 23 + (value === 1 ? 1 : 0) } });
        }
        if (/^\/api\/resources\/[^/]+\/report$/.test(path) && method === 'POST') return reply(route, { success: true, data: { reported: true } });
        if (/^\/api\/resources\/[^/]+$/.test(path) && method === 'GET') {
            const slug = decodeURIComponent(path.split('/').pop() ?? '');
            const found = RESOURCES.find((r) => r.slug === slug);
            if (!found) return failure(route, 404, 'RESOURCE_NOT_FOUND', 'Not found');
            return reply(route, { success: true, data: { ...found, viewer: signedIn ? resourceViewer({ canModerate: canEdit }) : null, usedIn: slug === 'owasp-top-10' ? [{ id: 'p-web', slug: 'web-hacking', title: 'Web application hacking', kind: 'roadmap' }] : [] } });
        }
        return reply(route, { success: true, data: [] });
    });
    return state;
}
