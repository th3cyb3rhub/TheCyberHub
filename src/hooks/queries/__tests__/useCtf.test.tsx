import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { ctfErrorMessage } from '@/lib/ctf/errors'
import { makeChallenge, makeCompetition, makeTeam, SLUG } from '@/lib/ctf/__tests__/fixtures'

const auth = vi.hoisted(() => ({
    current: { user: { id: 'u1', role: 'user' } as { id: string; role: string } | null, loading: false, refreshUser: vi.fn() },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const socketCtx = vi.hoisted(() => ({ current: { socket: null as unknown, connected: false } }))
vi.mock('@/context/NotificationProvider', () => ({ useNotificationSocket: () => socketCtx.current }))
const visible = vi.hoisted(() => ({ current: true }))
vi.mock('@/hooks/useDocumentVisible', () => ({ useDocumentVisible: () => visible.current }))
const api = vi.hoisted(() => ({
    listCompetitions: vi.fn(), getCompetition: vi.fn(), getChallenges: vi.fn(), getLeaderboard: vi.fn(), getResults: vi.fn(), getMe: vi.fn(),
    register: vi.fn(), unregister: vi.fn(), getTeam: vi.fn(), createTeam: vi.fn(), joinTeam: vi.fn(), leaveTeam: vi.fn(), kickMember: vi.fn(),
    submitFlag: vi.fn(), createCompetition: vi.fn(), updateCompetition: vi.fn(), cancelCompetition: vi.fn(), deleteCompetition: vi.fn(),
    addChallenge: vi.fn(), removeChallenge: vi.fn(), setChallenges: vi.fn(), listPickerChallenges: vi.fn(),
}))
vi.mock('@/lib/api/ctf', () => api)
const revalidate = vi.hoisted(() => ({ refreshPublicCtf: vi.fn() }))
vi.mock('@/lib/ctf/revalidate', () => revalidate)

import {
    boardPollMs, ctfKeys, useCreateCtf, useCreateCtfTeam, useCtfChallenges, useCtfCompetition, useCtfCompetitions, useCtfLeaderboard, useCtfLiveBoard,
    useJoinCtfTeam, useKickCtfMember, useLeaveCtfTeam, useRegisterCtf, useRemoveCtfChallenge, useSubmitCtfFlag, useUpdateCtf, useDeleteCtf,
} from '../useCtf'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const page = (data: unknown[], pages = 1, p = 1) => ({ success: true, data, pagination: { page: p, limit: 12, total: data.length, pages } })

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
    socketCtx.current = { socket: null, connected: false }
    visible.current = true
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('query keys', () => {
    it('put the user in everything that depends on who is asking', () => {
        expect(ctfKeys.challenges(SLUG, 'u1')).not.toEqual(ctfKeys.challenges(SLUG, 'u2'))
        expect(ctfKeys.challenges(SLUG, null)).toEqual(['ctf', 'challenges', SLUG, null])
        expect(ctfKeys.detail(SLUG, 'a')).not.toEqual(ctfKeys.detail(SLUG, 'b'))
        expect(ctfKeys.me(SLUG, 'a')).not.toEqual(ctfKeys.me(SLUG, 'b'))
        expect(ctfKeys.team(SLUG, 'a')).not.toEqual(ctfKeys.team(SLUG, 'b'))
        expect(ctfKeys.leaderboard(SLUG, 'a')).not.toEqual(ctfKeys.leaderboard(SLUG, 'b'))
        expect(ctfKeys.list({ status: 'live' }, 'a')).not.toEqual(ctfKeys.list({ status: 'live' }, null))
        expect(ctfKeys.adminList({}, 'a')).not.toEqual(ctfKeys.adminList({}, 'b'))
    })

    it('share a prefix per competition so one invalidation reaches every viewer', () => {
        expect(ctfKeys.challenges(SLUG, 'u1').slice(0, 3)).toEqual([...ctfKeys.allChallenges(), SLUG])
        expect(ctfKeys.leaderboard(SLUG, 'u1').slice(0, 3)).toEqual([...ctfKeys.allBoards(), SLUG])
        expect(ctfKeys.me(SLUG, 'u1').slice(0, 3)).toEqual([...ctfKeys.allMe(), SLUG])
        expect(ctfKeys.team(SLUG, 'u1').slice(0, 3)).toEqual([...ctfKeys.allTeams(), SLUG])
        expect(ctfKeys.detail(SLUG, 'u1').slice(0, 3)).toEqual([...ctfKeys.details(), SLUG])
    })
})

describe('reads', () => {
    it('asks for the challenges under the signed-in user (the API call itself carries the token)', async () => {
        api.getChallenges.mockResolvedValueOnce([makeChallenge({ solved: true })])
        const { result } = renderHook(() => useCtfChallenges(SLUG), { wrapper })
        await waitFor(() => expect(result.current.data).toHaveLength(1))
        expect(api.getChallenges).toHaveBeenCalledWith(SLUG)
        expect(result.current.data?.[0].solved).toBe(true)
        expect(qc.getQueryData(ctfKeys.challenges(SLUG, 'u1'))).toBeDefined()
        expect(qc.getQueryData(ctfKeys.challenges(SLUG, null))).toBeUndefined()
    })

    it('waits for the session, so a member never sees every challenge unsolved first', async () => {
        auth.current = { user: null, loading: true, refreshUser: vi.fn() }
        renderHook(() => useCtfChallenges(SLUG), { wrapper })
        await new Promise((r) => setTimeout(r, 20))
        expect(api.getChallenges).not.toHaveBeenCalled()
    })

    it('does not ask while disabled (a competition that has not started)', async () => {
        renderHook(() => useCtfChallenges(SLUG, false), { wrapper })
        await new Promise((r) => setTimeout(r, 20))
        expect(api.getChallenges).not.toHaveBeenCalled()
    })

    it('treats the server copy as fresh for a visitor and as a placeholder for a member', async () => {
        const server = makeCompetition({ title: 'From the server' })
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        const visitor = renderHook(() => useCtfCompetition(SLUG, server, Date.now()), { wrapper })
        expect(visitor.result.current.data?.title).toBe('From the server')
        await new Promise((r) => setTimeout(r, 20))
        expect(api.getCompetition).not.toHaveBeenCalled()

        qc.clear()
        auth.current = { user: { id: 'u1', role: 'admin' }, loading: false, refreshUser: vi.fn() }
        api.getCompetition.mockResolvedValueOnce(makeCompetition({ title: 'Staff view' }))
        const member = renderHook(() => useCtfCompetition(SLUG, server, Date.now()), { wrapper })
        expect(member.result.current.isPlaceholderData).toBe(true)
        await waitFor(() => expect(member.result.current.data?.title).toBe('Staff view'))
        expect(member.result.current.isPlaceholderData).toBe(false)
    })

    it('loads the list under the user and pages by the API page count', async () => {
        api.listCompetitions.mockResolvedValueOnce(page([makeCompetition()], 2, 1)).mockResolvedValueOnce(page([makeCompetition({ _id: 'c2', slug: 'b' })], 2, 2))
        const { result } = renderHook(() => useCtfCompetitions({ status: 'live' }), { wrapper })
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
        expect(api.listCompetitions).toHaveBeenCalledWith({ limit: 12, status: 'live', page: 1 })
        expect(result.current.hasNextPage).toBe(true)
        await act(async () => { await result.current.fetchNextPage() })
        expect(api.listCompetitions).toHaveBeenLastCalledWith({ limit: 12, status: 'live', page: 2 })
        await waitFor(() => expect(result.current.hasNextPage).toBe(false))
    })
})

describe('board polling', () => {
    it('polls only while the competition runs, slower when pushes arrive', () => {
        expect(boardPollMs('live', false)).toBe(20_000)
        expect(boardPollMs('frozen', false)).toBe(20_000)
        expect(boardPollMs('live', true)).toBe(60_000)
        for (const s of ['draft', 'upcoming', 'ended', 'cancelled'] as const) expect(boardPollMs(s, false)).toBe(false)
        expect(boardPollMs(undefined, false)).toBe(false)
    })

    it('reads the board under the signed-in user', async () => {
        api.getLeaderboard.mockResolvedValueOnce({ data: [], mode: 'solo', frozen: false, frozenAt: null, status: 'live', updatedAt: '' })
        const { result } = renderHook(() => useCtfLeaderboard(SLUG, { status: 'live' }), { wrapper })
        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(qc.getQueryData(ctfKeys.leaderboard(SLUG, 'u1'))).toBeDefined()
    })
})

describe('live board', () => {
    const fakeSocket = () => {
        const handlers: Record<string, (e: unknown) => void> = {}
        return {
            handlers,
            on: vi.fn((name: string, fn: (e: unknown) => void) => { handlers[name] = fn }),
            off: vi.fn(),
            emit: vi.fn((name: string, _payload: unknown, ack?: (a: { ok: boolean }) => void) => { if (name === 'ctf:join') ack?.({ ok: true }) }),
        }
    }

    it('joins the room, refetches the board on an update for this competition and leaves on unmount', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        const socket = fakeSocket()
        socketCtx.current = { socket, connected: true }
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result, unmount } = renderHook(() => useCtfLiveBoard(SLUG, { enabled: true }), { wrapper })
        expect(socket.emit).toHaveBeenCalledWith('ctf:join', { slug: SLUG }, expect.any(Function))
        await waitFor(() => expect(result.current).toBe(true))

        // Another competition's event is ignored
        socket.handlers['scoreboard:update']({ competition: 'other', mode: 'solo', frozen: false })
        await act(async () => { vi.advanceTimersByTime(2500) })
        expect(spy).not.toHaveBeenCalled()

        socket.handlers['scoreboard:update']({ competition: SLUG, mode: 'solo', frozen: false })
        socket.handlers['scoreboard:update']({ competition: SLUG, mode: 'solo', frozen: false })
        await act(async () => { vi.advanceTimersByTime(2500) })
        // A burst is one refetch, and a static competition leaves the challenges alone
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith({ queryKey: ctfKeys.leaderboard(SLUG, 'u1') })

        unmount()
        expect(socket.emit).toHaveBeenCalledWith('ctf:leave', { slug: SLUG })
        expect(socket.off).toHaveBeenCalledWith('scoreboard:update', expect.any(Function))
        vi.useRealTimers()
    })

    it('does nothing for a visitor without a socket', () => {
        const { result } = renderHook(() => useCtfLiveBoard(SLUG, { enabled: true }), { wrapper })
        expect(result.current).toBe(false)
    })
})

describe('submitting a flag', () => {
    const right = { correct: true, message: 'Correct flag!', pointsEarned: 90, firstBlood: false, scope: 'user', teamId: null, accountPointsAwarded: true, newBadges: [] }

    it('invalidates challenges, board, my page and the competition after a right flag, and ticks the challenge at once', async () => {
        api.submitFlag.mockResolvedValueOnce(right)
        qc.setQueryData(ctfKeys.challenges(SLUG, 'u1'), [makeChallenge({ _id: 'ch1' }), makeChallenge({ _id: 'ch2' })])
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useSubmitCtfFlag(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, challengeId: 'ch1', flag: 'flag{x}' }) })
        expect(api.submitFlag).toHaveBeenCalledWith(SLUG, 'ch1', 'flag{x}')
        const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey))
        for (const prefix of [ctfKeys.allChallenges(), ctfKeys.allBoards(), ctfKeys.allMe(), ctfKeys.details()]) {
            expect(keys).toContain(JSON.stringify([...prefix, SLUG]))
        }
        // Account points were paid: the global board, badges and the user are refreshed too
        expect(keys).toContain(JSON.stringify(['leaderboard']))
        expect(auth.current.refreshUser).toHaveBeenCalled()
        const list = qc.getQueryData<{ _id: string; solved: boolean; solveCount: number }[]>(ctfKeys.challenges(SLUG, 'u1'))
        expect(list?.find((c) => c._id === 'ch1')?.solved).toBe(true)
        expect(list?.find((c) => c._id === 'ch2')?.solved).toBe(false)
    })

    it('invalidates nothing after a wrong flag', async () => {
        api.submitFlag.mockResolvedValueOnce({ correct: false, message: 'Incorrect flag', attemptsRecent: 1, attemptLimit: 10, windowSeconds: 60 })
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useSubmitCtfFlag(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, challengeId: 'ch1', flag: 'nope' }) })
        expect(spy).not.toHaveBeenCalled()
    })

    it('shows the truth again when the API says the challenge was already solved', async () => {
        api.submitFlag.mockRejectedValueOnce(new ApiError('x', 409, 'CTF_ALREADY_SOLVED'))
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useSubmitCtfFlag(), { wrapper })
        let caught: unknown
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, challengeId: 'ch1', flag: 'x' }).catch((e) => { caught = e }) })
        expect(spy).toHaveBeenCalled()
        expect(ctfErrorMessage(caught)).toContain('already solved')
    })

    it('never keeps the flag: the call is dropped from the mutation cache once nothing observes it', async () => {
        api.submitFlag.mockResolvedValueOnce(right)
        const { result, unmount } = renderHook(() => useSubmitCtfFlag(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, challengeId: 'ch1', flag: 'flag{topsecret}' }) })
        act(() => result.current.reset())
        unmount()
        await new Promise((r) => setTimeout(r, 10))
        expect(JSON.stringify(qc.getMutationCache().getAll().map((m) => m.state.variables))).not.toContain('topsecret')
        expect(qc.getMutationCache().getAll()).toHaveLength(0)
    })
})

