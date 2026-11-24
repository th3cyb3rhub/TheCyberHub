import type { Page, Route } from '@playwright/test';

/**
 * An in-memory stand-in for the CTF competitions API, so the e2e specs run without a backend.
 * Reads answer from `state`; writes change it and are pushed to `calls` for assertions. The rules
 * mirror the real API (the status follows the clock, a wrong flag is HTTP 200, points are fixed by
 * the server, a frozen board is cut at the freeze time, a team that scored keeps its roster), so the
 * screens are exercised, not the mock. Flags live in the mock only, never in a response.
 */

export interface Role { id: string; role: 'user' | 'moderator' | 'admin' | 'owner' | null; username?: string }
export const MEMBER: Role = { id: 'user-1', role: 'user', username: 'testuser' };
export const MODERATOR: Role = { id: 'staff-1', role: 'moderator', username: 'moddy' };
export const ADMIN: Role = { id: 'admin-1', role: 'admin', username: 'rootadmin' };
export const VISITOR: Role = { id: '', role: null };

const PEOPLE: Record<string, string> = {
    'user-1': 'testuser', 'user-2': 'second', 'user-3': 'third', 'staff-1': 'moddy', 'admin-1': 'rootadmin', 'u-ada': 'ada', 'u-linus': 'linus', 'u-grace': 'grace',
};

const H = 3_600_000;
const D = 24 * H;

export const LIVE = 'winter-ctf';
export const TEAM = 'team-clash';
export const UPCOMING = 'spring-open';
export const FROZEN = 'frozen-cup';
export const ENDED = 'autumn-ctf';
export const CANCELLED = 'cancelled-cup';
export const DRAFT = 'secret-draft';
export const PRIVATE = 'private-ctf';

export const FLAGS: Record<string, string> = { 'ch-1': 'flag{cookie}', 'ch-2': 'flag{oracle}', 'ch-3': 'flag{strings}' };
const TABLE = [[0, 0, 100], [1, 2, 90], [3, 5, 80], [6, 10, 70], [11, 20, 60], [21, 40, 50], [41, 80, 40], [81, 150, 30], [151, Infinity, 25]] as const;

interface CompRec {
    _id: string; slug: string; title: string; description: string; shortDescription: string | null; image: string | null; rules: string;
    startDate: number; endDate: number; frozenAt: number | null; timezone: string;
    status: 'draft' | 'upcoming' | 'live' | 'frozen' | 'ended' | 'cancelled';
    isPublic: boolean; isFeatured: boolean; teamsEnabled: boolean; minTeamSize: number; maxTeamSize: number;
    scoringMode: 'static' | 'dynamic'; awardsPoints: boolean; prizes: { place: number; reward: string }[]; prizesNote: string | null;
    registrationOpen: boolean; maxParticipants: number; challenges: string[];
}
export interface ChalRec { _id: string; title: string; category: string; difficulty: string; basePoints: number; description: string; tags: string[]; status?: 'active' | 'draft' | 'archived' }
interface SolveRec { comp: string; challenge: string; scope: string; userId: string; points: number; at: number }
export interface TeamRec { _id: string; comp: string; name: string; inviteCode: string; captain: string; members: string[] }
type Fail = { status: number; code?: string; message?: string; details?: { field: string; message: string }[]; meta?: Record<string, unknown>; retryAfter?: number };

export interface MockState {
    comps: CompRec[];
    chals: ChalRec[];
    solves: SolveRec[];
    teams: TeamRec[];
    /** Solo registrations by competition id */
    regs: Record<string, string[]>;
    /** Wrong and right sends per `user:challenge` in the current window */
    sends: Record<string, number>;
    /** After this many sends on one challenge the next is answered 429 (null: never) */
    limitAfter: number | null;
    retryAfter: number;
    pageCap: number;
    /** `METHOD path-suffix` to an error answered once */
    failOnce: Record<string, Fail>;
    calls: { method: string; path: string; query?: string; body?: Record<string, unknown> }[];
    nextId: number;
}

const comp = (n: number, over: Partial<CompRec> & { slug: string; title: string }): CompRec => ({
    _id: `c${n}`.padEnd(24, '0'), description: `${over.title}: solve the set, climb the board.`, shortDescription: `${over.title} short summary`, image: null,
    rules: '## Rules\n\n- Be kind.\n- No attacks on the platform.\n\n<script>window.__xss = 1</script>', startDate: Date.now() - 2 * H, endDate: Date.now() + 24 * H, frozenAt: null,
    timezone: 'Europe/Berlin', status: 'upcoming', isPublic: true, isFeatured: false, teamsEnabled: false, minTeamSize: 1, maxTeamSize: 4, scoringMode: 'static', awardsPoints: false,
    prizes: [{ place: 1, reward: 'A hardware key' }, { place: 2, reward: 'Hoodie' }], prizesNote: null, registrationOpen: true, maxParticipants: 0,
    challenges: ['ch-1', 'ch-2', 'ch-3'], ...over,
});

