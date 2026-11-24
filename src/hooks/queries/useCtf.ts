import { useEffect, useState } from 'react';
import {
    keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useNotificationSocket } from '@/context/NotificationProvider';
import { useDocumentVisible } from '@/hooks/useDocumentVisible';
import * as api from '@/lib/api/ctf';
import { ApiError } from '@/lib/api';
import { isStaleState } from '@/lib/ctf/errors';
import { refreshPublicCtf } from '@/lib/ctf/revalidate';
import { isPlayable } from '@/lib/ctf/status';
import type {
    CtfChallenge, CtfCompetition, CtfCompetitionCard, CtfDeleteResult, CtfLeaderboard, CtfListFilters, CtfMe, CtfPage, CtfPayload, CtfResults, CtfStatus,
    CtfSubmitResult, CtfTeam,
} from '@/types/ctf';

/**
 * One place for every CTF query key, so a change can invalidate by prefix. Anything that depends on
 * who is asking (the staff view of a competition, `solved` on the challenges, the board an admin
 * sees during a freeze, my page, my team) carries the user id, so one account never reads another's
 * cache after a switch.
 */
export const ctfKeys = {
    all: ['ctf'] as const,
    lists: () => ['ctf', 'list'] as const,
    list: (filters: CtfListFilters, userId: string | null = null) => ['ctf', 'list', filters, userId] as const,
    adminList: (params: object, userId: string | null = null) => ['ctf', 'list', 'admin', userId, params] as const,
    details: () => ['ctf', 'detail'] as const,
    detail: (slug: string, userId: string | null = null) => ['ctf', 'detail', slug, userId] as const,
    allChallenges: () => ['ctf', 'challenges'] as const,
    challenges: (slug: string, userId: string | null = null) => ['ctf', 'challenges', slug, userId] as const,
    allBoards: () => ['ctf', 'leaderboard'] as const,
    leaderboard: (slug: string, userId: string | null = null) => ['ctf', 'leaderboard', slug, userId] as const,
    allResults: () => ['ctf', 'results'] as const,
    results: (slug: string, userId: string | null = null) => ['ctf', 'results', slug, userId] as const,
    allMe: () => ['ctf', 'me'] as const,
    me: (slug: string, userId: string | null = null) => ['ctf', 'me', slug, userId] as const,
    allTeams: () => ['ctf', 'team'] as const,
    team: (slug: string, userId: string | null = null) => ['ctf', 'team', slug, userId] as const,
    picker: (search: string, userId: string | null = null) => ['ctf', 'picker', userId, search] as const,
};

export const CTF_PAGE_SIZE = 12;
const ADMIN_PAGE_SIZE = 20;

type Pages<T> = InfiniteData<CtfPage<T>, number>;
const nextPage = <T,>(last: CtfPage<T>) => (last.pagination.page < last.pagination.pages ? last.pagination.page + 1 : undefined);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The public list with "load more". `filters.page` is ignored: the pages are the query's own.
 * `initialPage` is the first page rendered on the server, for the plain tab only: it counts as
 * fresh for a visitor, and is only a placeholder for a signed-in member (staff see drafts).
 */
export function useCtfCompetitions(filters: CtfListFilters = {}, initialPage?: CtfPage<CtfCompetitionCard> | null, initialUpdatedAt?: number) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    const base: CtfListFilters = { limit: CTF_PAGE_SIZE, ...filters, page: undefined };
    const seed: Pages<CtfCompetitionCard> | undefined = initialPage ? { pages: [initialPage], pageParams: [1] } : undefined;
    return useInfiniteQuery({
        queryKey: ctfKeys.list(base, user?.id ?? null),
        queryFn: ({ pageParam }) => api.listCompetitions({ ...base, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: nextPage<CtfCompetitionCard>,
        enabled: !loading,
        staleTime: 60_000,
        initialData: !signedIn ? seed : undefined,
        initialDataUpdatedAt: initialUpdatedAt,
        placeholderData: (previous) => previous ?? (signedIn ? seed : undefined),
    });
}

/** Every competition for staff: drafts and private ones too. One page at a time. */
export function useAdminCtfList(params: { page?: number; status?: CtfListFilters['status'] } = {}, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: ctfKeys.adminList(params, user?.id ?? null),
        queryFn: () => api.listCompetitions({ status: params.status, page: params.page, limit: ADMIN_PAGE_SIZE }),
        enabled: enabled && !!user,
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });
}

