import type { Page, Route } from '@playwright/test';

/**
 * An in-memory stand-in for the labs API, so the e2e specs run without a backend. Reads answer from
 * `state`; writes change it and are pushed to `calls` for assertions. The rules mirror the real
 * API (flags kept server side, hint penalties, the lockout, completions are final), so the screens
 * are exercised, not the mock. Flags live in the mock only, never in a response.
 */

export interface Role { id: string; role: 'user' | 'moderator' | 'admin' | 'owner' | null }
export const MEMBER: Role = { id: 'user-1', role: 'user' };
export const MODERATOR: Role = { id: 'staff-1', role: 'moderator' };
export const ADMIN: Role = { id: 'admin-1', role: 'admin' };
export const VISITOR: Role = { id: '', role: null };

interface HintRec { text: string; penalty: number }
export interface LabRec {
    _id: string; slug: string; title: string; description: string; category: string; difficulty: 'easy' | 'medium' | 'hard';
    points: number; tags: string[]; estimatedMinutes: number | null; instructions: string; hints: HintRec[];
    files: { name: string; url: string; sizeBytes: number | null; sha256: string | null }[]; labUrl: string | null;
    status: 'draft' | 'published' | 'archived'; flags: { value: string; caseSensitive: boolean }[]; startCount: number; completionCount: number;
    createdAt: string; updatedAt: string;
}
interface ProgressRec {
    status: 'started' | 'completed'; hintsUsed: number[]; attempts: number; wrong: number[]; pointsEarned: number;
    startedAt: string; completedAt: string | null; lockedUntil: number | null;
}

const BASE_POINTS = { easy: 50, medium: 100, hard: 200 } as const;
const RANK = { easy: 1, medium: 2, hard: 3 } as const;
const base = (n: number, over: Partial<LabRec> & { slug: string; title: string }): LabRec => ({
    _id: String(n).padStart(24, 'a'), description: `${over.title}: a guided exercise.`, category: 'web-security', difficulty: 'easy', points: 0,
    tags: ['practice'], estimatedMinutes: 30, instructions: '## Goal\n\nFind the flag.', hints: [], files: [], labUrl: 'https://target.example.org/app',
    status: 'published', flags: [{ value: `flag{${over.slug}}`, caseSensitive: false }], startCount: 3, completionCount: 1,
    createdAt: new Date(Date.UTC(2026, 0, 30 - n)).toISOString(), updatedAt: new Date(Date.UTC(2026, 1, 1)).toISOString(), ...over,
});

export const SQL = 'sql-injection-basics';
export const PAYLOAD = 'payload-lab';
export const DRAFT = 'secret-draft-lab';
export const NO_FLAG = 'no-flag-lab';

export interface MockState {
    labs: LabRec[];
    progress: Record<string, ProgressRec>;
    /** The list answers this many cards per page, to exercise "load more" */
    pageCap: number;
    /** How long a lock lasts, in seconds (the real API: 900) */
    lockSeconds: number;
    /** The API clock runs this far ahead of the browser (ms): every instant it sends is shifted, the waits in seconds are not */
    clockSkewMs: number;
    /** `METHOD path-suffix` to an error answered once */
    failOnce: Record<string, { status: number; code?: string; message?: string; details?: { field: string; message: string }[]; meta?: Record<string, unknown> }>;
    calls: { method: string; path: string; query?: string; body?: Record<string, unknown> }[];
}

