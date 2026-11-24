import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeDetail, progress, viewer } from '@/lib/learning/__tests__/fixtures'
import type { LearningDetail } from '@/types/learning'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user' }, loading: false }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const api = vi.hoisted(() => ({
    completeNode: vi.fn(), uncompleteNode: vi.fn(), enrollInPath: vi.fn(), addBookmark: vi.fn(), removeBookmark: vi.fn(), getPath: vi.fn(), listPaths: vi.fn(),
    updatePath: vi.fn(), getEditorPath: vi.fn(),
}))
vi.mock('@/lib/api/learning', () => api)

import { learningKeys, useBookmarkPath, useEnroll, useLearningPath, useTickNode, useUpdatePath } from '../useLearningPaths'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const key = learningKeys.detail('web-hacking', 'u1')
const read = () => qc.getQueryData<LearningDetail>(key)

beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    api.getPath.mockResolvedValue(makeDetail())
})

describe('ticking a step', () => {
    it('shows the tick at once, then the server numbers and the rewards', async () => {
        qc.setQueryData(key, makeDetail())
        let release: (v: unknown) => void = () => {}
        api.completeNode.mockReturnValue(new Promise((r) => { release = r }))
        const { result } = renderHook(() => useTickNode(), { wrapper })

        act(() => { result.current.mutate({ slug: 'web-hacking', nodeId: 'b', done: true, title: 'Web hacking' }) })
        await waitFor(() => expect(read()?.viewer?.progress?.completedModules).toEqual(['a', 'b']))
        expect(read()?.viewer?.progress?.percent).toBe(67)

        await act(async () => {
            release({ ...progress({ completedModules: ['a', 'b'], percent: 66 }), changed: true, completedNow: false, rewards: { pointsAwarded: 10, badges: [{ code: 'x', name: 'Starter' }] }, next: null })
        })
        await waitFor(() => expect(read()?.viewer?.progress?.percent).toBe(66))
        expect(read()?.viewer?.next).toBeNull()
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: 'You earned 10 points.' })
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Badge unlocked: Starter.' })
    })

    it('unticks through the other endpoint', async () => {
        qc.setQueryData(key, makeDetail())
        api.uncompleteNode.mockResolvedValue({ ...progress({ completedModules: [], percent: 0 }), changed: true, completedNow: false, rewards: { pointsAwarded: 0, badges: [] }, next: null })
        const { result } = renderHook(() => useTickNode(), { wrapper })
        await act(async () => { result.current.mutate({ slug: 'web-hacking', nodeId: 'a', done: false }) })
        expect(api.uncompleteNode).toHaveBeenCalledWith('web-hacking', 'a')
        expect(api.completeNode).not.toHaveBeenCalled()
    })

    it('rolls back and explains when the API refuses', async () => {
        const before = makeDetail()
        qc.setQueryData(key, before)
        api.completeNode.mockRejectedValue(new ApiError('gone', 404, 'MODULE_NOT_FOUND'))
        const { result } = renderHook(() => useTickNode(), { wrapper })

        await act(async () => { result.current.mutate({ slug: 'web-hacking', nodeId: 'b', done: true }) })
        await waitFor(() => expect(addToast).toHaveBeenCalled())
        expect(addToast.mock.calls[0][0]).toMatchObject({ variant: 'error', message: expect.stringMatching(/not part of this roadmap/) })
        expect(read()?.viewer?.progress?.completedModules).toEqual(before.viewer?.progress?.completedModules)
        expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
    })

    it('keeps a later tick when an earlier one fails, and sends them in order', async () => {
        qc.setQueryData(key, makeDetail())
        let failA: (e: unknown) => void = () => {}
        api.completeNode.mockImplementation((_slug: string, id: string) => id === 'b'
            ? new Promise((_, rej) => { failA = rej })
            : Promise.resolve({ ...progress({ completedModules: ['a', 'c'], percent: 67 }), changed: true, completedNow: false, rewards: { pointsAwarded: 0, badges: [] }, next: null }))
        const { result } = renderHook(() => useTickNode(), { wrapper })

        act(() => { result.current.mutate({ slug: 'web-hacking', nodeId: 'b', done: true }) })
        act(() => { result.current.mutate({ slug: 'web-hacking', nodeId: 'c', done: true }) })
        await waitFor(() => expect(read()?.viewer?.progress?.completedModules).toEqual(expect.arrayContaining(['a', 'b', 'c'])))
        expect(api.completeNode).toHaveBeenCalledTimes(1)
        expect(api.completeNode.mock.calls[0][1]).toBe('b')

        await act(async () => { failA(new ApiError('gone', 404, 'MODULE_NOT_FOUND')) })
        await waitFor(() => expect(api.completeNode).toHaveBeenCalledTimes(2))
        expect(api.completeNode.mock.calls[1][1]).toBe('c')
        await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' })))
        const done = read()?.viewer?.progress?.completedModules ?? []
        expect(done).toContain('c')
        expect(done).not.toContain('b')
    })

    it('does not let an earlier answer wipe a tick that is still pending', async () => {
        qc.setQueryData(key, makeDetail())
        let okA: (v: unknown) => void = () => {}
        let okB: (v: unknown) => void = () => {}
        api.completeNode.mockImplementation((_slug: string, id: string) => new Promise((r) => { if (id === 'b') okA = r; else okB = r }))
        const { result } = renderHook(() => useTickNode(), { wrapper })

        act(() => { result.current.mutate({ slug: 'web-hacking', nodeId: 'b', done: true }) })
        act(() => { result.current.mutate({ slug: 'web-hacking', nodeId: 'c', done: true }) })
        await waitFor(() => expect(api.completeNode).toHaveBeenCalledTimes(1))
        await act(async () => { okA({ ...progress({ completedModules: ['a', 'b'], percent: 50 }), changed: true, completedNow: false, rewards: { pointsAwarded: 0, badges: [] }, next: null }) })
        await waitFor(() => expect(api.completeNode).toHaveBeenCalledTimes(2))
        expect(read()?.viewer?.progress?.completedModules).toContain('c')

        await act(async () => { okB({ ...progress({ completedModules: ['a', 'b', 'c'], percent: 75 }), changed: true, completedNow: false, rewards: { pointsAwarded: 0, badges: [] }, next: null }) })
        await waitFor(() => expect(read()?.viewer?.progress?.percent).toBe(75))
    })

    it('leaves an anonymous page alone', async () => {
        const anon = makeDetail({ viewer: null })
        qc.setQueryData(key, anon)
        api.completeNode.mockRejectedValue(new ApiError('Sign in', 401))
        const { result } = renderHook(() => useTickNode(), { wrapper })
        await act(async () => { result.current.mutate({ slug: 'web-hacking', nodeId: 'a', done: true }) })
        await waitFor(() => expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: 'Sign in to do that.' }))
    })
})

