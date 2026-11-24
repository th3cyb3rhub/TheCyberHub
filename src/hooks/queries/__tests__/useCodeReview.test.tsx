import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { crErrorMessage } from '@/lib/codeReview/errors'
import { SLUG, makeAdminSnippet, makeCard, makeDetail, makeResult, makeViewer } from '@/lib/codeReview/__tests__/fixtures'
import type { CrPage } from '@/types/codeReview'

const auth = vi.hoisted(() => ({
    current: { user: { id: 'u1', role: 'user' } as { id: string; role: string } | null, loading: false, refreshUser: vi.fn() },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const api = vi.hoisted(() => ({
    listSnippets: vi.fn(), getStats: vi.fn(), getSnippet: vi.fn(), getMyProgress: vi.fn(), listAttempts: vi.fn(), submitAttempt: vi.fn(),
    unlockHint: vi.fn(), getSolution: vi.fn(), listManaged: vi.fn(), getAdminSnippet: vi.fn(), createSnippet: vi.fn(), updateSnippet: vi.fn(),
    setPublished: vi.fn(), deleteSnippet: vi.fn(),
}))
vi.mock('@/lib/api/codeReview', () => api)
const revalidate = vi.hoisted(() => ({ refreshPublicCodeReview: vi.fn() }))
vi.mock('@/lib/codeReview/revalidate', () => revalidate)

import {
    crKeys, useAdminSnippet, useCodeSnippet, useCodeSnippets, useCreateSnippet, useDeleteSnippet, useSetPublished, useSolution, useSubmitAttempt, useUnlockHint,
    useUpdateSnippet,
} from '../useCodeReview'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const page = (data: unknown[], hasMore = false, total = data.length): CrPage<ReturnType<typeof makeCard>> =>
    ({ count: data.length, data: data as never, pagination: { page: 1, limit: 12, total, pages: 1, hasMore } })

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('query keys', () => {
    it('put the user in everything that depends on who is asking', () => {
        expect(crKeys.detail(SLUG, 'u1')).not.toEqual(crKeys.detail(SLUG, 'u2'))
        expect(crKeys.detail(SLUG, null)).toEqual(['code-review', 'detail', SLUG, null])
        expect(crKeys.list({ category: 'xss' }, 'u1')).not.toEqual(crKeys.list({ category: 'xss' }, null))
        expect(crKeys.stats('a')).not.toEqual(crKeys.stats('b'))
        expect(crKeys.progress('a')).not.toEqual(crKeys.progress('b'))
        expect(crKeys.attempts(SLUG, 'a')).not.toEqual(crKeys.attempts(SLUG, 'b'))
        expect(crKeys.solution(SLUG, 'a')).not.toEqual(crKeys.solution(SLUG, 'b'))
        expect(crKeys.adminList({}, 'a')).not.toEqual(crKeys.adminList({}, 'b'))
        expect(crKeys.adminSnippet(SLUG, 'a')).not.toEqual(crKeys.adminSnippet(SLUG, 'b'))
    })

    it('share a prefix so one invalidation reaches every viewer of an exercise', () => {
        expect(crKeys.detail(SLUG, 'u1').slice(0, 3)).toEqual([...crKeys.details(), SLUG])
        expect(crKeys.list({}, 'u1').slice(0, 2)).toEqual(crKeys.lists())
        // the staff views sit outside the public detail prefix, so a read of a draft never lands in it
        expect(crKeys.adminSnippet(SLUG, 'u1').slice(0, 2)).not.toEqual(crKeys.details())
    })
})

describe('reads', () => {
    it('loads the list under the signed-in user and pages with load more', async () => {
        api.listSnippets.mockResolvedValueOnce(page([makeCard()], true, 2)).mockResolvedValueOnce({ ...page([makeCard({ slug: 'b', _id: 'c2' })]), pagination: { page: 2, limit: 12, total: 2, pages: 2, hasMore: false } })
        const { result } = renderHook(() => useCodeSnippets({ category: 'xss' }), { wrapper })
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
        expect(api.listSnippets).toHaveBeenCalledWith({ limit: 12, category: 'xss', page: 1 })
        expect(result.current.hasNextPage).toBe(true)
        await act(async () => { await result.current.fetchNextPage() })
        expect(api.listSnippets).toHaveBeenLastCalledWith({ limit: 12, category: 'xss', page: 2 })
        await waitFor(() => expect(result.current.hasNextPage).toBe(false))
        expect(qc.getQueryData(crKeys.list({ limit: 12, category: 'xss', page: undefined }, 'u1'))).toBeDefined()
    })

    it('waits for the session before it asks', async () => {
        auth.current = { user: null, loading: true, refreshUser: vi.fn() }
        renderHook(() => useCodeSnippets(), { wrapper })
        renderHook(() => useCodeSnippet(SLUG), { wrapper })
        await new Promise((r) => setTimeout(r, 20))
        expect(api.listSnippets).not.toHaveBeenCalled()
        expect(api.getSnippet).not.toHaveBeenCalled()
    })

    it('treats the server list as fresh for a visitor and only as a placeholder for a member', async () => {
        const server = page([makeCard()])
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        const visitor = renderHook(() => useCodeSnippets({}, server), { wrapper })
        expect(visitor.result.current.data?.pages[0]).toBe(server)
        expect(visitor.result.current.isPlaceholderData).toBe(false)
        await new Promise((r) => setTimeout(r, 20))
        expect(api.listSnippets).not.toHaveBeenCalled()

        qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.listSnippets.mockResolvedValue(page([makeCard({ progress: { status: 'passed', attempts: 1, bestScore: 20, maxScore: 20, bestPercent: 100, passed: true, pointsEarned: 25 } })]))
        const member = renderHook(() => useCodeSnippets({}, server), { wrapper })
        expect(member.result.current.isPlaceholderData).toBe(true)
        await waitFor(() => expect(member.result.current.isPlaceholderData).toBe(false))
        expect(member.result.current.data?.pages[0].data[0].progress?.status).toBe('passed')
    })

    it('uses the server copy of an exercise for a visitor without a request, and asks again for a member', async () => {
        const server = makeDetail({ viewer: null })
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        const visitor = renderHook(() => useCodeSnippet(SLUG, server), { wrapper })
        expect(visitor.result.current.data).toBe(server)
        await new Promise((r) => setTimeout(r, 20))
        expect(api.getSnippet).not.toHaveBeenCalled()

        qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.getSnippet.mockResolvedValue(makeDetail({ viewer: makeViewer({ status: 'in-progress', attempts: 2 }) }))
        const member = renderHook(() => useCodeSnippet(SLUG, server), { wrapper })
        expect(member.result.current.isPlaceholderData).toBe(true)
        await waitFor(() => expect(member.result.current.data?.viewer?.attempts).toBe(2))
        expect(qc.getQueryData(crKeys.detail(SLUG, 'u1'))).toBeDefined()
        expect(qc.getQueryData(crKeys.detail(SLUG, null))).toBeUndefined()
    })

    it('does not retry a 404', async () => {
        api.getSnippet.mockRejectedValue(new ApiError('nope', 404, 'CR_NOT_FOUND'))
        const { result } = renderHook(() => useCodeSnippet(SLUG), { wrapper })
        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(api.getSnippet).toHaveBeenCalledTimes(1)
    })

    it('does not read the solution until the member chose to, and never retries a refusal', async () => {
        const { result, rerender } = renderHook(({ on }) => useSolution(SLUG, on), { wrapper, initialProps: { on: false } })
        await new Promise((r) => setTimeout(r, 20))
        expect(api.getSolution).not.toHaveBeenCalled()
        api.getSolution.mockRejectedValue(new ApiError('locked', 403, 'CR_SOLUTION_LOCKED'))
        rerender({ on: true })
        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(api.getSolution).toHaveBeenCalledTimes(1)
        expect(crErrorMessage(result.current.error)).toMatch(/first graded attempt/)
    })

    it('opening the solution refreshes the exercise, so the viewer says it was opened', async () => {
        api.getSolution.mockResolvedValue({ _id: '1', slug: SLUG, title: 'T', findings: [], hints: [], viewer: null, explanation: '', fixedCode: '', exploitedCode: '', fixedExploitedCode: '', exploitExample: null })
        api.getSnippet.mockResolvedValue(makeDetail())
        renderHook(() => useCodeSnippet(SLUG), { wrapper })
        await waitFor(() => expect(api.getSnippet).toHaveBeenCalledTimes(1))
        renderHook(() => useSolution(SLUG, true), { wrapper })
        await waitFor(() => expect(api.getSnippet).toHaveBeenCalledTimes(2))
    })

    it('reads the editor copy for staff only once, never from the public detail key', async () => {
        api.getAdminSnippet.mockResolvedValue(makeAdminSnippet())
        const { result } = renderHook(() => useAdminSnippet(SLUG), { wrapper })
        await waitFor(() => expect(result.current.data?.findings).toHaveLength(1))
        expect(qc.getQueryData(crKeys.adminSnippet(SLUG, 'u1'))).toBeDefined()
        expect(qc.getQueryData(crKeys.detail(SLUG, 'u1'))).toBeUndefined()
    })
})

describe('submitting marks', () => {
    const seed = () => qc.setQueryData(crKeys.detail(SLUG, 'u1'), makeDetail({ viewer: makeViewer() }))

    it('patches the viewer from the graded result and refreshes the lists, progress and totals', async () => {
        seed()
        api.submitAttempt.mockResolvedValue(makeResult({ score: 7, maxScore: 20, bestPercent: 35, attempts: 1, attemptsLeftToday: 29, pointsAvailable: 25 }))
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useSubmitAttempt(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ ref: SLUG, marks: [{ lineStart: 4, lineEnd: 5 }] }) })
        const viewer = qc.getQueryData<ReturnType<typeof makeDetail>>(crKeys.detail(SLUG, 'u1'))?.viewer
        expect(viewer).toMatchObject({ attempts: 1, status: 'in-progress', attemptsLeftToday: 29, attemptsToday: 1, bestPercent: 35, solutionUnlocked: true, passed: false })
        const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey))
        expect(keys).toContain(JSON.stringify(crKeys.lists()))
        expect(keys).toContain(JSON.stringify(['code-review', 'progress']))
        expect(keys).toContain(JSON.stringify(['code-review', 'stats']))
        expect(keys).toContain(JSON.stringify(crKeys.attempts(SLUG, 'u1')))
        // nothing was paid: points and badges stay as they were
        expect(keys).not.toContain(JSON.stringify(['leaderboard']))
        expect(auth.current.refreshUser).not.toHaveBeenCalled()
        expect(api.submitAttempt).toHaveBeenCalledWith(SLUG, [{ lineStart: 4, lineEnd: 5 }])
    })

    it('a first pass moves the points, badges, streak and the member\'s own totals', async () => {
        seed()
        api.submitAttempt.mockResolvedValue(makeResult({ passed: true, firstPass: true, pointsAwarded: 20, score: 20, bestPercent: 100, percent: 100, newBadges: [{ code: 'x', name: 'X', icon: null, rarity: null }] }))
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useSubmitAttempt(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ ref: SLUG, marks: [{ lineStart: 4, lineEnd: 5 }] }) })
        const viewer = qc.getQueryData<ReturnType<typeof makeDetail>>(crKeys.detail(SLUG, 'u1'))?.viewer
        expect(viewer).toMatchObject({ passed: true, status: 'passed', pointsEarned: 20 })
        const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey))
        expect(keys).toEqual(expect.arrayContaining([JSON.stringify(['leaderboard']), JSON.stringify(['badges']), JSON.stringify(['streak'])]))
        expect(auth.current.refreshUser).toHaveBeenCalled()
    })

    it('the daily cap leaves no attempts on the cached viewer', async () => {
        seed()
        api.submitAttempt.mockRejectedValue(new ApiError('x', 429, 'CR_ATTEMPT_LIMIT', undefined, { retryAfter: 3600, limit: 30 }))
        const { result } = renderHook(() => useSubmitAttempt(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ ref: SLUG, marks: [{ lineStart: 1, lineEnd: 1 }] }).catch(() => undefined) })
        expect(qc.getQueryData<ReturnType<typeof makeDetail>>(crKeys.detail(SLUG, 'u1'))?.viewer?.attemptsLeftToday).toBe(0)
    })

    it('an error that means the page was old refreshes it', async () => {
        seed()
        api.submitAttempt.mockRejectedValue(new ApiError('x', 409, 'CR_NOT_GRADABLE'))
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useSubmitAttempt(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ ref: SLUG, marks: [{ lineStart: 1, lineEnd: 1 }] }).catch(() => undefined) })
        expect(spy).toHaveBeenCalled()
    })
})