export function freshState(over: Partial<MockState> = {}): MockState {
    return {
        labs: [
            base(1, {
                slug: SQL, title: 'SQL Injection Basics', difficulty: 'easy', tags: ['sqli', 'web'], estimatedMinutes: 45,
                flags: [{ value: 'flag{sql_basics}', caseSensitive: false }],
                hints: [{ text: 'Look at the **login** form.', penalty: 10 }, { text: 'Try a single quote.', penalty: 20 }],
                files: [{ name: 'app.zip', url: 'https://files.example.org/app.zip', sizeBytes: 2048, sha256: 'ab'.repeat(32) }],
            }),
            base(2, { slug: 'xss-playground', title: 'XSS Playground', difficulty: 'medium', hints: [{ text: 'Check the search box.', penalty: 30 }] }),
            base(3, { slug: 'pcap-forensics', title: 'Packet Capture Forensics', category: 'forensics', difficulty: 'medium', labUrl: null }),
            base(4, { slug: 'hash-cracking', title: 'Hash Cracking', category: 'cryptography', difficulty: 'hard', points: 250 }),
            base(5, { slug: 'osint-trail', title: 'OSINT Trail', category: 'osint', difficulty: 'easy' }),
            base(6, { slug: 'caesar-warmup', title: 'Caesar Warmup', category: 'cryptography', difficulty: 'easy' }),
            base(7, { slug: 'cloud-bucket', title: 'Open Cloud Bucket', category: 'cloud-security', difficulty: 'hard' }),
            base(8, {
                slug: PAYLOAD, title: 'Payload Lab', category: 'web-security', difficulty: 'medium',
                instructions: 'Try this: <script>window.__xss = 1</script>\n\n<img src=x onerror="window.__xss = 2">\n\n[click me](javascript:window.__xss=3)\n\n```html\n<script>alert(1)</script>\n```',
                hints: [{ text: '<img src=x onerror="window.__xss = 4"> use `<svg onload=alert(1)>`', penalty: 5 }],
            }),
            base(9, { slug: DRAFT, title: 'Secret Draft Lab', status: 'draft' }),
            base(10, { slug: NO_FLAG, title: 'No Flag Lab', flags: [] }),
        ],
        progress: {},
        pageCap: 100,
        lockSeconds: 900,
        clockSkewMs: 0,
        failOnce: {},
        calls: [],
        ...over,
    };
}

