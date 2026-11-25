import type { Page, Route } from '@playwright/test';

/**
 * An in-memory stand-in for the code review API, so the e2e specs run without a backend. Reads
 * answer from `state`; writes change it and are pushed to `calls` for assertions. The grading
 * follows the contract rules (10 points a finding, 3 off a false mark, 70% for a wrong type, a pass
 * at 70%, 25% off for every earlier graded attempt up to 75%, hints cost points, the solution unlocks
 * after the first graded attempt, more false marks than findings forfeit the points, at most
 * findings + 2 marks over 40% of the lines, and the findings are only explained after a pass, after
 * the solution was opened, or for staff) so the screens are exercised, not the mock. The answer key lives in the mock only, never in a member response.
 */

export interface Role { id: string; role: 'user' | 'moderator' | 'admin' | 'owner' | null }
export const MEMBER: Role = { id: 'user-1', role: 'user' };
export const MODERATOR: Role = { id: 'staff-1', role: 'moderator' };
export const ADMIN: Role = { id: 'admin-1', role: 'admin' };
export const VISITOR: Role = { id: '', role: null };

interface FindingRec {
    lineStart: number; lineEnd: number; title: string; vulnerabilityType: string; severity: 'low' | 'medium' | 'high' | 'critical';
    cwe: string | null; owasp: string | null; explanation: string;
}
export interface SnippetRec {
    _id: string; slug: string; title: string; description: string; language: string; category: string; difficulty: 'easy' | 'medium' | 'hard';
    points: number; tags: string[]; vulnerableCode: string; findings: FindingRec[]; hints: { id: string; order: number; text: string; cost: number }[];
    explanation: string; fixedCode: string; isPublished: boolean; solveCount: number; createdAt: string; updatedAt: string;
}
interface ProgressRec {
    attempts: { id: string; score: number; maxScore: number; percent: number; passed: boolean; matched: number; false: number; marks: unknown[]; at: string }[];
    bestPercent: number; bestScore: number; maxScore: number; passed: boolean; pointsEarned: number; hintsUnlocked: number[]; solutionViewed: boolean; forfeited: boolean;
}

const RANK = { easy: 1, medium: 2, hard: 3 } as const;
const BASE_POINTS = { easy: 25, medium: 50, hard: 100 } as const;

export const LOGIN = 'sql-injection-login';
export const XSS = 'reflected-xss-search';
export const DRAFT = 'unfinished-draft';
export const NO_FINDINGS = 'no-findings-yet';

export const LOGIN_CODE = [
    'def login(username, password):',
    '    conn = sqlite3.connect("users.db")',
    '    cursor = conn.cursor()',
    '    query = "SELECT * FROM users WHERE name = \'" + username + "\'"',
    '    cursor.execute(query)',
    '    row = cursor.fetchone()',
    '    return row is not None and check_hash(row, password)',
].join('\n');

export const XSS_CODE = [
    'app.get("/search", (req, res) => {',
    '  const q = req.query.q;',
    '  res.send("<h1>Results for " + q + "</h1><img src=x onerror=\\"track()\\">");',
    '});',
].join('\n');

const make = (n: number, over: Partial<SnippetRec> & { slug: string; title: string }): SnippetRec => ({
    _id: String(n).padStart(24, 'b'), description: `${over.title}: find the vulnerable lines.`, language: 'python', category: 'injection', difficulty: 'easy', points: 0,
    tags: ['practice'], vulnerableCode: LOGIN_CODE, findings: [], hints: [], explanation: '', fixedCode: '', isPublished: true, solveCount: 2,
    createdAt: new Date(Date.UTC(2026, 0, 30 - n)).toISOString(), updatedAt: new Date(Date.UTC(2026, 1, 1)).toISOString(), ...over,
});

export interface MockState {
    snippets: SnippetRec[];
    progress: Record<string, ProgressRec>;
    /** The list answers this many cards per page, to exercise "load more" */
    pageCap: number;
    /** `METHOD path-suffix` to an error answered once */
    failOnce: Record<string, { status: number; code?: string; message?: string; details?: { field?: string; message: string }[]; meta?: Record<string, unknown> }>;
    /** A path suffix of a GET that fails every time with 503 (to show an error state) */
    failGet: string[];
    calls: { method: string; path: string; query?: string; body?: Record<string, unknown> }[];
}