/**
 * One competition. The copy rendered on the server is the public one, so it differs by who is looking:
 * - A visitor has the same answer, so it counts as fresh from the moment the page rendered.
 * - A signed-in member only gets it as `placeholderData`: staff get more (drafts, the challenge set
 *   details), so it is never taken for their own answer (`isPlaceholderData` tells them apart).
 */
export function useCtfCompetition(slug: string, serverCompetition?: CtfCompetition | null, initialUpdatedAt?: number) {
    const { user, loading } = useAuth();
    const signedIn = !!user;
    return useQuery({
        queryKey: ctfKeys.detail(slug, user?.id ?? null),
        queryFn: () => api.getCompetition(slug),
        enabled: !!slug && !loading,
        initialData: !signedIn ? (serverCompetition ?? undefined) : undefined,
        initialDataUpdatedAt: initialUpdatedAt,
        placeholderData: signedIn ? (serverCompetition ?? undefined) : undefined,
        staleTime: 30_000,
        retry: (count, err) => (err as { status?: number })?.status !== 404 && count < 2,
    });
}

/**
 * The challenges, asked with the token: `solved` is the viewer's own only when the request carries
 * it. Until the session is known nothing is asked, so a member never sees everything unsolved.
 */
export function useCtfChallenges(slug: string, enabled = true) {
    const { user, loading } = useAuth();
    return useQuery<CtfChallenge[]>({
        queryKey: ctfKeys.challenges(slug, user?.id ?? null),
        queryFn: () => api.getChallenges(slug),
        enabled: enabled && !!slug && !loading,
        staleTime: 15_000,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    });
}

/** How often the board is read again: never for a competition that is not running, slower while pushes arrive */
export function boardPollMs(status: CtfStatus | undefined, pushed: boolean): number | false {
    if (!status || !isPlayable(status)) return false;
    return pushed ? 60_000 : 20_000;
}

/**
 * The board of a competition. It polls while the competition runs and the tab is in front (a hidden
 * tab asks for nothing), and `useCtfLiveBoard` makes it read again the moment a solve is stored.
 */
export function useCtfLeaderboard(slug: string, options: { enabled?: boolean; status?: CtfStatus; pushed?: boolean } = {}) {
    const { user, loading } = useAuth();
    const visible = useDocumentVisible();
    const { enabled = true, status, pushed = false } = options;
    const every = boardPollMs(status, pushed);
    return useQuery<CtfLeaderboard>({
        queryKey: ctfKeys.leaderboard(slug, user?.id ?? null),
        queryFn: () => api.getLeaderboard(slug),
        enabled: enabled && !!slug && !loading,
        staleTime: 10_000,
        refetchInterval: visible ? every : false,
        placeholderData: keepPreviousData,
    });
}

/** The results of an ended competition. Staff may read them earlier. */
export function useCtfResults(slug: string, enabled = true, initial?: CtfResults | null, initialUpdatedAt?: number) {
    const { user, loading } = useAuth();
    return useQuery<CtfResults>({
        queryKey: ctfKeys.results(slug, user?.id ?? null),
        queryFn: () => api.getResults(slug),
        enabled: enabled && !!slug && !loading,
        initialData: !user ? (initial ?? undefined) : undefined,
        initialDataUpdatedAt: initialUpdatedAt,
        placeholderData: user ? (initial ?? undefined) : undefined,
        staleTime: 60_000,
        // 409 is "not ended yet" and 404 "no such competition": asking again changes nothing
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    });
}