describe('team and registration', () => {
    it('refresh the team, my page and the board after a team action, and store the new team', async () => {
        api.createTeam.mockResolvedValueOnce(makeTeam())
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useCreateCtfTeam(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, name: 'Red Pandas' }) })
        expect(qc.getQueryData(ctfKeys.team(SLUG, 'u1'))).toMatchObject({ name: 'Red Pandas' })
        const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey))
        for (const prefix of [ctfKeys.allTeams(), ctfKeys.allMe(), ctfKeys.allBoards()]) expect(keys).toContain(JSON.stringify([...prefix, SLUG]))
    })

    it('empties the cached team on leave and refreshes after a kick, a join and a registration', async () => {
        qc.setQueryData(ctfKeys.team(SLUG, 'u1'), makeTeam())
        api.leaveTeam.mockResolvedValueOnce({ disbanded: false })
        const leave = renderHook(() => useLeaveCtfTeam(), { wrapper })
        await act(async () => { await leave.result.current.mutateAsync({ slug: SLUG }) })
        expect(qc.getQueryData(ctfKeys.team(SLUG, 'u1'))).toBeNull()

        const spy = vi.spyOn(qc, 'invalidateQueries')
        api.kickMember.mockResolvedValueOnce(undefined)
        const kick = renderHook(() => useKickCtfMember(), { wrapper })
        await act(async () => { await kick.result.current.mutateAsync({ slug: SLUG, memberId: 'u2' }) })
        expect(api.kickMember).toHaveBeenCalledWith(SLUG, 'u2')

        api.joinTeam.mockResolvedValueOnce(makeTeam())
        const join = renderHook(() => useJoinCtfTeam(), { wrapper })
        await act(async () => { await join.result.current.mutateAsync({ slug: SLUG, inviteCode: 'ABCD' }) })
        expect(api.joinTeam).toHaveBeenCalledWith(SLUG, 'ABCD')

        api.register.mockResolvedValueOnce({ registered: true })
        const reg = renderHook(() => useRegisterCtf(), { wrapper })
        await act(async () => { await reg.result.current.mutateAsync({ slug: SLUG }) })
        expect(spy.mock.calls.length).toBeGreaterThan(5)
    })

    it('maps a failed team call to words and shows the truth again for a stale state', async () => {
        api.joinTeam.mockRejectedValueOnce(new ApiError('x', 409, 'CTF_TEAM_FULL'))
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useJoinCtfTeam(), { wrapper })
        let caught: unknown
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, inviteCode: 'ABCD' }).catch((e) => { caught = e }) })
        expect(ctfErrorMessage(caught)).toBe('This team is full.')
        expect(spy).toHaveBeenCalled()
    })
})

