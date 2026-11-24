import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { labErrorMessage } from '@/lib/labs/errors'
import { SLUG, makeCard, makeLab, makeViewer } from '@/lib/labs/__tests__/fixtures'
import type { LabDetail, Page } from '@/types/lab'

const auth = vi.hoisted(() => ({
    current: { user: { id: 'u1', role: 'user' } as { id: string; role: string } | null, loading: false, refreshUser: vi.fn() },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const api = vi.hoisted(() => ({
    listLabs: vi.fn(), getFacets: vi.fn(), getLab: vi.fn(), getLabProgress: vi.fn(), listMyProgress: vi.fn(), getStats: vi.fn(),
    startLab: vi.fn(), submitFlag: vi.fn(), unlockHint: vi.fn(), stopLab: vi.fn(), globalLeaderboard: vi.fn(), labLeaderboard: vi.fn(),
    listManagedLabs: vi.fn(), createLab: vi.fn(), updateLab: vi.fn(), deleteLab: vi.fn(),
}))
vi.mock('@/lib/api/labs', () => api)
const revalidate = vi.hoisted(() => ({ refreshPublicLabs: vi.fn() }))
vi.mock('@/lib/labs/revalidate', () => revalidate)

import {
    labKeys, useCreateLab, useDeleteLab, useLab, useLabs, useStartLab, useStopLab, useSubmitFlag, useUnlockHint, useUpdateLab,
} from '../useLabs'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const page = (data: unknown[], hasMore = false, total: number | null = data.length): Page<ReturnType<typeof makeCard>> =>
    ({ success: true, count: data.length, data: data as never, pagination: { page: 1, limit: 12, total, totalPages: 1, hasMore } })

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('query keys', () => {
    it('put the user in everything that depends on who is asking', () => {
        expect(labKeys.detail(SLUG, 'u1')).not.toEqual(labKeys.detail(SLUG, 'u2'))
        expect(labKeys.detail(SLUG, null)).toEqual(['labs', 'detail', SLUG, null])
        expect(labKeys.list({ category: 'osint' }, 'u1')).not.toEqual(labKeys.list({ category: 'osint' }, null))
        expect(labKeys.stats('a')).not.toEqual(labKeys.stats('b'))
        expect(labKeys.myProgress({}, 'a')).not.toEqual(labKeys.myProgress({}, 'b'))
        expect(labKeys.labProgress(SLUG, 'a')).not.toEqual(labKeys.labProgress(SLUG, 'b'))
        expect(labKeys.adminList({}, 'a')).not.toEqual(labKeys.adminList({}, 'b'))
    })

    it('keep the boards public: no user in them', () => {
        expect(labKeys.globalBoard({ category: 'osint', limit: 10 })).toEqual(['labs', 'leaderboard', 'global', 'osint', 10])
        expect(labKeys.labBoard(SLUG, 5)).toEqual(['labs', 'leaderboard', 'lab', SLUG, 5])
    })

    it('share a prefix so one invalidation reaches every viewer of a lab', () => {
        expect(labKeys.detail(SLUG, 'u1').slice(0, 3)).toEqual([...labKeys.details(), SLUG])
        expect(labKeys.labProgress(SLUG, 'u1').slice(0, 2)).toEqual(labKeys.progress())
        expect(labKeys.globalBoard().slice(0, 2)).toEqual(labKeys.boards())
    })
})

describe('reads', () => {
    it('loads the list under the signed-in user and pages with load more', async () => {
        api.listLabs.mockResolvedValueOnce(page([makeCard()], true, 2)).mockResolvedValueOnce({ ...page([makeCard({ slug: 'b-lab', _id: 'l2' })]), pagination: { page: 2, limit: 12, total: null, totalPages: null, hasMore: false } })
        const { result } = renderHook(() => useLabs({ category: 'web-security' }), { wrapper })
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
        expect(api.listLabs).toHaveBeenCalledWith({ limit: 12, category: 'web-security', page: 1 })
        expect(result.current.hasNextPage).toBe(true)
        await act(async () => { await result.current.fetchNextPage() })
        expect(api.listLabs).toHaveBeenLastCalledWith({ limit: 12, category: 'web-security', page: 2 })
        // Total is only on page 1: the second page says null and the list still ends by hasMore
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
        expect(result.current.data?.pages[1].pagination.total).toBeNull()
        await waitFor(() => expect(result.current.hasNextPage).toBe(false))
        expect(qc.getQueryData(labKeys.list({ limit: 12, category: 'web-security', page: undefined }, 'u1'))).toBeDefined()
    })

    it('waits for the session before it asks for the list', async () => {
        auth.current = { user: null, loading: true, refreshUser: vi.fn() }
        renderHook(() => useLabs(), { wrapper })
        await new Promise((r) => setTimeout(r, 20))
        expect(api.listLabs).not.toHaveBeenCalled()
    })

    it('treats the server list as fresh for a visitor and only as a placeholder for a member', async () => {
        const server = page([makeCard()])
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        const visitor = renderHook(() => useLabs({}, server), { wrapper })
        expect(visitor.result.current.data?.pages[0]).toBe(server)
        expect(visitor.result.current.isPlaceholderData).toBe(false)
        await new Promise((r) => setTimeout(r, 20))
        expect(api.listLabs).not.toHaveBeenCalled()

        qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.listLabs.mockResolvedValue(page([makeCard({ myStatus: 'completed' })]))
        const member = renderHook(() => useLabs({}, server), { wrapper })
        expect(member.result.current.isPlaceholderData).toBe(true)
        await waitFor(() => expect(member.result.current.isPlaceholderData).toBe(false))
        expect(member.result.current.data?.pages[0].data[0].myStatus).toBe('completed')
    })

    it('uses the server lab for a visitor without a request, and asks again for a member', async () => {
        const server = makeLab({ viewer: null })
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        const visitor = renderHook(() => useLab(SLUG, server), { wrapper })
        expect(visitor.result.current.data).toBe(server)
        await new Promise((r) => setTimeout(r, 20))
        expect(api.getLab).not.toHaveBeenCalled()

        qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.getLab.mockResolvedValue(makeLab({ viewer: makeViewer({ myStatus: 'in-progress' }) }))
        const member = renderHook(() => useLab(SLUG, server), { wrapper })
        expect(member.result.current.isPlaceholderData).toBe(true)
        await waitFor(() => expect(member.result.current.data?.viewer?.myStatus).toBe('in-progress'))
        expect(qc.getQueryData(labKeys.detail(SLUG, 'u1'))).toBeDefined()
        expect(qc.getQueryData(labKeys.detail(SLUG, null))).toBeUndefined()
    })
})

const seedDetail = (lab: LabDetail = makeLab()) => qc.setQueryData(labKeys.detail(SLUG, 'u1'), lab)
const spyInvalidate = () => vi.spyOn(qc, 'invalidateQueries')
const invalidated = (spy: ReturnType<typeof spyInvalidate>) => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey))

describe('start', () => {
    it('shows "in progress" at once and refreshes the list, the lab, progress and stats', async () => {
        seedDetail()
        qc.setQueryData(labKeys.list({}, 'u1'), { pages: [page([makeCard()])], pageParams: [1] })
        api.startLab.mockResolvedValue({ _id: 'p1', status: 'started', startedAt: '2026-02-01T00:00:00.000Z' })
        const spy = spyInvalidate()
        const { result } = renderHook(() => useStartLab(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG }) })
        const lab = qc.getQueryData<LabDetail>(labKeys.detail(SLUG, 'u1'))
        expect(lab?.viewer?.myStatus).toBe('in-progress')
        expect(lab?.viewer?.startedAt).toBe('2026-02-01T00:00:00.000Z')
        const cards = qc.getQueryData<{ pages: Page<ReturnType<typeof makeCard>>[] }>(labKeys.list({}, 'u1'))
        expect(cards?.pages[0].data[0].myStatus).toBe('in-progress')
        const keys = invalidated(spy)
        expect(keys).toContain(JSON.stringify(labKeys.lists()))
        expect(keys).toContain(JSON.stringify([...labKeys.details(), SLUG]))
        expect(keys).toContain(JSON.stringify(labKeys.progress()))
        expect(keys).toContain(JSON.stringify(['labs', 'stats']))
    })

    it('shows the truth again when the lab was already started', async () => {
        api.startLab.mockRejectedValue(new ApiError('x', 409, 'LAB_ALREADY_STARTED'))
        const spy = spyInvalidate()
        const { result } = renderHook(() => useStartLab(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG }).catch(() => undefined) })
        expect(invalidated(spy)).toContain(JSON.stringify([...labKeys.details(), SLUG]))
    })
})