/** My page: my team, my solves, my points and my rank. Only for a signed-in member. */
export function useCtfMe(slug: string, enabled = true) {
    const { user } = useAuth();
    return useQuery<CtfMe>({
        queryKey: ctfKeys.me(slug, user?.id ?? null),
        queryFn: () => api.getMe(slug),
        enabled: enabled && !!slug && !!user,
        staleTime: 15_000,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    });
}

/** My team, or null. `initial` is the team my page already carries: shown while this loads. */
export function useCtfTeam(slug: string, enabled = true, initial?: CtfTeam | null) {
    const { user } = useAuth();
    return useQuery<CtfTeam | null>({
        queryKey: ctfKeys.team(slug, user?.id ?? null),
        queryFn: () => api.getTeam(slug),
        enabled: enabled && !!slug && !!user,
        placeholderData: initial === undefined ? undefined : initial,
        staleTime: 15_000,
    });
}

/** Active challenges for the admin picker, searched on the server (two characters or more) */
export function useCtfPickerChallenges(search: string, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: ctfKeys.picker(search.trim().toLowerCase(), user?.id ?? null),
        queryFn: () => api.listPickerChallenges({ search }),
        enabled: enabled && !!user,
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });
}

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

interface BoardEvent { competition?: string; mode?: string; frozen?: boolean; at?: string }

const PUSH_THROTTLE_MS = 2000;

/**
 * Joins the competition's room on the socket the app already holds for notifications and makes the
 * board (and, in a dynamic competition, the points on the challenges) read again when a solve is
 * stored. The event carries no data. A visitor has no socket (the handshake needs a token), so the
 * board polls for them. Returns whether pushes are arriving, so polling can slow down.
 */
export function useCtfLiveBoard(slug: string, options: { enabled: boolean; dynamic?: boolean }): boolean {
    const { socket, connected } = useNotificationSocket();
    const qc = useQueryClient();
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const [joined, setJoined] = useState(false);
    const { enabled, dynamic = false } = options;
    const active = enabled && !!socket && connected && !!slug;

    useEffect(() => {
        if (!active || !socket) { setJoined(false); return; }
        let timer: ReturnType<typeof setTimeout> | null = null;
        let last = 0;
        let cancelled = false;

        const refresh = () => {
            void qc.invalidateQueries({ queryKey: ctfKeys.leaderboard(slug, userId) });
            if (dynamic) void qc.invalidateQueries({ queryKey: ctfKeys.challenges(slug, userId) });
        };
        const onUpdate = (event: BoardEvent) => {
            if (event?.competition && event.competition !== slug) return;
            // A burst of solves is one refetch
            const wait = Math.max(0, last + PUSH_THROTTLE_MS - Date.now());
            if (timer) return;
            timer = setTimeout(() => { timer = null; last = Date.now(); refresh(); }, wait);
        };

        socket.on('scoreboard:update', onUpdate);
        socket.emit('ctf:join', { slug }, (ack?: { ok?: boolean }) => { if (!cancelled) setJoined(!!ack?.ok); });
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            socket.off('scoreboard:update', onUpdate);
            socket.emit('ctf:leave', { slug });
            setJoined(false);
        };
    }, [active, socket, slug, userId, dynamic, qc]);

    return active && joined;
}

// ---------------------------------------------------------------------------
// Writes. The screens show their own errors, so these keep the caches right.
// ---------------------------------------------------------------------------

/** What changes for one competition and the member: the competition, my page, my team, the board and the challenges */
export function refreshCompetition(qc: QueryClient, slug: string) {
    void qc.invalidateQueries({ queryKey: [...ctfKeys.details(), slug] });
    void qc.invalidateQueries({ queryKey: [...ctfKeys.allMe(), slug] });
    void qc.invalidateQueries({ queryKey: [...ctfKeys.allTeams(), slug] });
    void qc.invalidateQueries({ queryKey: [...ctfKeys.allBoards(), slug] });
    void qc.invalidateQueries({ queryKey: [...ctfKeys.allChallenges(), slug] });
}