describe('admin writes', () => {
    it('purge every cache and the public pages after a save', async () => {
        api.createCompetition.mockResolvedValueOnce(makeCompetition())
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useCreateCtf(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ title: 'x' }) })
        expect(spy).toHaveBeenCalledWith({ queryKey: ctfKeys.all })
        expect(revalidate.refreshPublicCtf).toHaveBeenCalledTimes(1)
    })

    it('purge after an update, a delete and a removal, and refetch when the API says the set is locked', async () => {
        api.updateCompetition.mockResolvedValueOnce(makeCompetition())
        api.deleteCompetition.mockResolvedValueOnce({ deleted: false, cancelled: true, status: 'cancelled' })
        const upd = renderHook(() => useUpdateCtf(), { wrapper })
        await act(async () => { await upd.result.current.mutateAsync({ id: 'c1', payload: { title: 'y' } }) })
        const del = renderHook(() => useDeleteCtf(), { wrapper })
        await act(async () => { await del.result.current.mutateAsync({ id: 'c1' }) })
        expect(revalidate.refreshPublicCtf).toHaveBeenCalledTimes(2)

        const spy = vi.spyOn(qc, 'invalidateQueries')
        api.removeChallenge.mockRejectedValueOnce(new ApiError('x', 409, 'CTF_CHALLENGE_HAS_SOLVES', undefined, { challenges: ['ch1'] }))
        const rem = renderHook(() => useRemoveCtfChallenge(), { wrapper })
        await act(async () => { await rem.result.current.mutateAsync({ id: 'c1', challengeId: 'ch1' }).catch(() => undefined) })
        expect(spy).toHaveBeenCalledWith({ queryKey: ctfKeys.details() })
        expect(revalidate.refreshPublicCtf).toHaveBeenCalledTimes(2)
    })
})