describe('hints', () => {
    it('opening one shows its text and the cost on the cached exercise', async () => {
        qc.setQueryData(crKeys.detail(SLUG, 'u1'), makeDetail())
        api.unlockHint.mockResolvedValue({ hint: { order: 1, text: 'Look at the query.', cost: 3 }, alreadyUnlocked: false, recorded: true, hintsUsed: 1, hintCost: 3, pointsAvailable: 22 })
        const { result } = renderHook(() => useUnlockHint(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ ref: SLUG, order: 1 }) })
        const d = qc.getQueryData<ReturnType<typeof makeDetail>>(crKeys.detail(SLUG, 'u1'))
        expect(d?.hints[0]).toMatchObject({ order: 1, unlocked: true, text: 'Look at the query.' })
        expect(d?.hints[1].unlocked).toBe(false)
        expect(d?.viewer).toMatchObject({ hintsUnlocked: [1], hintCost: 3, pointsAvailable: 22 })
    })

    it('a staff read records nothing on the viewer', async () => {
        qc.setQueryData(crKeys.detail(SLUG, 'u1'), makeDetail())
        api.unlockHint.mockResolvedValue({ hint: { order: 1, text: 't', cost: 3 }, alreadyUnlocked: false, recorded: false, hintsUsed: 0, hintCost: 0, pointsAvailable: 0 })
        const { result } = renderHook(() => useUnlockHint(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ ref: SLUG, order: 1 }) })
        expect(qc.getQueryData<ReturnType<typeof makeDetail>>(crKeys.detail(SLUG, 'u1'))?.viewer?.hintsUnlocked).toEqual([])
    })

    it('a hint out of order refreshes the exercise so the next closed hint is the right one', async () => {
        qc.setQueryData(crKeys.detail(SLUG, 'u1'), makeDetail())
        api.unlockHint.mockRejectedValue(new ApiError('x', 409, 'CR_HINT_OUT_OF_ORDER', undefined, { next: 1 }))
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useUnlockHint(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ ref: SLUG, order: 2 }).catch(() => undefined) })
        expect(spy).toHaveBeenCalled()
    })
})