describe('submit', () => {
    it('keeps the member on the lab after a wrong flag and records the attempts and the lock', async () => {
        seedDetail(makeLab({ viewer: makeViewer({ myStatus: 'in-progress' }) }))
        api.submitFlag.mockResolvedValue({ correct: false, attempts: 5, status: 'started', pointsEarned: 0, attemptsLeft: 0, lockedUntil: '2030-01-01T00:15:00.000Z' })
        const spy = spyInvalidate()
        const { result } = renderHook(() => useSubmitFlag(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, flag: 'wrong' }) })
        const viewer = qc.getQueryData<LabDetail>(labKeys.detail(SLUG, 'u1'))?.viewer
        expect(viewer).toMatchObject({ myStatus: 'in-progress', attempts: 5, lockedUntil: '2030-01-01T00:15:00.000Z' })
        expect(auth.current.refreshUser).not.toHaveBeenCalled()
        expect(invalidated(spy)).not.toContain(JSON.stringify(labKeys.boards()))
    })

    it('moves everything a completion touches after a right flag', async () => {
        seedDetail(makeLab({ viewer: makeViewer({ myStatus: 'in-progress', pointsAvailable: 40 }) }))
        api.submitFlag.mockResolvedValue({ correct: true, attempts: 2, status: 'completed', pointsEarned: 40, completedAt: '2026-02-01T00:00:00.000Z', newBadges: [] })
        const spy = spyInvalidate()
        const { result } = renderHook(() => useSubmitFlag(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, flag: 'flag{x}' }) })
        const viewer = qc.getQueryData<LabDetail>(labKeys.detail(SLUG, 'u1'))?.viewer
        expect(viewer).toMatchObject({ myStatus: 'completed', pointsAwarded: 40, pointsAvailable: 40, lockedUntil: null })
        const keys = invalidated(spy)
        for (const k of [labKeys.lists(), labKeys.progress(), ['labs', 'stats'], labKeys.boards(), ['leaderboard'], ['badges'], ['streak']]) expect(keys).toContain(JSON.stringify(k))
        expect(auth.current.refreshUser).toHaveBeenCalled()
    })

    it('records the lock from a 429 using the wait the API names, not the browser clock', async () => {
        seedDetail(makeLab({ viewer: makeViewer({ myStatus: 'in-progress' }) }))
        api.submitFlag.mockRejectedValue(new ApiError('locked', 429, 'LAB_LOCKED', undefined, { retryAfter: 600, lockedUntil: '1999-01-01T00:00:00.000Z' }))
        const before = Date.now()
        const { result } = renderHook(() => useSubmitFlag(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, flag: 'x' }).catch(() => undefined) })
        const until = qc.getQueryData<LabDetail>(labKeys.detail(SLUG, 'u1'))?.viewer?.lockEndsAt ?? NaN
        expect(until).toBeGreaterThanOrEqual(before + 599_000)
        expect(until).toBeLessThanOrEqual(Date.now() + 601_000)
    })

    it('does not keep the flag in the mutation cache', async () => {
        api.submitFlag.mockResolvedValue({ correct: false, attempts: 1, status: 'started', pointsEarned: 0, attemptsLeft: 4, lockedUntil: null })
        const { result, unmount } = renderHook(() => useSubmitFlag(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, flag: 'flag{secret}' }) })
        act(() => result.current.reset())
        unmount()
        await waitFor(() => expect(qc.getMutationCache().getAll().some((m) => JSON.stringify(m.state.variables ?? '').includes('secret'))).toBe(false))
    })

    it('refreshes the lab when it was already completed', async () => {
        api.submitFlag.mockRejectedValue(new ApiError('done', 409, 'LAB_ALREADY_COMPLETED'))
        const spy = spyInvalidate()
        const { result } = renderHook(() => useSubmitFlag(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, flag: 'x' }).catch(() => undefined) })
        expect(invalidated(spy)).toContain(JSON.stringify([...labKeys.details(), SLUG]))
    })
})

