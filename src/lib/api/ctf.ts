import { fetchApi } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants/api-endpoints';
import type {
    CtfChallenge, CtfCompetition, CtfCompetitionCard, CtfDeleteResult, CtfLeaderboard, CtfListFilters, CtfMe, CtfPage, CtfPayload, CtfPickerChallenge,
    CtfResults, CtfSubmitResult, CtfTeam,
} from '@/types/ctf';
import { LIST_FILTER_QUERY } from '@/lib/ctf/constants';

const E = API_ENDPOINTS.CTF;
const ref = (slug: string) => encodeURIComponent(slug);

const send = (path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) =>
    fetchApi(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** Query string. Empty values are left out; page 1 is implied. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '' || value === false) continue;
        if (key === 'page' && value === 1) continue;
        qs.set(key, String(value));
    }
    const s = qs.toString();
    return s ? `?${s}` : '';
}

/** The API's status word for a filter: a tab (`live` means live and frozen) or a plain status */
function statusParam(status: CtfListFilters['status']): string {
    if (!status || status === 'all') return '';
    return status in LIST_FILTER_QUERY ? LIST_FILTER_QUERY[status as keyof typeof LIST_FILTER_QUERY] : status;
}

// ---- Public reads. The token is sent when there is one: staff see drafts, `solved` is real. ----

export function listCompetitions(filters: CtfListFilters = {}): Promise<CtfPage<CtfCompetitionCard>> {
    return fetchApi(`${E.BASE}${query({ status: statusParam(filters.status), page: filters.page, limit: filters.limit })}`);
}

export async function getCompetition(slug: string): Promise<CtfCompetition> {
    return (await fetchApi(E.BY_REF(ref(slug)))).data;
}

/** With the token: the API marks what the viewer, or the viewer's team, solved. Without it `solved` is always false. */
export async function getChallenges(slug: string): Promise<CtfChallenge[]> {
    return (await fetchApi(E.CHALLENGES(ref(slug)))).data ?? [];
}

/** The board comes flat (`data`, `mode`, `frozen`, ...), not wrapped in a `data` key */
export async function getLeaderboard(slug: string): Promise<CtfLeaderboard> {
    const body = await fetchApi(E.LEADERBOARD(ref(slug)));
    return {
        data: body.data ?? [],
        mode: body.mode === 'team' ? 'team' : 'solo',
        frozen: !!body.frozen,
        frozenAt: body.frozenAt ?? null,
        status: body.status,
        updatedAt: body.updatedAt ?? '',
    };
}

export async function getResults(slug: string): Promise<CtfResults> {
    return (await fetchApi(E.RESULTS(ref(slug)))).data;
}

// ---- Member ----

export async function getMe(slug: string): Promise<CtfMe> {
    return (await fetchApi(E.ME(ref(slug)))).data;
}

export async function register(slug: string): Promise<{ registered: boolean }> {
    return (await send(E.REGISTER(ref(slug)), 'POST')).data;
}

export async function unregister(slug: string): Promise<{ registered: boolean }> {
    return (await send(E.REGISTER(ref(slug)), 'DELETE')).data;
}

/** The team of the member, or null */
export async function getTeam(slug: string): Promise<CtfTeam | null> {
    return (await fetchApi(E.TEAM(ref(slug)))).data ?? null;
}

export async function createTeam(slug: string, name: string): Promise<CtfTeam> {
    return (await send(E.TEAM(ref(slug)), 'POST', { name })).data;
}

export async function joinTeam(slug: string, inviteCode: string): Promise<CtfTeam> {
    return (await send(E.TEAM_JOIN(ref(slug)), 'POST', { inviteCode })).data;
}

export async function leaveTeam(slug: string): Promise<{ disbanded: boolean }> {
    const body = await send(E.TEAM_LEAVE(ref(slug)), 'DELETE');
    return { disbanded: /disbanded/i.test(String(body?.message ?? '')) };
}