/** A member who already started a lab */
export function started(over: Partial<ProgressRec> = {}): ProgressRec {
    return { status: 'started', hintsUsed: [], attempts: 0, wrong: [], pointsEarned: 0, startedAt: new Date(Date.now() - 3600_000).toISOString(), completedAt: null, lockedUntil: null, ...over };
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

const isInternalHost = (hostname: string) => {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (host.includes(':') || /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(host)) return true;
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (/\.(local|internal|lan|home|corp|intranet|test|invalid|example)$/.test(host)) return true;
    if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
    return !host.includes('.');
};
// `.example.org` is fine: only the bare `.example` top-level name is internal
const isLink = (v: string) => {
    try {
        const u = new URL(v.trim());
        return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password && !!u.hostname && !isInternalHost(u.hostname);
    } catch { return false; }
};

const norm = (text: string, caseSensitive: boolean) => {
    const t = text.normalize('NFC').trim().replace(/\s+/g, ' ');
    return caseSensitive ? t : t.toLowerCase();
};

const LEADERS = [
    { rank: 1, user: { username: 'ada', name: 'Ada Lovelace', avatar: null }, totalPoints: 450, labsCompleted: 5 },
    { rank: 2, user: { username: 'linus', name: null, avatar: null }, totalPoints: 300, labsCompleted: 3 },
    { rank: 3, user: { username: 'grace', name: 'Grace Hopper', avatar: null }, totalPoints: 150, labsCompleted: 2 },
];

export async function mockLabsApi(page: Page, who: Role, state: MockState = freshState()): Promise<MockState> {
    const staff = who.role === 'admin' || who.role === 'owner';
    if (who.role) await page.addInitScript(() => window.localStorage.setItem('token', 'e2e-token'));

    const baseOf = (l: LabRec) => (l.points > 0 ? l.points : BASE_POINTS[l.difficulty]);
    const penaltyOf = (l: LabRec, used: number[]) => used.reduce((sum, i) => sum + (l.hints[i]?.penalty ?? 0), 0);
    const available = (l: LabRec, p?: ProgressRec) => (p?.status === 'completed' ? p.pointsEarned : Math.max(0, baseOf(l) - penaltyOf(l, p?.hintsUsed ?? [])));
    const myStatus = (p?: ProgressRec) => (!p ? 'not-started' : p.status === 'completed' ? 'completed' : 'in-progress');
    const card = (l: LabRec) => {
        const view: Record<string, unknown> = {
            _id: l._id, slug: l.slug, title: l.title, summary: l.description, category: l.category, difficulty: l.difficulty, difficultyRank: RANK[l.difficulty],
            points: baseOf(l), tags: l.tags, estimatedMinutes: l.estimatedMinutes, hintCount: l.hints.length, fileCount: l.files.length, labUrl: l.labUrl,
            completionCount: l.completionCount, createdAt: l.createdAt,
        };
        if (who.role) view.myStatus = myStatus(state.progress[l.slug]);
        return view;
    };
    // The whole row the API sends for a member's progress on one lab
    const progressRow = (l: LabRec, p: ProgressRec) => ({
        _id: 'p', lab: l._id, labSlug: l.slug, difficulty: l.difficulty, status: p.status, hintsUsed: p.hintsUsed, attempts: p.attempts,
        pointsEarned: p.status === 'completed' ? p.pointsEarned : 0, startedAt: p.startedAt, completedAt: p.completedAt,
        timeSpent: Math.max(0, Math.round(((p.completedAt ? Date.parse(p.completedAt) : Date.now()) - Date.parse(p.startedAt)) / 1000)),
        lockedUntil: lockedUntil(p), lockedForSeconds: lockedForSeconds(p),
    });
    const lockedUntil = (p?: ProgressRec) => (p?.lockedUntil && p.lockedUntil > Date.now() ? new Date(p.lockedUntil + state.clockSkewMs).toISOString() : null);
    // The API counts the wait in whole seconds, rounded up, next to the instant
    const lockedForSeconds = (p?: ProgressRec) => (p?.lockedUntil && p.lockedUntil > Date.now() ? Math.ceil((p.lockedUntil - Date.now()) / 1000) : null);
    const detail = (l: LabRec) => {
        const p = state.progress[l.slug];
        const view: Record<string, unknown> = {
            ...card(l), description: l.description, instructions: l.instructions, files: l.files, updatedAt: l.updatedAt,
            hints: l.hints.map((h, index) => {
                const open = !!p?.hintsUsed.includes(index);
                return { index, penalty: h.penalty, unlocked: open, ...((open || staff) && { text: h.text }) };
            }),
            viewer: who.role ? {
                myStatus: myStatus(p), hintsUsed: p?.hintsUsed.length ?? 0, attempts: p?.attempts ?? 0, startedAt: p?.startedAt ?? null, completedAt: p?.completedAt ?? null,
                pointsAwarded: p?.status === 'completed' ? p.pointsEarned : 0, pointsAvailable: available(l, p), lockedUntil: lockedUntil(p), lockedForSeconds: lockedForSeconds(p),
            } : null,
        };
        if (staff) view.admin = { status: l.status, flagCount: l.flags.length, pointsOverride: l.points, startCount: l.startCount };
        return view;
    };
    const paged = (items: unknown[], pageNo: number, limit: number) => {
        const start = (pageNo - 1) * limit;
        const slice = items.slice(start, start + limit);
        return {
            success: true, count: slice.length, data: slice,
            pagination: { page: pageNo, limit, total: pageNo === 1 ? items.length : null, totalPages: pageNo === 1 ? Math.max(1, Math.ceil(items.length / limit)) : null, hasMore: start + slice.length < items.length },
        };
    };
    const findLab = (slug: string) => state.labs.find((l) => l.slug === slug);
    const visible = (l: LabRec | undefined) => (l && (l.status === 'published' || staff) ? l : undefined);

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
        if (!path.startsWith('/api/labs')) {
            if (path === '/api/notifications/unread-count') return send(route, 200, { success: true, data: { count: 0, byType: {} } });
            return send(route, 200, { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1, hasMore: false } });
        }

        const sub = path.replace(/^\/api\/labs/, '') || '/';
        state.calls.push({ method, path: sub, ...(q.toString() ? { query: q.toString() } : {}), ...(method === 'GET' ? {} : { body }) });

        const once = Object.entries(state.failOnce).find(([k]) => k.split(' ')[0] === method && sub.endsWith(k.split(' ')[1]));
        if (once && method !== 'GET') {
            delete state.failOnce[once[0]];
            const f = once[1];
            return fail(route, f.status, f.code ?? 'INTERNAL_ERROR', f.message ?? 'Something failed', { ...(f.details ? { details: f.details } : {}), ...(f.meta ? { meta: f.meta } : {}) });
        }

        // ---- fixed paths ----
        if (method === 'GET' && (sub === '/' || sub === '')) {
            let items = state.labs.filter((l) => l.status === 'published');
            const category = q.get('category'); const difficulty = q.get('difficulty'); const text = (q.get('q') ?? '').toLowerCase(); const status = q.get('status');
            if (category) items = items.filter((l) => l.category === category);
            if (difficulty) items = items.filter((l) => l.difficulty === difficulty);
            if (text) items = items.filter((l) => `${l.title} ${l.tags.join(' ')} ${l.description}`.toLowerCase().includes(text));
            if (status && who.role) items = items.filter((l) => myStatus(state.progress[l.slug]) === status);
            const sort = q.get('sort') ?? 'newest';
            if (sort === 'difficulty') items = [...items].sort((a, b) => RANK[a.difficulty] - RANK[b.difficulty]);
            if (sort === 'points') items = [...items].sort((a, b) => baseOf(b) - baseOf(a));
            if (sort === 'popular') items = [...items].sort((a, b) => b.completionCount - a.completionCount);
            const limit = Math.min(Number(q.get('limit') ?? 20), state.pageCap);
            return send(route, 200, paged(items.map(card), Number(q.get('page') ?? 1), limit));
        }
        if (method === 'GET' && sub === '/categories') {
            const pub = state.labs.filter((l) => l.status === 'published');
            const count = (key: 'category' | 'difficulty') => Object.entries(pub.reduce<Record<string, number>>((m, l) => ({ ...m, [l[key]]: (m[l[key]] ?? 0) + 1 }), {}));
            return send(route, 200, { success: true, data: { total: pub.length, categories: count('category').map(([category, n]) => ({ category, count: n })), difficulties: count('difficulty').map(([difficulty, n]) => ({ difficulty, count: n })) } });
        }
        if (method === 'GET' && sub === '/leaderboard') {
            const category = q.get('category');
            return send(route, 200, { success: true, data: category === 'osint' ? [] : LEADERS });
        }
        if (method === 'GET' && sub === '/manage') {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const status = q.get('status');
            const items = state.labs.filter((l) => !status || l.status === status).map((l) => ({ ...card(l), status: l.status, flagCount: l.flags.length, startCount: l.startCount, updatedAt: l.updatedAt }));
            return send(route, 200, paged(items, Number(q.get('page') ?? 1), Math.min(Number(q.get('limit') ?? 20), state.pageCap)));
        }
        if (method === 'GET' && sub === '/stats') {
            if (!who.role) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
            const rows = Object.entries(state.progress).map(([slug, p]) => ({ lab: findLab(slug)!, p }));
            const by = (d: string) => {
                const r = rows.filter((x) => x.lab.difficulty === d);
                return { started: r.length, completed: r.filter((x) => x.p.status === 'completed').length, points: r.reduce((s, x) => s + (x.p.status === 'completed' ? x.p.pointsEarned : 0), 0) };
            };
            return send(route, 200, { success: true, data: {
                totalStarted: rows.length, totalCompleted: rows.filter((x) => x.p.status === 'completed').length,
                totalPoints: rows.reduce((s, x) => s + (x.p.status === 'completed' ? x.p.pointsEarned : 0), 0), totalHintsUsed: rows.reduce((s, x) => s + x.p.hintsUsed.length, 0), totalTimeSpent: 0,
                byDifficulty: { easy: by('easy'), medium: by('medium'), hard: by('hard') },
            } });
        }
        if (method === 'GET' && sub === '/progress') return send(route, 200, paged([], 1, 50));

        if (method === 'POST' && (sub === '/' || sub === '')) {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const details: { field: string; message: string }[] = [];
            const title = String(body.title ?? '');
            if (title.length < 3) details.push({ field: 'title', message: 'Title must be at least 3 characters' });
            if (!body.description) details.push({ field: 'description', message: 'Description is required' });
            (body.files as { url: string }[] | undefined)?.forEach((f, i) => { if (!isLink(f.url)) details.push({ field: `files.${i}.url`, message: 'url must point to a public website' }); });
            if (body.labUrl && !isLink(String(body.labUrl))) details.push({ field: 'labUrl', message: 'labUrl must point to a public website' });
            if (details.length) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details });
            const slug = String(body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
            if (findLab(slug)) return fail(route, 409, 'LAB_SLUG_TAKEN', 'This slug is taken');
            const flags = ((body.flags as (string | { value: string; caseSensitive?: boolean })[] | undefined) ?? []).map((f) => (typeof f === 'string' ? { value: f, caseSensitive: false } : { value: f.value, caseSensitive: !!f.caseSensitive }));
            if ((body.status ?? 'draft') === 'published' && flags.length === 0) return fail(route, 409, 'LAB_NOT_READY', 'A lab needs at least one flag before it is published', { details: [{ field: 'flags', message: 'Add at least one flag' }] });
            const lab = base(state.labs.length + 1, {
                slug, title, description: String(body.description), category: String(body.category ?? 'general'), difficulty: (body.difficulty as LabRec['difficulty']) ?? 'easy',
                points: Number(body.points ?? 0), tags: (body.tags as string[]) ?? [], estimatedMinutes: (body.estimatedMinutes as number) ?? null, instructions: String(body.instructions ?? ''),
                hints: (body.hints as HintRec[]) ?? [], files: ((body.files as { name: string; url: string; sizeBytes?: number; sha256?: string }[]) ?? []).map((f) => ({ name: f.name, url: f.url, sizeBytes: f.sizeBytes ?? null, sha256: f.sha256 ?? null })),
                labUrl: (body.labUrl as string) ?? null, status: (body.status as LabRec['status']) ?? 'draft', flags, startCount: 0, completionCount: 0,
            });
            state.labs.push(lab);
            return send(route, 201, { success: true, data: { _id: lab._id, slug: lab.slug, title: lab.title, status: lab.status, flagCount: lab.flags.length, startCount: 0, completionCount: 0 } });
        }

        // ---- one lab ----
        const m = sub.match(/^\/([a-z0-9-]+)(?:\/(leaderboard|progress|start|submit|hint|stop))?$/);
        if (!m) return fail(route, 404, 'NOT_FOUND', 'Not found');
        const [, slug, action] = m;
        const lab = visible(findLab(slug));

        if (method === 'GET' && !action) {
            if (!lab) return fail(route, 404, 'LAB_NOT_FOUND', 'Lab not found');
            return send(route, 200, { success: true, data: detail(lab) });
        }
        if (method === 'GET' && action === 'leaderboard') {
            if (!lab) return fail(route, 404, 'LAB_NOT_FOUND', 'Lab not found');
            return send(route, 200, { success: true, data: lab.slug === SQL ? [
                { rank: 1, user: { username: 'ada', name: 'Ada Lovelace', avatar: null }, pointsEarned: 50, hintsUsed: 0, completedAt: '2026-02-01T10:00:00.000Z' },
                { rank: 2, user: { username: 'linus', name: null, avatar: null }, pointsEarned: 40, hintsUsed: 1, completedAt: '2026-02-02T10:00:00.000Z' },
            ] : [] });
        }
        if (method === 'PUT' && !action) {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const l = findLab(slug);
            if (!l) return fail(route, 404, 'LAB_NOT_FOUND', 'Lab not found');
            if (Object.keys(body).length === 0) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ message: 'At least one field must be provided for update' }] });
            const flags = body.flags as { value: string; caseSensitive?: boolean }[] | undefined;
            const nextStatus = (body.status as LabRec['status'] | undefined) ?? l.status;
            const nextFlags = flags ? flags.map((f) => ({ value: f.value, caseSensitive: !!f.caseSensitive })) : l.flags;
            if (nextStatus === 'published' && nextFlags.length === 0) return fail(route, 409, 'LAB_NOT_READY', 'A lab needs at least one flag before it is published', { details: [{ field: 'flags', message: 'Add at least one flag' }] });
            // Once members have opened hints they stay: no fewer hints, and an opened hint keeps its text and cost
            const hints = body.hints as { text: string; penalty?: number }[] | undefined;
            if (hints) {
                const opened = Array.from(new Set(Object.values(state.progress).flatMap((x) => x.hintsUsed)));
                const changed = opened.some((i) => !hints[i] || hints[i].text !== l.hints[i]?.text || hints[i].penalty !== l.hints[i]?.penalty);
                if ((opened.length > 0 && hints.length < l.hints.length) || changed) return fail(route, 409, 'LAB_HINTS_LOCKED', 'Members have opened hints on this lab', { details: { hints: opened } });
            }
            const { flags: _ignored, ...rest } = body;
            void _ignored;
            Object.assign(l, rest, { flags: nextFlags, updatedAt: new Date().toISOString() });
            return send(route, 200, { success: true, data: { _id: l._id, slug: l.slug, title: l.title, status: l.status, flagCount: l.flags.length, startCount: l.startCount, completionCount: l.completionCount } });
        }
        if (method === 'DELETE' && !action) {
            if (!staff) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const l = findLab(slug);
            if (!l) return fail(route, 404, 'LAB_NOT_FOUND', 'Lab not found');
            if (l.completionCount > 0 || state.progress[l.slug]?.status === 'completed') return fail(route, 409, 'LAB_HAS_COMPLETIONS', 'Members have completed this lab. Archive it instead of deleting it.');
            state.labs = state.labs.filter((x) => x !== l);
            return send(route, 200, { success: true, data: { _id: l._id, slug: l.slug } });
        }

        // ---- member actions ----
        if (!who.role) return fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
        if (!lab) return fail(route, 404, 'LAB_NOT_FOUND', 'Lab not found');
        const p = state.progress[lab.slug];

        if (method === 'GET' && action === 'progress') {
            return p ? send(route, 200, { success: true, data: progressRow(lab, p) }) : fail(route, 404, 'LAB_NOT_STARTED', 'Start the lab first');
        }
        if (method === 'POST' && action === 'start') {
            if (p) return fail(route, 409, 'LAB_ALREADY_STARTED', 'Lab already started');
            state.progress[lab.slug] = started({ startedAt: new Date().toISOString() });
            lab.startCount += 1;
            return send(route, 201, { success: true, data: progressRow(lab, state.progress[lab.slug]) });
        }
        if (!p) return fail(route, 404, 'LAB_NOT_STARTED', 'Start the lab first');

        if (method === 'POST' && action === 'stop') {
            if (p.status === 'started' && p.hintsUsed.length === 0 && p.attempts === 0) {
                delete state.progress[lab.slug];
                return send(route, 200, { success: true, data: { reset: true, status: 'not-started' } });
            }
            return send(route, 200, { success: true, data: { reset: false, status: p.status } });
        }
        if (method === 'POST' && action === 'hint') {
            const index = Number(body.hintIndex);
            if (!Number.isInteger(index) || !lab.hints[index]) return fail(route, 404, 'LAB_HINT_NOT_FOUND', 'Hint not found');
            if (p.status === 'completed') return fail(route, 409, 'LAB_ALREADY_COMPLETED', 'Already completed', { meta: { status: 'completed', pointsEarned: p.pointsEarned } });
            const already = p.hintsUsed.includes(index);
            if (!already) p.hintsUsed.push(index);
            return send(route, 200, { success: true, data: {
                hint: { index, text: lab.hints[index].text, penalty: lab.hints[index].penalty }, alreadyUnlocked: already, hintsUsed: p.hintsUsed.length,
                pointsPenalty: penaltyOf(lab, p.hintsUsed), pointsAvailable: available(lab, p),
            } });
        }
        if (method === 'POST' && action === 'submit') {
            // Like the API: a lab without a flag is refused before the progress is looked at
            if (lab.flags.length === 0) return fail(route, 409, 'LAB_NO_FLAGS', 'This lab has no flag yet');
            if (p.status === 'completed') return fail(route, 409, 'LAB_ALREADY_COMPLETED', 'Already completed', { meta: { status: 'completed', pointsEarned: p.pointsEarned } });
            if (p.lockedUntil && p.lockedUntil > Date.now()) {
                const retryAfter = Math.max(1, Math.ceil((p.lockedUntil - Date.now()) / 1000));
                return fail(route, 429, 'LAB_LOCKED', 'Too many wrong flags for this lab.', { meta: { retryAfter, lockedUntil: new Date(p.lockedUntil).toISOString() } }, { 'Retry-After': String(retryAfter) });
            }
            const flag = String(body.flag ?? '');
            if (!flag.trim() || flag.length > 500) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ field: 'flag', message: 'A flag is required' }] });
            const right = lab.flags.some((f) => norm(f.value, f.caseSensitive) === norm(flag, f.caseSensitive));
            if (right) {
                p.status = 'completed';
                p.completedAt = new Date().toISOString();
                p.attempts += 1;
                p.pointsEarned = available(lab, { ...p, status: 'started' });
                lab.completionCount += 1;
                const first = Object.values(state.progress).filter((x) => x.status === 'completed').length === 1;
                return send(route, 200, { success: true, correct: true, data: {
                    correct: true, attempts: p.attempts, status: 'completed', pointsEarned: p.pointsEarned, completedAt: p.completedAt,
                    newBadges: first ? [{ code: 'first-lab', name: 'First Lab', icon: 'flag', rarity: 'common' }] : [],
                } });
            }
            p.attempts += 1;
            p.wrong = [...p.wrong.filter((t) => t > Date.now() - 600_000), Date.now()];
            if (p.wrong.length >= 5) { p.lockedUntil = Date.now() + state.lockSeconds * 1000; p.wrong = []; }
            return send(route, 200, { success: true, correct: false, data: {
                correct: false, attempts: p.attempts, status: 'started', pointsEarned: 0, attemptsLeft: p.lockedUntil && p.lockedUntil > Date.now() ? 0 : 5 - p.wrong.length, lockedUntil: lockedUntil(p), lockedForSeconds: lockedForSeconds(p),
            } });
        }
        return fail(route, 404, 'NOT_FOUND', 'Not found');
    });
    return state;
}