describe('hints', () => {
    it('shows the text and the new points at once', async () => {
        seedDetail(makeLab({ viewer: makeViewer({ myStatus: 'in-progress', pointsAvailable: 50 }) }))
        api.unlockHint.mockResolvedValue({ hint: { index: 1, text: 'Try a quote.', penalty: 20 }, alreadyUnlocked: false, hintsUsed: 1, pointsPenalty: 20, pointsAvailable: 30 })
        const { result } = renderHook(() => useUnlockHint(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG, hintIndex: 1 }) })
        const lab = qc.getQueryData<LabDetail>(labKeys.detail(SLUG, 'u1'))
        expect(lab?.hints[1]).toMatchObject({ unlocked: true, text: 'Try a quote.' })
        expect(lab?.hints[0].unlocked).toBe(false)
        expect(lab?.viewer).toMatchObject({ hintsUsed: 1, pointsAvailable: 30 })
    })
})

describe('stop', () => {
    it('goes back to "not started" only when the server removed the row', async () => {
        seedDetail(makeLab({ viewer: makeViewer({ myStatus: 'in-progress', startedAt: 'x' }) }))
        api.stopLab.mockResolvedValue({ reset: false, status: 'started' })
        const { result } = renderHook(() => useStopLab(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG }) })
        expect(qc.getQueryData<LabDetail>(labKeys.detail(SLUG, 'u1'))?.viewer?.myStatus).toBe('in-progress')
        api.stopLab.mockResolvedValue({ reset: true, status: 'not-started' })
        await act(async () => { await result.current.mutateAsync({ slug: SLUG }) })
        expect(qc.getQueryData<LabDetail>(labKeys.detail(SLUG, 'u1'))?.viewer?.myStatus).toBe('not-started')
    })
})