describe('staff writes', () => {
    it.each([
        ['create', () => useCreateSnippet(), () => api.createSnippet.mockResolvedValue(makeAdminSnippet()), { title: 'T' }],
        ['update', () => useUpdateSnippet(), () => api.updateSnippet.mockResolvedValue(makeAdminSnippet()), { ref: SLUG, payload: { title: 'T' } }],
        ['publish', () => useSetPublished(), () => api.setPublished.mockResolvedValue(makeAdminSnippet()), { ref: SLUG, published: true }],
        ['delete', () => useDeleteSnippet(), () => api.deleteSnippet.mockResolvedValue({ _id: '1', slug: SLUG }), { ref: SLUG }],
    ])('%s drops every cache here and asks the app server to drop its public copies', async (_name, hook, arrange, vars) => {
        arrange()
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => hook() as never as { mutateAsync: (v: unknown) => Promise<unknown> }, { wrapper })
        await act(async () => { await result.current.mutateAsync(vars) })
        expect(spy).toHaveBeenCalledWith({ queryKey: crKeys.all })
        expect(revalidate.refreshPublicCodeReview).toHaveBeenCalledTimes(1)
    })

    it('a refused write does not drop the public copies', async () => {
        api.createSnippet.mockRejectedValue(new ApiError('x', 409, 'CR_SLUG_TAKEN'))
        const { result } = renderHook(() => useCreateSnippet(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ title: 'T' }).catch(() => undefined) })
        expect(revalidate.refreshPublicCodeReview).not.toHaveBeenCalled()
    })

    it('a delete that members blocked refreshes what is on screen', async () => {
        api.deleteSnippet.mockRejectedValue(new ApiError('x', 409, 'CR_HAS_PROGRESS'))
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useDeleteSnippet(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ ref: SLUG }).catch(() => undefined) })
        expect(spy).toHaveBeenCalledWith({ queryKey: crKeys.all })
        expect(revalidate.refreshPublicCodeReview).not.toHaveBeenCalled()
    })
})