/** A team action moves the team, my page (it carries the team) and the board (team boards list the team) */
function refreshTeam(qc: QueryClient, slug: string) {
    void qc.invalidateQueries({ queryKey: [...ctfKeys.allTeams(), slug] });
    void qc.invalidateQueries({ queryKey: [...ctfKeys.allMe(), slug] });
    void qc.invalidateQueries({ queryKey: [...ctfKeys.allBoards(), slug] });
    // The seat count of the competition moved
    void qc.invalidateQueries({ queryKey: [...ctfKeys.details(), slug] });
    void qc.invalidateQueries({ queryKey: ctfKeys.lists() });
}

/** Registering changes my page and the number of players */
function refreshRegistration(qc: QueryClient, slug: string) {
    void qc.invalidateQueries({ queryKey: [...ctfKeys.allMe(), slug] });
    void qc.invalidateQueries({ queryKey: [...ctfKeys.details(), slug] });
    void qc.invalidateQueries({ queryKey: ctfKeys.lists() });
}

export function useRegisterCtf() {
    const qc = useQueryClient();
    return useMutation<{ registered: boolean }, unknown, { slug: string }>({
        mutationFn: (v) => api.register(v.slug),
        retry: 0,
        onSuccess: (_r, v) => refreshRegistration(qc, v.slug),
        onError: (err, v) => { if (isStaleState(err)) refreshCompetition(qc, v.slug); },
    });
}

export function useUnregisterCtf() {
    const qc = useQueryClient();
    return useMutation<{ registered: boolean }, unknown, { slug: string }>({
        mutationFn: (v) => api.unregister(v.slug),
        retry: 0,
        onSuccess: (_r, v) => refreshRegistration(qc, v.slug),
        onError: (err, v) => { if (isStaleState(err)) refreshCompetition(qc, v.slug); },
    });
}

export function useCreateCtfTeam() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation<CtfTeam, unknown, { slug: string; name: string }>({
        mutationFn: (v) => api.createTeam(v.slug, v.name),
        retry: 0,
        onSuccess: (team, v) => {
            qc.setQueryData(ctfKeys.team(v.slug, user?.id ?? null), team);
            refreshTeam(qc, v.slug);
        },
        onError: (err, v) => { if (isStaleState(err)) refreshTeam(qc, v.slug); },
    });
}

export function useJoinCtfTeam() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation<CtfTeam, unknown, { slug: string; inviteCode: string }>({
        mutationFn: (v) => api.joinTeam(v.slug, v.inviteCode),
        retry: 0,
        onSuccess: (team, v) => {
            qc.setQueryData(ctfKeys.team(v.slug, user?.id ?? null), team);
            refreshTeam(qc, v.slug);
        },
        onError: (err, v) => { if (isStaleState(err)) refreshTeam(qc, v.slug); },
    });
}

export function useLeaveCtfTeam() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation<{ disbanded: boolean }, unknown, { slug: string }>({
        mutationFn: (v) => api.leaveTeam(v.slug),
        retry: 0,
        onSuccess: (_r, v) => {
            qc.setQueryData(ctfKeys.team(v.slug, user?.id ?? null), null);
            refreshTeam(qc, v.slug);
        },
        onError: (err, v) => { if (isStaleState(err)) refreshTeam(qc, v.slug); },
    });
}

export function useKickCtfMember() {
    const qc = useQueryClient();
    return useMutation<void, unknown, { slug: string; memberId: string }>({
        mutationFn: (v) => api.kickMember(v.slug, v.memberId),
        retry: 0,
        onSuccess: (_r, v) => refreshTeam(qc, v.slug),
        onError: (err, v) => { if (isStaleState(err)) refreshTeam(qc, v.slug); },
    });
}

/** Show the solve on the cached challenge list at once; the refetch confirms it */
function markSolved(qc: QueryClient, slug: string, userId: string | null, challengeId: string) {
    qc.setQueryData<CtfChallenge[]>(ctfKeys.challenges(slug, userId), (old) => (
        old ? old.map((c) => (c._id === challengeId ? { ...c, solved: true, solveCount: c.solveCount + 1 } : c)) : old
    ));
}