describe('enrolling', () => {
    it('marks the viewer enrolled at once and rolls back on an error', async () => {
        qc.setQueryData(key, makeDetail({ viewer: viewer({ enrolled: false, progress: null, next: null }) }))
        api.enrollInPath.mockRejectedValue(new ApiError('Finish first', 403, 'PATH_PREREQUISITES_NOT_MET', undefined, { missing: [{ title: 'Linux' }] }))
        const { result } = renderHook(() => useEnroll(), { wrapper })
        await act(async () => { result.current.mutate({ slug: 'web-hacking', title: 'Web hacking' }) })
        await waitFor(() => expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: 'Finish Linux before starting this one.' }))
        expect(read()?.viewer?.enrolled).toBe(false)
    })
    it('welcomes the member when the API accepts', async () => {
        qc.setQueryData(key, makeDetail({ viewer: viewer({ enrolled: false, progress: null, next: null }) }))
        api.enrollInPath.mockResolvedValue(progress({ completedModules: [], percent: 0, status: 'enrolled' }))
        const { result } = renderHook(() => useEnroll(), { wrapper })
        await act(async () => { result.current.mutate({ slug: 'web-hacking', title: 'Web hacking' }) })
        await waitFor(() => expect(read()?.viewer?.enrolled).toBe(true))
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: 'You joined Web hacking.' })
    })
})

describe('bookmarking', () => {
    it('uses the shared routes with the roadmap content type and rolls back', async () => {
        qc.setQueryData(key, makeDetail())
        api.addBookmark.mockRejectedValue(new ApiError('Nope', 500))
        const { result } = renderHook(() => useBookmarkPath(), { wrapper })
        await act(async () => { result.current.mutate({ id: 'p1', slug: 'web-hacking', bookmarked: true }) })
        expect(api.addBookmark).toHaveBeenCalledWith('roadmap', 'p1')
        await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' })))
        expect(read()?.viewer?.bookmarked).toBe(false)
    })
})

describe('server data', () => {
    it('refetches server rendered data for a signed-in visitor', async () => {
        const initial = makeDetail({ viewer: null })
        const { result } = renderHook(() => useLearningPath('web-hacking', initial), { wrapper })
        expect(result.current.data?.viewer).toBeNull()
        await waitFor(() => expect(api.getPath).toHaveBeenCalledWith('web-hacking'))
        await waitFor(() => expect(result.current.data?.viewer?.enrolled).toBe(true))
    })
})

describe('saving in the editor', () => {
    it('hands the conflict to the caller instead of toasting it', async () => {
        const err = new ApiError('Conflict', 409, 'PATH_CONFLICT', undefined, { updatedAt: '2026-11-05T10:00:00Z' })
        api.updatePath.mockRejectedValue(err)
        const { result } = renderHook(() => useUpdatePath(), { wrapper })
        await act(async () => { result.current.mutate({ ref: 'web-hacking', input: { title: 'x', ifUnmodifiedSince: '2026-11-01T10:00:00Z' } }) })
        await waitFor(() => expect(result.current.error).toBe(err))
        expect(api.updatePath).toHaveBeenCalledWith('web-hacking', { title: 'x', ifUnmodifiedSince: '2026-11-01T10:00:00Z' })
    })
})