export function freshState(over: Partial<MockState> = {}): MockState {
    const now = Date.now();
    const state: MockState = {
        comps: [
            comp(1, { slug: LIVE, title: 'Winter CTF', isFeatured: true, startDate: now - 2 * H, endDate: now + 22 * H }),
            comp(2, { slug: TEAM, title: 'Team Clash', teamsEnabled: true, minTeamSize: 2, maxTeamSize: 3, scoringMode: 'dynamic', awardsPoints: true, startDate: now - H, endDate: now + 23 * H }),
            comp(3, { slug: UPCOMING, title: 'Spring Open', startDate: now + 2 * D, endDate: now + 3 * D }),
            comp(4, { slug: FROZEN, title: 'Frozen Cup', startDate: now - 5 * H, endDate: now + 19 * H, frozenAt: now - 2 * H }),
            comp(5, { slug: ENDED, title: 'Autumn CTF', startDate: now - 5 * D, endDate: now - 3 * D, prizes: [{ place: 1, reward: 'A hardware key' }, { place: 2, reward: 'Hoodie' }, { place: 3, reward: 'Stickers' }] }),
            comp(6, { slug: CANCELLED, title: 'Cancelled Cup', status: 'cancelled', startDate: now + D, endDate: now + 2 * D }),
            comp(7, { slug: DRAFT, title: 'Secret Draft', status: 'draft', startDate: now + 7 * D, endDate: now + 8 * D, challenges: [] }),
            comp(8, { slug: PRIVATE, title: 'Private Invite CTF', isPublic: false, startDate: now - H, endDate: now + 5 * H }),
        ],
        chals: [
            { _id: 'ch-1', title: 'Cookie Monster', category: 'web-security', difficulty: 'easy', basePoints: 100, description: 'Find the **cookie**.\n\n<img src=x onerror="window.__xss=2">', tags: ['web'] },
            { _id: 'ch-2', title: 'Padding Oracle', category: 'cryptography', difficulty: 'hard', basePoints: 300, description: 'Decrypt the token.', tags: ['crypto'] },
            { _id: 'ch-3', title: 'Hidden Strings', category: 'reverse-engineering', difficulty: 'medium', basePoints: 200, description: 'Look inside the binary.', tags: ['re'] },
            { _id: 'ch-4', title: 'Spare Challenge', category: 'forensics', difficulty: 'easy', basePoints: 50, description: 'Not in any set yet.', tags: [] },
            { _id: 'ch-5', title: 'Another Spare', category: 'osint', difficulty: 'medium', basePoints: 150, description: 'Also free.', tags: [] },
            { _id: 'ch-6', title: 'Draft Challenge', category: 'misc', difficulty: 'easy', basePoints: 25, description: 'Not published yet.', tags: [], status: 'draft' },
            { _id: 'ch-7', title: 'Archived Challenge', category: 'misc', difficulty: 'easy', basePoints: 25, description: 'Retired.', tags: [], status: 'archived' },
        ],
        solves: [],
        teams: [],
        regs: {},
        sends: {},
        limitAfter: null,
        retryAfter: 2,
        pageCap: 100,
        failOnce: {},
        calls: [],
        nextId: 100,
        ...over,
    };
    const idOf = (slug: string) => state.comps.find((c) => c.slug === slug)!._id;
    const solve = (slug: string, challenge: string, userId: string, points: number, minutesAgo: number) =>
        state.solves.push({ comp: idOf(slug), challenge, scope: `user:${userId}`, userId, points, at: Date.now() - minutesAgo * 60_000 });
    // Live: ada leads
    solve(LIVE, 'ch-1', 'u-ada', 100, 90); solve(LIVE, 'ch-2', 'u-ada', 300, 60); solve(LIVE, 'ch-1', 'u-linus', 100, 80);
    // Frozen: ada solved before the freeze, linus after it (the public board does not show linus's)
    solve(FROZEN, 'ch-1', 'u-ada', 100, 200); solve(FROZEN, 'ch-2', 'u-linus', 300, 30);
    // Ended: a full podium
    solve(ENDED, 'ch-1', 'u-ada', 100, 7000); solve(ENDED, 'ch-2', 'u-ada', 300, 6900); solve(ENDED, 'ch-1', 'u-linus', 100, 6800);
    solve(ENDED, 'ch-3', 'u-linus', 200, 6700); solve(ENDED, 'ch-1', 'u-grace', 100, 6600);
    state.regs[idOf(LIVE)] = ['u-ada', 'u-linus'];
    state.regs[idOf(FROZEN)] = ['u-ada', 'u-linus'];
    state.regs[idOf(ENDED)] = ['u-ada', 'u-linus', 'u-grace'];
    return state;
}