export async function kickMember(slug: string, memberId: string): Promise<void> {
    await send(E.TEAM_KICK(ref(slug)), 'POST', { memberId });
}

/**
 * The flag goes to the server and nowhere else: it is not logged, cached or kept. A wrong flag is
 * an ordinary answer (HTTP 200, `success: false`); a right one carries the points. Everything else
 * is an error the caller maps.
 */
export async function submitFlag(slug: string, challengeId: string, flag: string): Promise<CtfSubmitResult> {
    const body = await send(E.SUBMIT(ref(slug), challengeId), 'POST', { flag });
    if (body?.correct === true) {
        return {
            correct: true,
            message: String(body.message ?? 'Correct flag!'),
            pointsEarned: Number(body.pointsEarned) || 0,
            firstBlood: !!body.firstBlood,
            scope: body.scope === 'team' ? 'team' : 'user',
            teamId: body.teamId ?? null,
            accountPointsAwarded: !!body.accountPointsAwarded,
            newBadges: Array.isArray(body.newBadges) ? body.newBadges : [],
        };
    }
    return {
        correct: false,
        message: String(body?.message ?? 'Incorrect flag'),
        attemptsRecent: Number(body?.attemptsRecent) || 0,
        attemptLimit: Number(body?.attemptLimit) || 10,
        windowSeconds: Number(body?.windowSeconds) || 60,
    };
}

// ---- Admin and owner ----

export async function createCompetition(payload: CtfPayload): Promise<CtfCompetition> {
    return (await send(E.BASE, 'POST', payload)).data;
}

export async function updateCompetition(id: string, payload: CtfPayload): Promise<CtfCompetition> {
    return (await send(E.BY_REF(id), 'PUT', payload)).data;
}

export async function cancelCompetition(id: string): Promise<CtfCompetition> {
    return (await send(E.CANCEL(id), 'POST')).data;
}

export async function deleteCompetition(id: string): Promise<CtfDeleteResult> {
    return (await send(E.BY_REF(id), 'DELETE')).data;
}

export async function addChallenge(id: string, challengeId: string): Promise<CtfCompetition> {
    return (await send(E.SET(id), 'POST', { challengeId })).data;
}

export async function removeChallenge(id: string, challengeId: string): Promise<CtfCompetition> {
    return (await send(E.SET_ITEM(id, challengeId), 'DELETE')).data;
}

/** Replace and reorder the whole set */
export async function setChallenges(id: string, challenges: string[]): Promise<CtfCompetition> {
    return (await send(E.SET(id), 'PUT', { challenges })).data;
}

/** Active and draft challenges of the existing admin list, for the picker (`all` also returns archived ones: they are left out) */
export async function listPickerChallenges(params: { search?: string; page?: number; limit?: number } = {}): Promise<{ items: CtfPickerChallenge[]; hasMore: boolean }> {
    const body = await fetchApi(`${API_ENDPOINTS.CHALLENGES.BASE}${query({
        status: 'all', search: params.search && params.search.trim().length >= 2 ? params.search.trim() : undefined,
        page: params.page, limit: params.limit ?? 50, sortBy: 'title', sortOrder: 'asc',
    })}`);
    const rows: unknown[] = Array.isArray(body?.data) ? body.data : Array.isArray(body?.items) ? body.items : [];
    const items: CtfPickerChallenge[] = [];
    for (const row of rows) {
        const r = row as Partial<CtfPickerChallenge>;
        if (r && typeof r._id === 'string' && typeof r.title === 'string' && r.status !== 'archived') {
            items.push({ _id: r._id, title: r.title, category: String(r.category ?? ''), difficulty: String(r.difficulty ?? ''), basePoints: Number(r.basePoints) || 0, status: String(r.status ?? 'active') });
        }
    }
    return { items, hasMore: !!(body?.meta?.hasMore ?? body?.pagination?.hasMore) };
}