describe('admin writes', () => {
    it('refresh every labs query after a create, an edit and a delete', async () => {
        api.createLab.mockResolvedValue({ slug: 'a' }); api.updateLab.mockResolvedValue({ slug: 'a' }); api.deleteLab.mockResolvedValue({ slug: 'a' })
        const spy = spyInvalidate()
        const create = renderHook(() => useCreateLab(), { wrapper })
        const update = renderHook(() => useUpdateLab(), { wrapper })
        const del = renderHook(() => useDeleteLab(), { wrapper })
        await act(async () => { await create.result.current.mutateAsync({ title: 'A' }) })
        await act(async () => { await update.result.current.mutateAsync({ slug: 'a', payload: { title: 'B' } }) })
        await act(async () => { await del.result.current.mutateAsync({ slug: 'a' }) })
        expect(invalidated(spy).filter((k) => k === JSON.stringify(labKeys.all))).toHaveLength(3)
    })

    it('ask the app server to drop its cached public pages after each write', async () => {
        api.createLab.mockResolvedValue({ slug: 'a' }); api.updateLab.mockResolvedValue({ slug: 'a' }); api.deleteLab.mockResolvedValue({ slug: 'a' })
        const create = renderHook(() => useCreateLab(), { wrapper })
        const update = renderHook(() => useUpdateLab(), { wrapper })
        const del = renderHook(() => useDeleteLab(), { wrapper })
        await act(async () => { await create.result.current.mutateAsync({ title: 'A' }) })
        expect(revalidate.refreshPublicLabs).toHaveBeenCalledTimes(1)
        await act(async () => { await update.result.current.mutateAsync({ slug: 'a', payload: { title: 'B' } }) })
        expect(revalidate.refreshPublicLabs).toHaveBeenCalledTimes(2)
        await act(async () => { await del.result.current.mutateAsync({ slug: 'a' }) })
        expect(revalidate.refreshPublicLabs).toHaveBeenCalledTimes(3)
    })

    it('do not purge anything when the write failed', async () => {
        api.createLab.mockRejectedValue(new ApiError('bad', 400, 'VALIDATION_ERROR'))
        const create = renderHook(() => useCreateLab(), { wrapper })
        await act(async () => { await create.result.current.mutateAsync({ title: 'A' }).catch(() => undefined) })
        expect(revalidate.refreshPublicLabs).not.toHaveBeenCalled()
    })

    it.each([
        ['create', () => useCreateLab(), (r: { mutateAsync: (v: never) => Promise<unknown> }) => r.mutateAsync({ title: 'A', flags: [{ value: 'flag{secret}' }] } as never), 'createLab'],
        ['edit', () => useUpdateLab(), (r: { mutateAsync: (v: never) => Promise<unknown> }) => r.mutateAsync({ slug: 'a', payload: { flags: [{ value: 'flag{secret}' }] } } as never), 'updateLab'],
    ])('do not keep the flags of a %s in the mutation cache', async (_name, hook, run, fn) => {
        api[fn as 'createLab'].mockResolvedValue({ slug: 'a' })
        const { result, unmount } = renderHook(hook as () => { mutateAsync: (v: never) => Promise<unknown>; reset: () => void }, { wrapper })
        await act(async () => { await run(result.current) })
        act(() => result.current.reset())
        unmount()
        await waitFor(() => expect(qc.getMutationCache().getAll().some((m) => JSON.stringify(m.state.variables ?? '').includes('secret'))).toBe(false))
    })

    it('refresh the caches when a delete is refused because members completed the lab', async () => {
        api.deleteLab.mockRejectedValue(new ApiError('has completions', 409, 'LAB_HAS_COMPLETIONS'))
        const spy = spyInvalidate()
        const del = renderHook(() => useDeleteLab(), { wrapper })
        await act(async () => { await del.result.current.mutateAsync({ slug: 'a' }).catch(() => undefined) })
        expect(invalidated(spy)).toContain(JSON.stringify(labKeys.all))
        expect(revalidate.refreshPublicLabs).not.toHaveBeenCalled()
    })

    it('keep the fetch time of the server copy so an old page is refreshed', async () => {
        const builtAt = Date.now() - 10 * 60_000
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        api.listLabs.mockResolvedValue(page([makeCard()]))
        renderHook(() => useLabs({}, page([makeCard()]), builtAt), { wrapper })
        expect(qc.getQueryState(labKeys.list({ limit: 12, page: undefined }, null))?.dataUpdatedAt).toBeLessThanOrEqual(builtAt + 1000)
        await waitFor(() => expect(api.listLabs).toHaveBeenCalled())
    })
})

describe('error messages', () => {
    it('map each lab code to a sentence', () => {
        expect(labErrorMessage(new ApiError('x', 409, 'LAB_ALREADY_COMPLETED'))).toMatch(/already completed/)
        expect(labErrorMessage(new ApiError('x', 409, 'LAB_BUSY'))).toMatch(/send it again/)
        expect(labErrorMessage(new ApiError('x', 404, 'LAB_NOT_STARTED'))).toMatch(/Start the lab/)
    })
})