/** A team of the given people in a team competition. The first person is the captain. */
export function seedTeam(state: MockState, slug: string, name: string, people: string[], inviteCode = 'ABCDEF0123456789ABCD'): TeamRec {
    const team: TeamRec = { _id: `t${state.nextId++}`, comp: state.comps.find((c) => c.slug === slug)!._id, name, inviteCode, captain: people[0], members: [...people] };
    state.teams.push(team);
    return team;
}

const cors = (route: Route) => ({
    'access-control-allow-origin': route.request().headers()['origin'] || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
});
const send = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', headers: cors(route), body: JSON.stringify(body) });
const fail = (route: Route, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
    send(route, status, { success: false, error: { code, message, ...extra } });

const person = (id: string) => ({ _id: id, username: PEOPLE[id] ?? id, avatar: null });
const SLUGS = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function mockCtfApi(page: Page, who: Role, state: MockState = freshState()): Promise<MockState> {
    const staff = who.role === 'admin' || who.role === 'owner' || who.role === 'moderator';
    const writer = who.role === 'admin' || who.role === 'owner';
    if (who.role) await page.addInitScript(() => window.localStorage.setItem('token', 'e2e-token'));
    await page.route('**/socket.io/**', (route) => route.abort());

    const effective = (c: CompRec) => {
        if (c.status === 'draft' || c.status === 'cancelled') return c.status;
        const t = Date.now();
        if (t >= c.endDate) return 'ended';
        if (t < c.startDate) return 'upcoming';
        if (c.frozenAt !== null && t >= c.frozenAt) return 'frozen';
        return 'live';
    };
    const playable = (c: CompRec) => { const s = effective(c); return s === 'live' || s === 'frozen'; };
    const byRef = (ref: string) => state.comps.find((c) => c.slug === ref || c._id === ref);
    const viewable = (c: CompRec | undefined) => (c && (staff || c.status !== 'draft') ? c : undefined);
    const solvesOf = (c: CompRec) => state.solves.filter((s) => s.comp === c._id);
    const teamOf = (c: CompRec, userId: string) => state.teams.find((t) => t.comp === c._id && t.members.includes(userId));
    const scopeOf = (c: CompRec, userId: string) => (c.teamsEnabled ? (teamOf(c, userId) ? `team:${teamOf(c, userId)!._id}` : null) : `user:${userId}`);
    const participants = (c: CompRec) => (c.teamsEnabled ? state.teams.filter((t) => t.comp === c._id).reduce((n, t) => n + t.members.length, 0) : (state.regs[c._id] ?? []).length);
    const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

    const card = (c: CompRec) => ({
        _id: c._id, title: c.title, slug: c.slug, description: c.description, shortDescription: c.shortDescription, image: c.image,
        startDate: iso(c.startDate), endDate: iso(c.endDate), timezone: c.timezone, status: effective(c), isFeatured: c.isFeatured,
        teamsEnabled: c.teamsEnabled, minTeamSize: c.minTeamSize, maxTeamSize: c.maxTeamSize, scoringMode: c.scoringMode, awardsPoints: c.awardsPoints,
        prizes: c.prizes, prizesNote: c.prizesNote, registrationOpen: c.registrationOpen, maxParticipants: c.maxParticipants, participantCount: participants(c),
        frozenAt: iso(c.frozenAt), challengeCount: c.challenges.length,
    });
    const details = (c: CompRec) => c.challenges.map((id, position) => {
        const ch = state.chals.find((x) => x._id === id);
        return ch
            ? { _id: id, position, title: ch.title, category: ch.category, difficulty: ch.difficulty, basePoints: ch.basePoints, status: 'active', solveCount: new Set(solvesOf(c).filter((s) => s.challenge === id).map((s) => s.scope)).size }
            : { _id: id, position, missing: true };
    });
    const detail = (c: CompRec) => ({
        ...card(c), rules: c.rules,
        challenges: staff || playable(c) || effective(c) === 'ended' ? c.challenges : [],
        ...(staff ? { isPublic: c.isPublic, createdBy: 'admin-1', storedStatus: c.status, backfillDone: true, challengeDetails: details(c) } : {}),
    });

    const pointsFor = (c: CompRec, ch: ChalRec, before: number) => {
        if (c.scoringMode !== 'dynamic') return ch.basePoints;
        const band = TABLE.find(([from, to]) => before >= from && before <= to);
        return Math.max(1, Math.ceil(ch.basePoints * 0.25), Math.round((ch.basePoints * (band ? band[2] : 25)) / 100));
    };
    const scopesSolved = (c: CompRec, challenge: string) => new Set(solvesOf(c).filter((s) => s.challenge === challenge).map((s) => s.scope));

    // The board at an instant: a frozen competition shows the public one as it stood at the freeze
    const board = (c: CompRec, at: number | null) => {
        const rows = new Map<string, { points: number; solves: number; last: number }>();
        for (const s of solvesOf(c)) {
            if (at !== null && s.at > at) continue;
            const row = rows.get(s.scope) ?? { points: 0, solves: 0, last: 0 };
            row.points += s.points; row.solves += 1; row.last = Math.max(row.last, s.at);
            rows.set(s.scope, row);
        }
        const sorted = Array.from(rows.entries()).sort((a, b) => b[1].points - a[1].points || a[1].last - b[1].last);
        return sorted.map(([scope, row], i) => {
            const base = { rank: i + 1, points: row.points, solves: row.solves, lastSolveAt: iso(row.last) };
            if (scope.startsWith('team:')) {
                const t = state.teams.find((x) => `team:${x._id}` === scope)!;
                return { ...base, teamId: t._id, teamName: t.name, captain: { username: PEOPLE[t.captain], avatar: null }, members: t.members.length };
            }
            const id = scope.slice(5);
            return { ...base, username: PEOPLE[id] ?? id, avatar: null };
        });
    };

    const teamView = (t: TeamRec) => {
        const c = state.comps.find((x) => x._id === t.comp)!;
        const mine = solvesOf(c).filter((s) => s.scope === `team:${t._id}`);
        return {
            _id: t._id, competition: t.comp, name: t.name, inviteCode: t.inviteCode, captain: person(t.captain), members: t.members.map(person),
            points: mine.reduce((n, s) => n + s.points, 0), solveCount: mine.length, lastSolveAt: mine.length ? iso(Math.max(...mine.map((s) => s.at))) : null,
        };
    };

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
                ? send(route, 200, { success: true, data: { id: who.id, _id: who.id, name: 'Test User', username: who.username ?? 'testuser', email: 'test@example.com', role: who.role, isVerified: true, provider: 'local' } })
                : fail(route, 401, 'AUTH_REQUIRED', 'Sign in');
        }
        if (path === '/api/revalidate/ctf') return send(route, 200, { revalidated: true });
        if (path === '/api/notifications/unread-count') return send(route, 200, { success: true, data: { count: 0, byType: {} } });

        // The challenge picker of the admin form
        if (path === '/api/challenges' && method === 'GET') {
            if (!writer) return fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden');
            const text = (q.get('search') ?? '').toLowerCase();
            // `all` returns archived ones too: the picker must leave them out
            const items = state.chals.filter((c) => !text || c.title.toLowerCase().includes(text)).map((c) => ({ ...c, status: c.status ?? 'active' }));
            return send(route, 200, { success: true, data: items, meta: { hasMore: false } });
        }

        if (!path.startsWith('/api/ctf-competitions')) {
            return send(route, 200, { success: true, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1, hasMore: false } });
        }

        const sub = path.replace(/^\/api\/ctf-competitions/, '') || '/';
        state.calls.push({ method, path: sub, ...(q.toString() ? { query: q.toString() } : {}), ...(method === 'GET' ? {} : { body }) });

        const once = Object.entries(state.failOnce).find(([k]) => k.split(' ')[0] === method && (k.split(' ')[1] === '*' ? /^\/[^/]+$/.test(sub) : sub.endsWith(k.split(' ')[1])));
        if (once && method !== 'GET') {
            delete state.failOnce[once[0]];
            const f = once[1];
            return fail(route, f.status, f.code ?? 'INTERNAL_ERROR', f.message ?? 'Something failed', {
                ...(f.details ? { details: f.details } : {}), ...(f.meta ? { meta: f.meta } : {}), ...(f.retryAfter ? { retryAfter: f.retryAfter } : {}),
            });
        }
        const needSignIn = () => (who.role ? null : fail(route, 401, 'AUTH_REQUIRED', 'Sign in'));
        const needWriter = () => (writer ? null : fail(route, 403, 'AUTHZ_FORBIDDEN', 'Forbidden'));

        // ---- the list and creating ----
        if (sub === '/' || sub === '') {
            if (method === 'GET') {
                const status = q.get('status') ?? '';
                let items = state.comps.filter((c) => (staff || (c.status !== 'draft' && c.isPublic)));
                const is = (c: CompRec) => effective(c);
                if (status === 'ongoing') items = items.filter((c) => is(c) === 'live' || is(c) === 'frozen');
                else if (status === 'completed') items = items.filter((c) => is(c) === 'ended');
                else if (status) items = items.filter((c) => is(c) === status);
                const order = (c: CompRec) => ({ live: 0, frozen: 0, upcoming: 1, ended: 2, cancelled: 3, draft: 4 }[is(c)]);
                items = [...items].sort((a, b) => order(a) - order(b) || (is(a) === 'ended' ? b.endDate - a.endDate : a.startDate - b.startDate));
                const limit = Math.min(Number(q.get('limit') ?? 20), state.pageCap);
                const page = Number(q.get('page') ?? 1);
                const slice = items.slice((page - 1) * limit, page * limit);
                return send(route, 200, { success: true, data: slice.map(card), pagination: { page, limit, total: items.length, pages: Math.max(1, Math.ceil(items.length / limit)) } });
            }
            if (method === 'POST') {
                const denied = needWriter(); if (denied) return denied;
                const details: { field: string; message: string }[] = [];
                const title = String(body.title ?? '');
                if (title.length < 3) details.push({ field: 'title', message: 'Title must be at least 3 characters' });
                if (!body.description) details.push({ field: 'description', message: 'Description is required' });
                if (!body.startDate) details.push({ field: 'startDate', message: 'Start date is required' });
                if (!body.endDate) details.push({ field: 'endDate', message: 'End date is required' });
                else if (body.startDate && Date.parse(String(body.endDate)) <= Date.parse(String(body.startDate))) details.push({ field: 'endDate', message: 'End date must be after start date' });
                if (details.length) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details });
                const slug = String(body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                if (!SLUGS.test(slug)) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ field: 'slug', message: 'Slug may only contain lowercase letters, numbers, and single hyphens between words' }] });
                if (byRef(slug)) return fail(route, 409, 'CTF_SLUG_TAKEN', 'That slug is already used by another competition');
                const created = comp(state.nextId++, {
                    slug, title, description: String(body.description), shortDescription: (body.shortDescription as string) ?? null, rules: String(body.rules ?? ''), image: (body.image as string) ?? null,
                    startDate: Date.parse(String(body.startDate)), endDate: Date.parse(String(body.endDate)), timezone: String(body.timezone ?? 'UTC'),
                    status: ((body.status as CompRec['status']) ?? 'draft'), isPublic: body.isPublic !== false, isFeatured: !!body.isFeatured, teamsEnabled: !!body.teamsEnabled,
                    minTeamSize: Number(body.minTeamSize ?? 1), maxTeamSize: Number(body.maxTeamSize ?? 4), scoringMode: (body.scoringMode as CompRec['scoringMode']) ?? 'static',
                    awardsPoints: !!body.awardsPoints, prizes: (body.prizes as CompRec['prizes']) ?? [], prizesNote: (body.prizesNote as string) ?? null,
                    registrationOpen: body.registrationOpen !== false, maxParticipants: Number(body.maxParticipants ?? 0), challenges: (body.challenges as string[]) ?? [],
                    frozenAt: body.frozenAt ? Date.parse(String(body.frozenAt)) : null,
                });
                state.comps.push(created);
                return send(route, 201, { success: true, data: { ...card(created), rules: created.rules, challenges: created.challenges } });
            }
        }

        // ---- admin writes by id ----
        const admin = sub.match(/^\/([^/]+)(?:\/(cancel|challenges)(?:\/([^/]+))?)?$/);
        if (admin && (method === 'PUT' || method === 'DELETE' || (method === 'POST' && (admin[2] === 'cancel' || admin[2] === 'challenges')))) {
            const [, ref, action, item] = admin;
            const denied = needWriter(); if (denied) return denied;
            const c = state.comps.find((x) => x._id === ref);
            if (!c) return fail(route, 404, 'CTF_NOT_FOUND', 'Competition not found');
            const hasSolves = solvesOf(c).length > 0;

            if (action === 'cancel') { c.status = 'cancelled'; return send(route, 200, { success: true, data: card(c) }); }
            if (action === 'challenges') {
                if (method === 'POST') {
                    const id = String(body.challengeId);
                    if (!state.chals.some((x) => x._id === id && x.status !== 'archived')) return fail(route, 400, 'CTF_CHALLENGE_INVALID', 'Challenge not usable');
                    if (c.challenges.includes(id)) return fail(route, 409, 'CTF_CHALLENGE_DUPLICATE', 'Already in the competition');
                    c.challenges.push(id);
                } else if (method === 'PUT') {
                    const next = (body.challenges as string[]) ?? [];
                    const removed = c.challenges.filter((id) => !next.includes(id));
                    const solved = removed.filter((id) => solvesOf(c).some((s) => s.challenge === id));
                    if (solved.length) return fail(route, 409, 'CTF_CHALLENGE_HAS_SOLVES', 'A challenge with solves cannot be removed', { meta: { challenges: solved } });
                    c.challenges = next;
                } else if (method === 'DELETE') {
                    if (!c.challenges.includes(item)) return fail(route, 404, 'CTF_CHALLENGE_NOT_FOUND', 'Not in this competition');
                    if (solvesOf(c).some((s) => s.challenge === item)) return fail(route, 409, 'CTF_CHALLENGE_HAS_SOLVES', 'A challenge with solves cannot be removed', { meta: { challenges: [item] } });
                    c.challenges = c.challenges.filter((id) => id !== item);
                }
                return send(route, 200, { success: true, data: { ...card(c), challenges: c.challenges } });
            }
            if (method === 'DELETE') {
                if (hasSolves) { c.status = 'cancelled'; return send(route, 200, { success: true, data: { deleted: false, cancelled: true, status: 'cancelled' } }); }
                state.comps = state.comps.filter((x) => x !== c);
                return send(route, 200, { success: true, data: { deleted: true, cancelled: false, status: c.status } });
            }
            // PUT: the whitelist of fields, the lock and the status words
            if (Object.keys(body).length === 0) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ message: 'At least one field must be provided for update' }] });
            const start = body.startDate ? Date.parse(String(body.startDate)) : c.startDate;
            const end = body.endDate ? Date.parse(String(body.endDate)) : c.endDate;
            if (end <= start) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ field: 'endDate', message: 'End date must be after start date' }] });
            const locked = ['teamsEnabled', 'scoringMode'].filter((f) => f in body && body[f] !== (c as unknown as Record<string, unknown>)[f]);
            if (locked.length && hasSolves) return fail(route, 409, 'CTF_LOCKED', `${locked.join(' and ')} cannot change once teams or solves exist`, { meta: { fields: locked } });
            if (body.slug && body.slug !== c.slug && byRef(String(body.slug))) return fail(route, 409, 'CTF_SLUG_TAKEN', 'That slug is already used by another competition');
            for (const key of ['title', 'slug', 'description', 'shortDescription', 'image', 'rules', 'timezone', 'isPublic', 'isFeatured', 'teamsEnabled', 'minTeamSize', 'maxTeamSize', 'scoringMode', 'prizes', 'prizesNote', 'registrationOpen', 'maxParticipants', 'awardsPoints'] as const) {
                if (key in body) (c as unknown as Record<string, unknown>)[key] = body[key];
            }
            c.startDate = start; c.endDate = end;
            if ('frozenAt' in body) c.frozenAt = body.frozenAt ? Date.parse(String(body.frozenAt)) : null;
            if (body.status === 'ended') { c.endDate = Math.min(c.endDate, Date.now()); c.status = 'ended'; }
            else if (body.status) c.status = body.status === 'draft' || body.status === 'cancelled' ? body.status : 'upcoming';
            return send(route, 200, { success: true, data: { ...card(c), rules: c.rules, challenges: c.challenges } });
        }

        // ---- one competition by slug ----
        const m = sub.match(/^\/([a-z0-9-]+)(?:\/(challenges|leaderboard|results|me|register|team)(?:\/(join|leave|kick)|\/([a-z0-9-]+)\/(submit))?)?$/);
        if (!m) return fail(route, 404, 'NOT_FOUND', 'Not found');
        const [, slug, area, teamAction, challengeId] = m;
        const c = viewable(byRef(slug));

        if (!area && method === 'GET') {
            if (!c) return fail(route, 404, 'CTF_NOT_FOUND', 'Competition not found');
            return send(route, 200, { success: true, data: detail(c) });
        }
        if (!c) return fail(route, 404, 'CTF_NOT_FOUND', 'Competition not found');
        const status = effective(c);

        if (area === 'challenges' && !challengeId && method === 'GET') {
            if (!staff && status === 'upcoming') return fail(route, 403, 'CTF_NOT_STARTED', 'The challenges are shown when the competition starts');
            const scope = who.role ? scopeOf(c, who.id) : null;
            const items = c.challenges.map((id) => state.chals.find((x) => x._id === id)).filter((x): x is ChalRec => !!x).map((ch) => ({
                _id: ch._id, title: ch.title, category: ch.category, difficulty: ch.difficulty, description: ch.description, shortDescription: ch.title, flagFormat: 'flag{...}', tags: ch.tags,
                basePoints: ch.basePoints, currentPoints: pointsFor(c, ch, scopesSolved(c, ch._id).size), files: [], hintCount: 0, solveCount: scopesSolved(c, ch._id).size,
                solved: !!scope && scopesSolved(c, ch._id).has(scope),
            }));
            return send(route, 200, { success: true, data: items });
        }

        if (area === 'challenges' && challengeId && method === 'POST') {
            const denied = needSignIn(); if (denied) return denied;
            if (status === 'ended') return fail(route, 403, 'CTF_ENDED', 'This competition has ended');
            if (status === 'cancelled') return fail(route, 403, 'CTF_CANCELLED', 'This competition was cancelled');
            if (status !== 'live' && status !== 'frozen') return fail(route, 403, 'CTF_NOT_STARTED', 'This competition has not started yet');
            const ch = state.chals.find((x) => x._id === challengeId);
            if (!ch || !c.challenges.includes(ch._id)) return fail(route, 404, 'CTF_CHALLENGE_NOT_FOUND', 'Challenge not found');
            const team = c.teamsEnabled ? teamOf(c, who.id) : null;
            if (c.teamsEnabled && !team) return fail(route, 409, 'CTF_TEAM_REQUIRED', 'Create or join a team to submit flags in this competition');
            if (team && team.members.length < c.minTeamSize) return fail(route, 409, 'CTF_TEAM_TOO_SMALL', 'Team too small', { meta: { minTeamSize: c.minTeamSize, members: team.members.length } });
            const scope = team ? `team:${team._id}` : `user:${who.id}`;
            if (scopesSolved(c, ch._id).has(scope)) return fail(route, 409, 'CTF_ALREADY_SOLVED', 'Already solved');
            const key = `${who.id}:${ch._id}`;
            if (state.limitAfter !== null && (state.sends[key] ?? 0) >= state.limitAfter) {
                state.sends[key] = 0;
                return fail(route, 429, 'RATE_LIMIT_EXCEEDED', 'Too many attempts', { retryAfter: state.retryAfter });
            }
            state.sends[key] = (state.sends[key] ?? 0) + 1;
            const flag = String(body.flag ?? '').trim();
            if (flag !== FLAGS[ch._id]) {
                return send(route, 200, { success: false, correct: false, message: 'Incorrect flag', attemptsRecent: state.sends[key], attemptLimit: 10, windowSeconds: 60 });
            }
            const before = scopesSolved(c, ch._id).size;
            const points = pointsFor(c, ch, before);
            state.solves.push({ comp: c._id, challenge: ch._id, scope, userId: who.id, points, at: Date.now() });
            return send(route, 200, {
                success: true, correct: true, message: 'Correct flag!', pointsEarned: points, firstBlood: before === 0, scope: team ? 'team' : 'user',
                teamId: team ? team._id : null, accountPointsAwarded: c.awardsPoints, newBadges: [],
            });
        }

        if (area === 'leaderboard' && method === 'GET') {
            const frozen = status === 'frozen' && !staff;
            const rows = board(c, frozen ? c.frozenAt : null);
            return send(route, 200, { success: true, data: rows.slice(0, 100), mode: c.teamsEnabled ? 'team' : 'solo', frozen, frozenAt: frozen ? iso(c.frozenAt) : null, status, updatedAt: new Date().toISOString() });
        }

        if (area === 'results' && method === 'GET') {
            if (status !== 'ended' && !staff) return fail(route, 409, 'CTF_RESULTS_NOT_AVAILABLE', 'The results are published when the competition has ended');
            const rows = board(c, null);
            return send(route, 200, {
                success: true,
                data: {
                    competition: { slug: c.slug, title: c.title, startDate: iso(c.startDate), endDate: iso(c.endDate), timezone: c.timezone, teamsEnabled: c.teamsEnabled, scoringMode: c.scoringMode, prizes: c.prizes, status },
                    mode: c.teamsEnabled ? 'team' : 'solo', frozen: status === 'frozen', podium: rows.slice(0, 3), standings: rows.slice(0, 20),
                    challenges: c.challenges.map((id) => state.chals.find((x) => x._id === id)).filter((x): x is ChalRec => !!x).map((ch) => {
                        const first = solvesOf(c).filter((s) => s.challenge === ch._id).sort((a, b) => a.at - b.at)[0];
                        return {
                            _id: ch._id, title: ch.title, category: ch.category, difficulty: ch.difficulty, basePoints: ch.basePoints, solveCount: scopesSolved(c, ch._id).size,
                            firstBlood: first ? { username: PEOPLE[first.userId] ?? first.userId, solvedAt: iso(first.at) } : null,
                        };
                    }),
                    totals: { participants: participants(c), solves: solvesOf(c).length, challenges: c.challenges.length },
                    generatedAt: new Date().toISOString(),
                },
            });
        }

        // ---- the member ----
        const denied = area ? needSignIn() : null;
        if (denied) return denied;

        if (area === 'me' && method === 'GET') {
            const team = teamOf(c, who.id);
            const scope = scopeOf(c, who.id);
            const rows = board(c, status === 'frozen' && !staff ? c.frozenAt : null);
            const mine = scope ? rows.find((r) => ('teamId' in r ? `team:${r.teamId}` : `user:${PEOPLE[who.id]}`) === scope || ('username' in r && r.username === PEOPLE[who.id] && scope === `user:${who.id}`)) : undefined;
            const my = solvesOf(c).filter((s) => s.scope === scope);
            return send(route, 200, { success: true, data: {
                status, registered: c.teamsEnabled ? !!team : (state.regs[c._id] ?? []).includes(who.id), team: team ? teamView(team) : null,
                points: my.reduce((n, s) => n + s.points, 0), solveCount: my.length, rank: mine ? mine.rank : null, rankFrozen: status === 'frozen' && !staff,
                solves: my.map((s) => ({ challenge: { _id: s.challenge }, pointsEarned: s.points, solvedAt: iso(s.at), solvedBy: null })),
            } });
        }

        if (area === 'register') {
            if (c.teamsEnabled) return fail(route, 409, 'CTF_USE_TEAM', 'This competition is played in teams');
            const list = (state.regs[c._id] ??= []);
            if (method === 'POST') {
                if (status === 'ended') return fail(route, 409, 'CTF_ENDED', 'This competition has ended');
                if (status === 'cancelled') return fail(route, 409, 'CTF_CANCELLED', 'This competition was cancelled');
                if (!c.registrationOpen) return fail(route, 403, 'CTF_REGISTRATION_CLOSED', 'Registration is closed for this competition');
                if (c.maxParticipants > 0 && list.length >= c.maxParticipants && !list.includes(who.id)) return fail(route, 409, 'CTF_FULL', 'This competition is full');
                if (!list.includes(who.id)) list.push(who.id);
                return send(route, 200, { success: true, data: { registered: true } });
            }
            if (method === 'DELETE') {
                if (solvesOf(c).some((s) => s.userId === who.id)) return fail(route, 409, 'CTF_MEMBER_HAS_SOLVES', 'A member who has solved a challenge cannot withdraw');
                state.regs[c._id] = list.filter((id) => id !== who.id);
                return send(route, 200, { success: true, data: { registered: false } });
            }
        }

        if (area === 'team') {
            if (!c.teamsEnabled) return fail(route, 400, 'CTF_TEAMS_DISABLED', 'Teams are not enabled for this competition');
            const mine = teamOf(c, who.id);
            const open = () => {
                if (status === 'ended') return fail(route, 409, 'CTF_ENDED', 'This competition has ended');
                if (status === 'cancelled') return fail(route, 409, 'CTF_CANCELLED', 'This competition was cancelled');
                if (!c.registrationOpen) return fail(route, 403, 'CTF_REGISTRATION_CLOSED', 'Registration is closed for this competition');
                return null;
            };
            if (!teamAction && method === 'GET') return send(route, 200, { success: true, data: mine ? teamView(mine) : null });
            if (!teamAction && method === 'POST') {
                const closed = open(); if (closed) return closed;
                if (mine) return fail(route, 409, 'CTF_ALREADY_IN_TEAM', 'You are already in a team for this competition');
                const name = String(body.name ?? '').trim();
                if (name.length < 2) return fail(route, 400, 'VALIDATION_ERROR', 'Validation failed', { details: [{ field: 'name', message: 'Team name must be at least 2 characters' }] });
                if (state.teams.some((t) => t.comp === c._id && t.name.toLowerCase() === name.toLowerCase())) return fail(route, 409, 'CTF_TEAM_NAME_TAKEN', 'That team name is already taken');
                const team = seedTeam(state, c.slug, name, [who.id], `E2E${String(state.nextId).padStart(17, '0')}`);
                return send(route, 201, { success: true, data: teamView(team) });
            }
            if (teamAction === 'join' && method === 'POST') {
                const closed = open(); if (closed) return closed;
                if (mine) return fail(route, 409, 'CTF_ALREADY_IN_TEAM', 'You are already in a team for this competition');
                const code = String(body.inviteCode ?? '').trim().toUpperCase();
                const team = state.teams.find((t) => t.comp === c._id && t.inviteCode === code);
                if (!team) return fail(route, 404, 'CTF_INVITE_INVALID', 'Invalid invite code');
                if (team.members.length >= c.maxTeamSize) return fail(route, 409, 'CTF_TEAM_FULL', 'Team is full');
                team.members.push(who.id);
                return send(route, 200, { success: true, data: teamView(team) });
            }
            if (teamAction === 'leave' && method === 'DELETE') {
                if (!mine) return fail(route, 404, 'CTF_NOT_IN_TEAM', 'You are not in a team');
                const closed = status === 'ended' ? fail(route, 409, 'CTF_ENDED', 'This competition has ended') : null; if (closed) return closed;
                if (mine.captain === who.id && mine.members.length > 1) return fail(route, 400, 'CTF_CAPTAIN_CANNOT_LEAVE', 'Remove the other members before leaving');
                if (solvesOf(c).some((s) => s.scope === `team:${mine._id}`)) return fail(route, 409, 'CTF_TEAM_HAS_SOLVES', 'A team that has solved a challenge cannot lose a member');
                const disband = mine.captain === who.id;
                if (disband) state.teams = state.teams.filter((t) => t !== mine); else mine.members = mine.members.filter((id) => id !== who.id);
                return send(route, 200, { success: true, message: disband ? 'Team disbanded' : 'You left the team', data: { disbanded: disband } });
            }
            if (teamAction === 'kick' && method === 'POST') {
                if (!mine || mine.captain !== who.id) return fail(route, 403, 'CTF_NOT_CAPTAIN', 'Only the team captain can kick members');
                const member = String(body.memberId ?? '');
                if (member === who.id) return fail(route, 400, 'CTF_CANNOT_KICK_SELF', 'Cannot kick yourself');
                if (!mine.members.includes(member)) return fail(route, 404, 'CTF_MEMBER_NOT_FOUND', 'That member is not in your team');
                if (solvesOf(c).some((s) => s.scope === `team:${mine._id}`)) return fail(route, 409, 'CTF_TEAM_HAS_SOLVES', 'A team that has solved a challenge cannot lose a member');
                mine.members = mine.members.filter((id) => id !== member);
                return send(route, 200, { success: true, data: { removed: member } });
            }
        }
        return fail(route, 404, 'NOT_FOUND', 'Not found');
    });
    return state;
}