export function freshState(over: Partial<MockState> = {}): MockState {
    return {
        snippets: [
            make(1, {
                slug: LOGIN, title: 'Login check', difficulty: 'easy', category: 'injection', tags: ['sqli', 'python'],
                description: 'This function checks a login against a small database. Review it and mark the lines that are vulnerable.',
                findings: [
                    { lineStart: 4, lineEnd: 5, title: 'SQL injection', vulnerabilityType: 'sqli', severity: 'critical', cwe: 'CWE-89', owasp: 'A03:2021 - Injection', explanation: 'The name is **concatenated** into the query, so a quote changes its meaning. Use a bound parameter.' },
                    { lineStart: 7, lineEnd: 7, title: 'Timing difference', vulnerabilityType: 'auth', severity: 'low', cwe: null, owasp: null, explanation: 'The password is only checked when a row exists, so the time reveals whether the user exists.' },
                ],
                hints: [{ id: 'hint-login-1', order: 1, text: 'Look at how the **query** is built.', cost: 3 }, { id: 'hint-login-2', order: 2, text: 'What happens when the name contains a quote?', cost: 5 }],
                explanation: 'Two issues: the query is built by concatenation, and the response time leaks which users exist.', fixedCode: 'cursor.execute("SELECT * FROM users WHERE name = ?", (username,))',
            }),
            make(2, {
                slug: XSS, title: 'Search results page', language: 'javascript', category: 'web', difficulty: 'medium', tags: ['xss', 'node'], vulnerableCode: XSS_CODE,
                findings: [{ lineStart: 3, lineEnd: 3, title: 'Reflected XSS', vulnerabilityType: 'xss', severity: 'high', cwe: 'CWE-79', owasp: 'A03:2021 - Injection', explanation: 'The query is written into the page without escaping.' }],
                hints: [{ id: 'hint-xss-1', order: 1, text: 'Where does `q` end up?', cost: 0 }],
            }),
            make(3, { slug: 'hardcoded-secret', title: 'Config loader', category: 'crypto', difficulty: 'easy', language: 'go', findings: [{ lineStart: 2, lineEnd: 2, title: 'Hard-coded key', vulnerabilityType: 'auth', severity: 'high', cwe: 'CWE-798', owasp: null, explanation: 'The key is in the source.' }] }),
            make(4, { slug: 'path-join', title: 'File download', category: 'server-side', difficulty: 'hard', language: 'java', findings: [{ lineStart: 1, lineEnd: 2, title: 'Path traversal', vulnerabilityType: 'traversal', severity: 'high', cwe: 'CWE-22', owasp: null, explanation: 'The name is joined to the base path.' }] }),
            make(5, { slug: DRAFT, title: 'Unfinished draft', isPublished: false, findings: [{ lineStart: 1, lineEnd: 1, title: 'x', vulnerabilityType: 'other', severity: 'low', cwe: null, owasp: null, explanation: 'Just a draft finding.' }] }),
            make(6, { slug: NO_FINDINGS, title: 'No findings yet', isPublished: false, findings: [] }),
        ],
        progress: {},
        pageCap: 100,
        failOnce: {},
        failGet: [],
        calls: [],
        ...over,
    };
}

/** A member who has already tried a snippet once */
export function tried(over: Partial<ProgressRec> = {}): ProgressRec {
    return { attempts: [{ id: 'a0', score: 7, maxScore: 20, percent: 35, passed: false, matched: 1, false: 1, marks: [{ lineStart: 4, lineEnd: 4 }], at: new Date(Date.now() - 3600_000).toISOString() }], bestPercent: 35, bestScore: 7, maxScore: 20, passed: false, pointsEarned: 0, hintsUnlocked: [], solutionViewed: false, forfeited: false, ...over };
}

