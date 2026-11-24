import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeResource } from '@/lib/learning/__tests__/fixtures'
import type { Resource } from '@/types/resource'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user' }, loading: false }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const api = vi.hoisted(() => ({
    voteResource: vi.fn(), setReading: vi.fn(), reportResource: vi.fn(), createResource: vi.fn(), approveResource: vi.fn(), rejectResource: vi.fn(),
    checkUrl: vi.fn(), listResources: vi.fn(), getResource: vi.fn(), listReviewQueue: vi.fn(), getFacets: vi.fn(),
}))
vi.mock('@/lib/api/resources', () => api)
const learning = vi.hoisted(() => ({ addBookmark: vi.fn(), removeBookmark: vi.fn() }))
vi.mock('@/lib/api/learning', () => learning)

import { resourceKeys, useBookmarkResource, useCheckUrl, useCreateResource, useRejectResource, useResourceList, useVoteResource } from '../useResources'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const detailKey = resourceKeys.detail('owasp-top-10', 'u1')
const withViewer = (over = {}) => makeResource({ viewer: { vote: 0, bookmarked: false, reading: null }, ...over })

beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('voting', () => {
    it('updates the tally at once in the detail and in every list, then takes the server tally', async () => {
        const list = { pages: [{ data: [withViewer()], pagination: { page: 1, limit: 12, total: 1, totalPages: 1, hasMore: false } }], pageParams: [1] }
        qc.setQueryData(detailKey, withViewer())
        qc.setQueryData(resourceKeys.list({ limit: 12 }, 'u1'), list)
        let release: (v: unknown) => void = () => {}
        api.voteResource.mockReturnValue(new Promise((r) => { release = r }))
        const { result } = renderHook(() => useVoteResource(), { wrapper })

        act(() => { result.current.mutate({ id: 'r1', slug: 'owasp-top-10', value: 1 }) })
        await waitFor(() => expect(qc.getQueryData<Resource>(detailKey)?.upvotes).toBe(5))
        expect(qc.getQueryData<typeof list>(resourceKeys.list({ limit: 12 }, 'u1'))?.pages[0].data[0]).toMatchObject({ upvotes: 5, score: 4, viewer: { vote: 1 } })

        await act(async () => { release({ upvotes: 9, downvotes: 1, score: 8, userVote: 1 }) })
        await waitFor(() => expect(qc.getQueryData<Resource>(detailKey)?.upvotes).toBe(9))
        expect(api.voteResource).toHaveBeenCalledWith('owasp-top-10', 1)
    })

    it('restores the tally and says why when voting on your own resource', async () => {
        qc.setQueryData(detailKey, withViewer())
        api.voteResource.mockRejectedValue(new ApiError('self', 403, 'RESOURCE_SELF_VOTE'))
        const { result } = renderHook(() => useVoteResource(), { wrapper })
        await act(async () => { result.current.mutate({ id: 'r1', slug: 'owasp-top-10', value: 1 }) })
        await waitFor(() => expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: expect.stringMatching(/cannot vote/) }))
        expect(qc.getQueryData<Resource>(detailKey)).toMatchObject({ upvotes: 4, viewer: { vote: 0 } })
    })
})

describe('bookmarking', () => {
    it('uses the shared bookmark routes with the resource type', async () => {
        qc.setQueryData(detailKey, withViewer())
        learning.addBookmark.mockResolvedValue(undefined)
        const { result } = renderHook(() => useBookmarkResource(), { wrapper })
        await act(async () => { result.current.mutate({ id: 'r1', bookmarked: true }) })
        expect(learning.addBookmark).toHaveBeenCalledWith('resource', 'r1')
        expect(qc.getQueryData<Resource>(detailKey)?.viewer?.bookmarked).toBe(true)
    })
    it('rolls back when the API fails', async () => {
        qc.setQueryData(detailKey, withViewer({ viewer: { vote: 0, bookmarked: true, reading: null } }))
        learning.removeBookmark.mockRejectedValue(new ApiError('x', 500))
        const { result } = renderHook(() => useBookmarkResource(), { wrapper })
        await act(async () => { result.current.mutate({ id: 'r1', bookmarked: false }) })
        await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' })))
        expect(qc.getQueryData<Resource>(detailKey)?.viewer?.bookmarked).toBe(true)
    })
})

describe('moderation and submission', () => {
    it('rejects with the reason and the note', async () => {
        api.rejectResource.mockResolvedValue(undefined)
        const { result } = renderHook(() => useRejectResource(), { wrapper })
        await act(async () => { result.current.mutate({ slug: 'a', reason: 'duplicate', note: 'seen' }) })
        expect(api.rejectResource).toHaveBeenCalledWith('a', { reason: 'duplicate', note: 'seen' })
    })
    it('keeps the duplicate answer for the form instead of toasting it', async () => {
        const err = new ApiError('dup', 409, 'RESOURCE_DUPLICATE', undefined, { existing: { slug: 'owasp-top-10', status: 'approved' } })
        api.createResource.mockRejectedValue(err)
        const { result } = renderHook(() => useCreateResource(), { wrapper })
        await act(async () => { result.current.mutate({ title: 'x' } as never) })
        await waitFor(() => expect(result.current.error).toBe(err))
    })
})

describe('queries', () => {
    it('lists with the filters and the next page cursor', async () => {
        api.listResources.mockResolvedValue({ data: [makeResource()], pagination: { page: 1, limit: 12, total: 30, totalPages: 3, hasMore: true } })
        const { result } = renderHook(() => useResourceList({ type: 'video' }), { wrapper })
        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(api.listResources).toHaveBeenCalledWith({ limit: 12, type: 'video', page: 1 })
        expect(result.current.hasNextPage).toBe(true)
    })
    it('checks a link only when it is a valid http link', async () => {
        api.checkUrl.mockResolvedValue({ normalizedUrl: 'https://a.org/x', domain: 'a.org', duplicate: null })
        const bad = renderHook(() => useCheckUrl('javascript:alert(1)'), { wrapper })
        const good = renderHook(() => useCheckUrl('https://a.org/x'), { wrapper })
        await waitFor(() => expect(good.result.current.data).toBeDefined())
        expect(api.checkUrl).toHaveBeenCalledTimes(1)
        expect(api.checkUrl).toHaveBeenCalledWith('https://a.org/x')
        expect(bad.result.current.data).toBeUndefined()
    })
})