/**
 * Send a flag. The flag lives in the call and nowhere else: the mutation is dropped from the cache
 * as soon as nothing observes it (`gcTime: 0`), and the screen calls `reset()` once it has the
 * verdict. A wrong flag changes nothing but the counters the screen reads from the answer; a right
 * one moves everything the solve touches: the challenges, the board, my page and the competition.
 */
export function useSubmitCtfFlag() {
    const qc = useQueryClient();
    const { user, refreshUser } = useAuth();
    const userId = user?.id ?? null;
    return useMutation<CtfSubmitResult, unknown, { slug: string; challengeId: string; flag: string }>({
        mutationFn: (v) => api.submitFlag(v.slug, v.challengeId, v.flag),
        retry: 0,
        gcTime: 0,
        onSuccess: (result, v) => {
            if (!result.correct) return;
            markSolved(qc, v.slug, userId, v.challengeId);
            refreshCompetition(qc, v.slug);
            if (result.accountPointsAwarded) {
                // Account points feed the global board, the badges and the streak
                void qc.invalidateQueries({ queryKey: ['leaderboard'] });
                void qc.invalidateQueries({ queryKey: ['badges'] });
                void qc.invalidateQueries({ queryKey: ['streak'] });
                void refreshUser?.();
            }
        },
        onError: (err, v) => { if (isStaleState(err)) refreshCompetition(qc, v.slug); },
    });
}

// ---- Admin and owner ----

/** A saved competition changes what every cache shows, here and on the app server */
const afterAdminWrite = (qc: QueryClient) => {
    void qc.invalidateQueries({ queryKey: ctfKeys.all });
    void refreshPublicCtf();
};

export function useCreateCtf() {
    const qc = useQueryClient();
    return useMutation<CtfCompetition, unknown, CtfPayload>({
        mutationFn: (payload) => api.createCompetition(payload),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
    });
}

export function useUpdateCtf() {
    const qc = useQueryClient();
    return useMutation<CtfCompetition, unknown, { id: string; payload: CtfPayload }>({
        mutationFn: (v) => api.updateCompetition(v.id, v.payload),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
        // Teams or solves appeared meanwhile: show the truth
        onError: (err) => { if (err instanceof ApiError && (err.code === 'CTF_LOCKED' || err.code === 'CTF_CHALLENGE_HAS_SOLVES')) void qc.invalidateQueries({ queryKey: ctfKeys.details() }); },
    });
}

export function useCancelCtf() {
    const qc = useQueryClient();
    return useMutation<CtfCompetition, unknown, { id: string }>({
        mutationFn: (v) => api.cancelCompetition(v.id),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
    });
}

export function useDeleteCtf() {
    const qc = useQueryClient();
    return useMutation<CtfDeleteResult, unknown, { id: string }>({
        mutationFn: (v) => api.deleteCompetition(v.id),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
    });
}

export function useAddCtfChallenge() {
    const qc = useQueryClient();
    return useMutation<CtfCompetition, unknown, { id: string; challengeId: string }>({
        mutationFn: (v) => api.addChallenge(v.id, v.challengeId),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
    });
}

export function useRemoveCtfChallenge() {
    const qc = useQueryClient();
    return useMutation<CtfCompetition, unknown, { id: string; challengeId: string }>({
        mutationFn: (v) => api.removeChallenge(v.id, v.challengeId),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
        onError: (err) => { if (err instanceof ApiError && err.code === 'CTF_CHALLENGE_HAS_SOLVES') void qc.invalidateQueries({ queryKey: ctfKeys.details() }); },
    });
}

/** Replace and reorder the whole set */
export function useSetCtfChallenges() {
    const qc = useQueryClient();
    return useMutation<CtfCompetition, unknown, { id: string; challenges: string[] }>({
        mutationFn: (v) => api.setChallenges(v.id, v.challenges),
        retry: 0,
        onSuccess: () => afterAdminWrite(qc),
    });
}