const cors = (route: Route) => ({
    'access-control-allow-origin': route.request().headers()['origin'] || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
});
const send = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers: { ...cors(route), ...headers }, body: JSON.stringify(body) });
const fail = (route: Route, status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    send(route, status, { success: false, error: { code, message, ...extra } }, headers);

export async function mockCodeReviewApi(page: Page, who: Role, state: MockState = freshState()): Promise<MockState> {
    const staff = who.role === 'admin' || who.role === 'owner' || who.role === 'moderator';
    const writer = who.role === 'admin' || who.role === 'owner';
    if (who.role) await page.addInitScript(() => window.localStorage.setItem('token', 'e2e-token'));

    const baseOf = (s: SnippetRec) => (s.points > 0 ? s.points : BASE_POINTS[s.difficulty]);
    const costOf = (s: SnippetRec, p?: ProgressRec) => (p?.hintsUnlocked ?? []).reduce((sum, o) => sum + (s.hints.find((h) => h.order === o)?.cost ?? 0), 0);
    const floorOf = (s: SnippetRec) => Math.max(1, Math.round(baseOf(s) * 0.1));
    const decayOf = (p?: ProgressRec) => Math.min(75, (p?.attempts.length ?? 0) * 25) / 100;
    /** What a perfect pass would pay now: nothing for staff, after a pass, after the solution was opened, or after a probe */
    const available = (s: SnippetRec, p?: ProgressRec) => (staff || p?.passed || p?.solutionViewed || p?.forfeited ? 0 : Math.max(floorOf(s), Math.round(baseOf(s) * (1 - decayOf(p))) - costOf(s, p)));
    const status = (p?: ProgressRec) => (!p ? 'not-started' : p.passed ? 'passed' : 'in-progress');
    const todayCount = (p?: ProgressRec) => p?.attempts.length ?? 0;

    const progressOf = (s: SnippetRec) => {
        const p = state.progress[s.slug];
        return { status: status(p), attempts: p?.attempts.length ?? 0, bestScore: p?.bestScore ?? 0, maxScore: p?.maxScore ?? 0, bestPercent: p?.bestPercent ?? 0, passed: p?.passed ?? false, pointsEarned: p?.pointsEarned ?? 0 };
    };
    const card = (s: SnippetRec) => {
        const view: Record<string, unknown> = {
            _id: s._id, slug: s.slug, title: s.title, summary: s.description.slice(0, 120), language: s.language, category: s.category, difficulty: s.difficulty,
            difficultyRank: RANK[s.difficulty], points: baseOf(s), tags: s.tags, findingCount: s.findings.length, hintCount: s.hints.length,
            lineCount: s.vulnerableCode.split('\n').length, solveCount: s.solveCount, createdAt: s.createdAt,
        };
        if (who.role) view.progress = progressOf(s);
        return view;
    };
    const viewerOf = (s: SnippetRec) => {
        const p = state.progress[s.slug];
        return {
            ...progressOf(s), passedAt: p?.passed ? p.attempts.at(-1)?.at ?? null : null, hintsUnlocked: p?.hintsUnlocked ?? [], hintCost: costOf(s, p),
            pointsAvailable: available(s, p), solutionUnlocked: staff || (p?.attempts.length ?? 0) > 0, solutionViewed: p?.solutionViewed ?? false,
            pointsForfeited: !staff && !!(p?.solutionViewed || p?.forfeited),
            attemptsToday: todayCount(p), attemptsLeftToday: Math.max(0, 30 - todayCount(p)),
        };
    };
    const detail = (s: SnippetRec) => {
        const p = state.progress[s.slug];
        return {
            ...card(s), description: s.description, vulnerableCode: s.vulnerableCode, updatedAt: s.updatedAt,
            hints: s.hints.map((h) => {
                const open = !!p?.hintsUnlocked.includes(h.order);
                return { id: h.id, order: h.order, cost: h.cost, unlocked: open, ...((open || staff) && { text: h.text }) };
            }),
            viewer: who.role ? viewerOf(s) : null,
        };
    };
    const manageCard = (s: SnippetRec) => ({ ...card(s), isPublished: s.isPublished, attemptCount: Object.values(state.progress).length, updatedAt: s.updatedAt });
    const adminView = (s: SnippetRec) => ({
        ...manageCard(s), description: s.description, vulnerableCode: s.vulnerableCode, effectivePoints: baseOf(s), findings: s.findings.map((f) => ({ ...f, exploit: null, fix: null })),
        hints: s.hints, explanation: s.explanation, fixedCode: s.fixedCode, exploitedCode: '', fixedExploitedCode: '', exploitExample: null,
    });
    const paged = (items: unknown[], pageNo: number, limit: number) => {
        const start = (pageNo - 1) * limit;
        const slice = items.slice(start, start + limit);
        return { success: true, count: slice.length, data: slice, pagination: { page: pageNo, limit, total: items.length, pages: Math.max(1, Math.ceil(items.length / limit)), hasMore: start + slice.length < items.length } };
    };
    const find = (slug: string) => state.snippets.find((s) => s.slug === slug || s._id === slug);
    const visible = (s: SnippetRec | undefined) => (s && (s.isPublished || staff) ? s : undefined);
    const overlaps = (a: { lineStart: number; lineEnd: number }, b: { lineStart: number; lineEnd: number }) => a.lineStart <= b.lineEnd && b.lineStart <= a.lineEnd;

    await page.route('**/api/**', async (route) => {
        const req = route.request();
        const method = req.method();
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(route) });
        const url = new URL(req.url());
        const path = url.pathname;
        const q = url.searchParams;
        let body: Record<string, unknown> = {};
        try { body = req.postDataJSON() ?? {}; } catch { body = {}; }

        if (path === '/api/auth/me') {
            return who.role
                ? send(route, 200, { success: true, data: { id: who.id, _id: who.id, name: 'Test User', username: 'testuser', email: 'test@example.com', role: who.role, isVerified: true, provider: 'local' } })
                : fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
        }
        if (!path.startsWith('/api/code-review')) {
            if (path === '/api/notifications/unread-count') return send(route, 200, { success: true, data: { count: 0, byType: {} } });
            return send(route, 200, { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 1, hasMore: false } });
        }

        const sub = path.replace(/^\/api\/code-review/, '') || '/';
        state.calls.push({ method, path: sub, ...(q.toString() ? { query: q.toString() } : {}), ...(method === 'GET' ? {} : { body }) });

        const once = Object.entries(state.failOnce).find(([k]) => k.split(' ')[0] === method && sub.endsWith(k.split(' ')[1]));
        if (once) {
            delete state.failOnce[once[0]];
            const f = once[1];
            return fail(route, f.status, f.code ?? 'INTERNAL_ERROR', f.message ?? 'Something failed', { ...(f.details ? { details: f.details } : {}), ...(f.meta ? { meta: f.meta } : {}) },
                f.status === 429 && f.meta?.retryAfter ? { 'Retry-After': String(f.meta.retryAfter) } : {});
        }
        if (method === 'GET' && state.failGet.some((suffix) => sub === suffix || sub.endsWith(suffix))) return fail(route, 503, 'SERVICE_UNAVAILABLE', 'The service is not available');

        // ---- fixed paths ----
        if (method === 'GET' && (sub === '/' || sub === '')) {
            let items = state.snippets.filter((s) => s.isPublished);
            const category = q.get('category'); const difficulty = q.get('difficulty'); const language = q.get('language');
            const text = (q.get('search') ?? '').toLowerCase(); const st = q.get('status');
            if (category) items = items.filter((s) => s.category === category);
            if (difficulty) items = items.filter((s) => s.difficulty === difficulty);
            if (language) items = items.filter((s) => s.language === language);
            if (text) items = items.filter((s) => `${s.title} ${s.tags.join(' ')} ${s.description}`.toLowerCase().includes(text));
            if (st && who.role) items = items.filter((s) => status(state.progress[s.slug]) === st);
            const sortBy = q.get('sortBy') ?? 'createdAt';
            const dir = q.get('sortOrder') === 'asc' ? 1 : -1;
            items = [...items].sort((a, b) => dir * (sortBy === 'title' ? a.title.localeCompare(b.title) : sortBy === 'difficulty' ? RANK[a.difficulty] - RANK[b.difficulty] : a.createdAt.localeCompare(b.createdAt)));
            return send(route, 200, paged(items.map(card), Number(q.get('page') ?? 1), Math.min(Number(q.get('limit') ?? 20), state.pageCap)));
        }
        if (method === 'GET' && sub === '/stats') {
            const pub = state.snippets.filter((s) => s.isPublished);
            const count = (key: 'category' | 'difficulty' | 'language') => Object.entries(pub.reduce<Record<string, number>>((m, s) => ({ ...m, [s[key]]: (m[s[key]] ?? 0) + 1 }), {}));
            const rows = Object.entries(state.progress);
            return send(route, 200, { success: true, data: {
                total: pub.length,
                facets: {
                    categories: count('category').map(([category, n]) => ({ category, count: n })),
                    difficulties: count('difficulty').map(([difficulty, n]) => ({ difficulty, count: n })),
                    languages: count('language').map(([language, n]) => ({ language, count: n })),
                },
                viewer: who.role ? { attempted: rows.length, passed: rows.filter(([, p]) => p.passed).length, points: rows.reduce((sum, [, p]) => sum + p.pointsEarned, 0) } : null,
            } });
        }
        if (method === 'GET' && sub === '/manage') {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            let items = [...state.snippets];
            const published = q.get('isPublished');
            if (published) items = items.filter((s) => String(s.isPublished) === published);
            const text = (q.get('search') ?? '').toLowerCase();
            if (text) items = items.filter((s) => `${s.title} ${s.tags.join(' ')}`.toLowerCase().includes(text));
            return send(route, 200, paged(items.map(manageCard), Number(q.get('page') ?? 1), Math.min(Number(q.get('limit') ?? 20), state.pageCap)));
        }
        if (method === 'GET' && sub === '/progress/me') {
            if (!who.role) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
            return send(route, 200, { success: true, summary: { attempted: 0, passed: 0, points: 0 }, data: [] });
        }

        if (method === 'POST' && (sub === '/' || sub === '')) {
            if (!writer) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const details: { field?: string; message: string }[] = [];
            const title = String(body.title ?? '');
            if (title.trim().length < 3) details.push({ field: 'title', message: 'Title must be at least 3 characters' });
            if (!body.description) details.push({ field: 'description', message: 'Description is required' });
            const code = String(body.vulnerableCode ?? '');
            const lineCount = code.split('\n').length;
            (body.findings as FindingRec[] | undefined)?.forEach((f, i) => { if (f.lineEnd > lineCount) details.push({ field: `findings.${i}.lineEnd`, message: `lineEnd must not be past the last line (${lineCount})` }); });
            if (details.length) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details });
            const slug = String(body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
            if (find(slug)) return fail(route, 409, 'CR_SLUG_TAKEN', 'This slug is taken');
            const findings = ((body.findings as FindingRec[] | undefined) ?? []).map((f) => ({ ...f, title: f.title ?? '', cwe: f.cwe ?? null, owasp: f.owasp ?? null }));
            if (body.isPublished && findings.length === 0) return fail(route, 409, 'CR_NOT_READY', 'An exercise needs at least one finding before it is published');
            const snippet = make(state.snippets.length + 1, {
                slug, title, description: String(body.description), language: String(body.language ?? 'other'), category: String(body.category ?? 'other'), difficulty: (body.difficulty as SnippetRec['difficulty']) ?? 'easy',
                points: Number(body.points ?? 0), tags: (body.tags as string[]) ?? [], vulnerableCode: code, findings, hints: ((body.hints as { id?: string; text: string; cost: number }[]) ?? []).map((h, i) => ({ order: i + 1, ...h, id: h.id ?? `hint-new-${i + 1}` })),
                explanation: String(body.explanation ?? ''), fixedCode: String(body.fixedCode ?? ''), isPublished: !!body.isPublished, solveCount: 0,
            });
            state.snippets.push(snippet);
            return send(route, 201, { success: true, data: adminView(snippet) });
        }

        // ---- one snippet ----
        const m = sub.match(/^\/([a-z0-9-]+)(?:\/(attempts|solution|publish|unpublish|hints\/\d+))?$/);
        if (!m) return fail(route, 404, 'CR_NOT_FOUND', 'Not found');
        const [, ref, action] = m;
        const snippet = visible(find(ref));

        if (method === 'GET' && !action) {
            if (!snippet) return fail(route, 404, 'CR_NOT_FOUND', 'Exercise not found');
            return send(route, 200, { success: true, data: staff ? { ...detail(snippet), ...adminView(snippet), hints: detail(snippet).hints } : detail(snippet) });
        }
        if (method === 'PUT' && !action) {
            if (!writer) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const s = find(ref);
            if (!s) return fail(route, 404, 'CR_NOT_FOUND', 'Exercise not found');
            const details: { field?: string; message: string }[] = [];
            const code = String(body.vulnerableCode ?? s.vulnerableCode);
            const lineCount = code.split('\n').length;
            (body.findings as FindingRec[] | undefined)?.forEach((f, i) => { if (f.lineEnd > lineCount) details.push({ field: `findings.${i}.lineEnd`, message: `lineEnd must not be past the last line (${lineCount})` }); });
            if (details.length) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details });
            const { findings, hints, confirmKeyChange, ...rest } = body as Record<string, unknown>;
            const nextFindings = findings ? (findings as FindingRec[]).map((f) => ({ ...f, title: f.title ?? '', cwe: f.cwe ?? null, owasp: f.owasp ?? null })) : s.findings;
            const nextHints = hints ? (hints as { id?: string; text: string; cost: number }[]).map((h, i) => ({ ...h, order: i + 1, id: h.id ?? `hint-new-${i + 1}` })) : s.hints;
            // Only what grades or explains counts as the key, compared like the server does: by value, not by the shape of the body
            const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
            const keyOf = (f: FindingRec) => [f.lineStart, f.lineEnd, f.vulnerabilityType, f.severity, f.title, f.cwe, f.owasp, f.explanation];
            const keyChanged = !same(nextFindings.map(keyOf), s.findings.map(keyOf)) || !same(code, s.vulnerableCode) || !same(nextHints.map((h) => [h.id, h.text, h.cost]), s.hints.map((h) => [h.id, h.text, h.cost]));
            if (s.solveCount > 0 && keyChanged && confirmKeyChange !== true) {
                return fail(route, 409, 'CR_KEY_CHANGE_UNCONFIRMED', 'Members solved this exercise', { meta: { solveCount: s.solveCount, oldFindingCount: s.findings.length, newFindingCount: nextFindings.length, oldHintCount: s.hints.length, newHintCount: nextHints.length } });
            }
            Object.assign(s, rest, { updatedAt: new Date().toISOString() });
            s.findings = nextFindings;
            s.hints = nextHints;
            if (s.isPublished && s.findings.length === 0) return fail(route, 409, 'CR_NOT_READY', 'An exercise needs at least one finding before it is published');
            return send(route, 200, { success: true, data: adminView(s) });
        }
        if (method === 'DELETE' && !action) {
            if (!writer) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const s = find(ref);
            if (!s) return fail(route, 404, 'CR_NOT_FOUND', 'Exercise not found');
            if (s.solveCount > 0 && s.isPublished) return fail(route, 409, 'CR_HAS_PROGRESS', 'Members have passed this exercise. Unpublish it instead of deleting it.');
            state.snippets = state.snippets.filter((x) => x !== s);
            return send(route, 200, { success: true, data: { _id: s._id, slug: s.slug } });
        }
        if (method === 'POST' && (action === 'publish' || action === 'unpublish')) {
            if (!writer) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const s = find(ref);
            if (!s) return fail(route, 404, 'CR_NOT_FOUND', 'Exercise not found');
            if (action === 'publish' && s.findings.length === 0) return fail(route, 409, 'CR_NOT_READY', 'An exercise needs at least one finding before it is published');
            s.isPublished = action === 'publish';
            return send(route, 200, { success: true, data: manageCard(s) });
        }

        // ---- member actions ----
        if (!who.role) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
        if (!snippet) return fail(route, 404, 'CR_NOT_FOUND', 'Exercise not found');
        const p = state.progress[snippet.slug];

        if (method === 'GET' && action === 'attempts') {
            return send(route, 200, { success: true, data: (p?.attempts ?? []).slice().reverse().map((a) => ({
                attemptId: a.id, score: a.score, maxScore: a.maxScore, percent: a.percent, passed: a.passed, matchedCount: a.matched, falsePositives: a.false, hintsUsed: p?.hintsUnlocked.length ?? 0, marks: a.marks, createdAt: a.at,
            })) });
        }
        if (method === 'POST' && action === 'attempts') {
            if (snippet.findings.length === 0) return fail(route, 409, 'CR_NOT_GRADABLE', 'This exercise has no findings yet');
            const marks = (body.marks as { lineStart: number; lineEnd: number; vulnerabilityType?: string }[] | undefined) ?? [];
            if (marks.length < 1 || marks.length > 50) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ field: 'marks', message: 'Send between 1 and 50 marks' }] });
            if (todayCount(p) >= 30) return fail(route, 429, 'CR_ATTEMPT_LIMIT', 'Daily limit reached', { meta: { retryAfter: 7200, limit: 30 } }, { 'Retry-After': '7200' });
            // At most findings + 2 marks, over at most 40% of the lines (never fewer than 6, never fewer than the findings need)
            const lineCount = snippet.vulnerableCode.split('\n').length;
            const covered = new Set<number>();
            marks.forEach((mk) => { for (let n = mk.lineStart; n <= mk.lineEnd; n += 1) covered.add(n); });
            const findingLines = snippet.findings.reduce((sum, f) => sum + (f.lineEnd - f.lineStart + 1), 0);
            const maxMarks = snippet.findings.length + 2;
            const maxLines = Math.max(6, Math.floor((lineCount * 40) / 100), findingLines);
            if (marks.length > maxMarks || covered.size > maxLines) return fail(route, 400, 'CR_TOO_BROAD', 'That answer is too broad', { meta: { maxMarks, maxLines } });
            const used = new Set<number>();
            const matched: Record<string, unknown>[] = [];
            const verdicts: { index: number; result: 'matched' | 'duplicate' | 'unmatched' }[] = [];
            let falseMarks = 0;
            let duplicates = 0;
            let score = 0;
            marks.forEach((mk, index) => {
                const at = snippet.findings.findIndex((f, i) => overlaps(f, mk) && !used.has(i));
                const dup = at < 0 && snippet.findings.some((f) => overlaps(f, mk));
                if (at < 0) { verdicts.push({ index, result: dup ? 'duplicate' : 'unmatched' }); if (dup) duplicates += 1; else falseMarks += 1; return; }
                used.add(at);
                const f = snippet.findings[at];
                const typeCorrect = mk.vulnerabilityType ? mk.vulnerabilityType === f.vulnerabilityType : null;
                const points = typeCorrect === false ? 7 : 10;
                score += points;
                verdicts.push({ index, result: 'matched' });
                matched.push({ markIndex: index, findingIndex: at, lineStart: f.lineStart, lineEnd: f.lineEnd, title: f.title, vulnerabilityType: f.vulnerabilityType, severity: f.severity, cwe: f.cwe, owasp: f.owasp, explanation: f.explanation, typeCorrect, points });
            });
            score = Math.max(0, score - 3 * falseMarks);
            const maxScore = snippet.findings.length * 10;
            const percent = Math.min(100, Math.round((score / maxScore) * 100));
            const passed = percent >= 70;
            const rec: ProgressRec = p ?? { attempts: [], bestPercent: 0, bestScore: 0, maxScore, passed: false, pointsEarned: 0, hintsUnlocked: [], solutionViewed: false, forfeited: false };
            const firstPass = passed && !rec.passed;
            // More false marks than findings is a probe: the points of the exercise are gone
            const probed = falseMarks > snippet.findings.length;
            if (probed && !staff) rec.forfeited = true;
            // What a perfect pass would have paid before this attempt, with the decay of the attempts before it
            const pointsBefore = available(snippet, p);
            const pointsAwarded = firstPass && who.role === 'user' && !rec.forfeited && !rec.solutionViewed ? Math.max(floorOf(snippet), pointsBefore) : 0;
            // The explanations are shown after a pass, after a pass before, after the solution, and to staff
            const revealed = passed || rec.passed || rec.solutionViewed || staff;
            const id = `a${rec.attempts.length + 1}`;
            rec.attempts.push({ id, score, maxScore, percent, passed, matched: matched.length, false: falseMarks, marks, at: new Date().toISOString() });
            if (percent >= rec.bestPercent) { rec.bestPercent = percent; rec.bestScore = score; }
            rec.maxScore = maxScore;
            if (firstPass) { rec.passed = true; rec.pointsEarned = pointsAwarded; snippet.solveCount += 1; }
            state.progress[snippet.slug] = rec;
            return send(route, 201, { success: true, data: {
                attemptId: id, score, maxScore, percent, passPercent: 70, passed, detailsRevealed: revealed, matchedCount: matched.length, ...(revealed ? { matched } : {}),
                // Before the details are revealed a repeat is told as unmatched (and counted in `duplicateCount`)
                marks: revealed ? verdicts : verdicts.map((v) => (v.result === 'duplicate' ? { ...v, result: 'unmatched' } : v)),
                missedCount: snippet.findings.length - matched.length, falsePositives: falseMarks, duplicateCount: duplicates, pointsForfeited: probed && !staff, firstPass,
                pointsAwarded, pointsAvailable: available(snippet, rec), hintsUsed: rec.hintsUnlocked.length, attempts: rec.attempts.length, attemptsLeftToday: Math.max(0, 30 - rec.attempts.length), bestPercent: rec.bestPercent,
                solutionUnlocked: true, newBadges: firstPass && who.role === 'user' ? [{ code: 'first-review', name: 'First Review', icon: 'shield', rarity: 'common' }] : [],
            } });
        }
        if (method === 'POST' && action?.startsWith('hints/')) {
            const order = Number(action.split('/')[1]);
            const hint = snippet.hints.find((h) => h.order === order);
            if (!hint) return fail(route, 404, 'CR_HINT_NOT_FOUND', 'Hint not found');
            const rec = p ?? { attempts: [], bestPercent: 0, bestScore: 0, maxScore: 0, passed: false, pointsEarned: 0, hintsUnlocked: [], solutionViewed: false, forfeited: false };
            const next = snippet.hints.find((h) => !rec.hintsUnlocked.includes(h.order));
            const already = rec.hintsUnlocked.includes(order);
            if (!already && next && next.order !== order) return fail(route, 409, 'CR_HINT_OUT_OF_ORDER', 'Open the hints in order', { meta: { next: next.order } });
            if (!already) rec.hintsUnlocked.push(order);
            state.progress[snippet.slug] = rec;
            return send(route, 200, { success: true, data: {
                hint: { id: hint.id, order, text: hint.text, cost: hint.cost }, alreadyUnlocked: already, recorded: true, hintsUsed: rec.hintsUnlocked.length, hintCost: costOf(snippet, rec), pointsAvailable: available(snippet, rec),
            } });
        }
        if (method === 'GET' && action === 'solution') {
            if (!staff && (p?.attempts.length ?? 0) === 0) return fail(route, 403, 'CR_SOLUTION_LOCKED', 'Submit an attempt first');
            if (p) p.solutionViewed = true;
            return send(route, 200, { success: true, data: {
                _id: snippet._id, slug: snippet.slug, title: snippet.title, findings: snippet.findings.map((f) => ({ ...f, exploit: null, fix: { description: 'Use a bound parameter.', code: 'cursor.execute(q, (name,))' } })),
                hints: snippet.hints, explanation: snippet.explanation, fixedCode: snippet.fixedCode, exploitedCode: '', fixedExploitedCode: '', exploitExample: null, viewer: viewerOf(snippet),
            } });
        }
        return fail(route, 404, 'CR_NOT_FOUND', 'Not found');
    });
    return state;
}
