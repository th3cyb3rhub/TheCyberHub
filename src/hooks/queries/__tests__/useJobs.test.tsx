import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { card, job } from '@/lib/jobs/__tests__/fixtures'
import type { JobCard, JobsPage } from '@/types/job'

const auth = vi.hoisted(() => ({
    current: { user: { id: 'u1', role: 'user' } as { id: string; role: string } | null, loading: false, refreshUser: vi.fn() },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const toast = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => toast }))
const api = vi.hoisted(() => ({
    listJobs: vi.fn(), getJob: vi.fn(), applyToJob: vi.fn(), reportJob: vi.fn(), saveJob: vi.fn(), unsaveJob: vi.fn(), listSavedJobs: vi.fn(),
    listMyJobs: vi.fn(), getMyStats: vi.fn(), createJob: vi.fn(), updateJob: vi.fn(), submitJob: vi.fn(), closeJob: vi.fn(), reopenJob: vi.fn(),
    deleteJob: vi.fn(), getMyCompany: vi.fn(), saveMyCompany: vi.fn(), becomeEmployer: vi.fn(), listAdminJobs: vi.fn(), getAdminStats: vi.fn(),
    listAdminCompanies: vi.fn(), approveJob: vi.fn(), rejectJob: vi.fn(), reviewReportedJob: vi.fn(), approveCompany: vi.fn(), rejectCompany: vi.fn(),
}))
vi.mock('@/lib/api/jobs', () => api)
const revalidate = vi.hoisted(() => ({ refreshPublicJobs: vi.fn() }))
vi.mock('@/lib/jobs/revalidate', () => revalidate)

import {
    hitSortCap, isMemorySort, jobKeys, useAdminJobs, useApproveJob, useBulkApprove, useEmployerJobs, useJob, useJobAction, useJobs, useReportJob, useSaveAndSubmitJob, useSaveJob,
} from '../useJobs'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const page = (data: JobCard[], hasMore = false): JobsPage<JobCard> => ({ success: true, data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1, pages: 1, hasMore } })

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('query keys', () => {
    it('put the user in everything that depends on who is asking', () => {
        expect(jobKeys.detail('a-job', 'u1')).not.toEqual(jobKeys.detail('a-job', 'u2'))
        expect(jobKeys.list({}, 'u1')).not.toEqual(jobKeys.list({}, null))
        expect(jobKeys.myList('', 'u1')).not.toEqual(jobKeys.myList('', 'u2'))
        expect(jobKeys.myStats('a')).not.toEqual(jobKeys.myStats('b'))
        expect(jobKeys.myCompany('a')).not.toEqual(jobKeys.myCompany('b'))
        expect(jobKeys.saved('a')).not.toEqual(jobKeys.saved('b'))
        expect(jobKeys.adminList({}, 'a')).not.toEqual(jobKeys.adminList({}, 'b'))
        expect(jobKeys.adminStats('a')).not.toEqual(jobKeys.adminStats('b'))
    })

    it('share a prefix so one invalidation reaches every viewer', () => {
        expect(jobKeys.detail('a-job', 'u1').slice(0, 2)).toEqual(jobKeys.details())
        expect(jobKeys.list({}, 'u1').slice(0, 2)).toEqual(jobKeys.lists())
        expect(jobKeys.myList('', 'u1').slice(0, 2)).toEqual(jobKeys.mine())
        expect(jobKeys.adminList({}, 'u1').slice(0, 2)).toEqual(jobKeys.admin())
    })
})

describe('public reads', () => {
    it('loads the list and pages with load more', async () => {
        api.listJobs.mockResolvedValueOnce(page([card()], true)).mockResolvedValueOnce({ ...page([card({ _id: 'j2' })]), pagination: { page: 2, limit: 20, total: 2, totalPages: 2, pages: 2, hasMore: false } })
        const { result } = renderHook(() => useJobs({ category: 'soc' }), { wrapper })
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
        expect(api.listJobs).toHaveBeenCalledWith({ limit: 20, category: 'soc', page: 1 })
        expect(result.current.hasNextPage).toBe(true)
        await act(async () => { await result.current.fetchNextPage() })
        expect(api.listJobs).toHaveBeenLastCalledWith({ limit: 20, category: 'soc', page: 2 })
        await waitFor(() => expect(result.current.hasNextPage).toBe(false))
    })

    it('does not ask for the list before the session is known', async () => {
        auth.current = { user: null, loading: true, refreshUser: vi.fn() }
        renderHook(() => useJobs(), { wrapper })
        await new Promise((r) => setTimeout(r, 20))
        expect(api.listJobs).not.toHaveBeenCalled()
    })

    it('counts the server copy as fresh for a visitor: nothing is fetched after hydration', async () => {
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        const seed = page([card()])
        const { result } = renderHook(() => useJobs({}, seed, Date.now()), { wrapper })
        expect(result.current.data?.pages[0]).toBe(seed)
        await new Promise((r) => setTimeout(r, 20))
        expect(api.listJobs).not.toHaveBeenCalled()
    })

    it('only uses the server copy as a placeholder for a signed-in member, who is then asked with their own token', async () => {
        const seed = page([card()])
        api.listJobs.mockResolvedValue(page([card({ _id: 'mine-1' })]))
        const { result } = renderHook(() => useJobs({}, seed, Date.now()), { wrapper })
        expect(result.current.isPlaceholderData).toBe(true)
        await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
        expect(api.listJobs).toHaveBeenCalledTimes(1)
        expect(result.current.data?.pages[0].data[0]._id).toBe('mine-1')
    })

    it('never shows one member the previous answer of another', async () => {
        api.listJobs.mockResolvedValue(page([card({ _id: 'of-u1' })]))
        const { result, rerender } = renderHook(({ cat }: { cat: 'soc' | 'grc' }) => useJobs({ category: cat }), { wrapper, initialProps: { cat: 'soc' as 'soc' | 'grc' } })
        await waitFor(() => expect(result.current.data?.pages[0].data[0]._id).toBe('of-u1'))
        // Same viewer, other filter: the old rows stay while the new ones load
        let release: (p: JobsPage<JobCard>) => void = () => undefined
        api.listJobs.mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
        rerender({ cat: 'grc' })
        expect(result.current.isPlaceholderData).toBe(true)
        expect(result.current.data?.pages[0].data[0]._id).toBe('of-u1')
        await act(async () => { release(page([card({ _id: 'grc-1' })])) })
        await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))

        // Another member: nothing from the first one is shown while theirs loads
        auth.current = { user: { id: 'u2', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.listJobs.mockReturnValueOnce(new Promise(() => undefined))
        rerender({ cat: 'soc' })
        expect(result.current.data).toBeUndefined()
    })

    it('reads a job under the viewer and does not retry a 404', async () => {
        api.getJob.mockRejectedValue(new ApiError('nope', 404, 'JOB_NOT_FOUND'))
        const { result } = renderHook(() => useJob('gone-1'), { wrapper })
        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(api.getJob).toHaveBeenCalledTimes(1)
        expect(qc.getQueryState(jobKeys.detail('gone-1', 'u1'))).toBeDefined()
    })
})

describe('a job page counts one view from the browser', () => {
    it('asks once for the viewer even when a server copy is there, and shows that copy until the answer', async () => {
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        let release: (v: unknown) => void = () => undefined
        api.getJob.mockReturnValue(new Promise((resolve) => { release = resolve }))
        const server = job({ title: 'From the server' })
        const { result } = renderHook(() => useJob('a-job', server, Date.now()), { wrapper })
        expect(result.current.data?.title).toBe('From the server')
        expect(result.current.isPlaceholderData).toBe(true)
        await act(async () => { release({ job: job({ title: 'From the browser' }), meta: {} }) })
        await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
        expect(result.current.data?.title).toBe('From the browser')
        expect(api.getJob).toHaveBeenCalledTimes(1)
    })

    it('does not read again when two parts of the page, a refocus or a remount in strict mode ask', async () => {
        api.getJob.mockResolvedValue({ job: job(), meta: {} })
        const { result } = renderHook(() => { useJob('a-job', job()); return useJob('a-job', job()) }, { wrapper, reactStrictMode: true })
        await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
        window.dispatchEvent(new Event('focus'))
        await new Promise((r) => setTimeout(r, 30))
        expect(api.getJob).toHaveBeenCalledTimes(1)
    })

    it('drops the answer with the page so the next visit is counted', async () => {
        api.getJob.mockResolvedValue({ job: job(), meta: {} })
        const first = renderHook(() => useJob('a-job', job()), { wrapper })
        await waitFor(() => expect(first.result.current.isPlaceholderData).toBe(false))
        first.unmount()
        await waitFor(() => expect(qc.getQueryData(jobKeys.detail('a-job', 'u1'))).toBeUndefined())
        const second = renderHook(() => useJob('a-job', job()), { wrapper })
        await waitFor(() => expect(second.result.current.isPlaceholderData).toBe(false))
        expect(api.getJob).toHaveBeenCalledTimes(2)
    })
})

describe('the sort cap', () => {
    it('knows which sorts the API holds in memory', () => {
        expect(isMemorySort('viewCount')).toBe(true)
        expect(isMemorySort('title')).toBe(true)
        expect(isMemorySort('salary.max')).toBe(true)
        expect(isMemorySort('createdAt')).toBe(false)
        expect(isMemorySort(undefined)).toBe(false)
    })

    it('stops offering more pages at page 50 for those sorts, and says so', async () => {
        const at = (n: number) => ({ ...page([card()], true), pagination: { page: n, limit: 20, total: 5000, totalPages: 250, pages: 250, hasMore: true } })
        api.listJobs.mockResolvedValue(at(50))
        const { result } = renderHook(() => useJobs({ sortBy: 'viewCount' }), { wrapper })
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
        // The page the API reports is 50 here, so the pager must not ask for 51
        expect(result.current.hasNextPage).toBe(false)
        expect(hitSortCap({ sortBy: 'viewCount' }, result.current.data?.pages)).toBe(true)
        expect(hitSortCap({ sortBy: 'createdAt' }, result.current.data?.pages)).toBe(false)
    })

    it('keeps paging on the default sort', async () => {
        api.listJobs.mockResolvedValue({ ...page([card()], true), pagination: { page: 50, limit: 20, total: 5000, totalPages: 250, pages: 250, hasMore: true } })
        const { result } = renderHook(() => useJobs({}), { wrapper })
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
        expect(result.current.hasNextPage).toBe(true)
    })
})

describe('the poster own list', () => {
    it('uses the mine route through the API client, never the old employer route', async () => {
        api.listMyJobs.mockResolvedValue(page([card()]))
        const { result } = renderHook(() => useEmployerJobs('pending'), { wrapper })
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
        expect(api.listMyJobs).toHaveBeenCalledWith({ status: 'pending', page: 1, limit: 20 })
        expect(JSON.stringify(jobKeys.myList('pending', 'u1'))).not.toContain('employer')
    })

    it('waits for a signed-in user', async () => {
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        renderHook(() => useEmployerJobs(), { wrapper })
        await new Promise((r) => setTimeout(r, 20))
        expect(api.listMyJobs).not.toHaveBeenCalled()
    })
})

describe('save', () => {
    const seed = () => {
        qc.setQueryData(jobKeys.detail('a-job', 'u1'), job({ viewer: { saved: false, isOwner: false } }))
        qc.setQueryData(jobKeys.list({}, 'u1'), { pages: [{ ...page([card()]), viewer: { savedIds: [] } }], pageParams: [1] })
    }

    it('marks the job saved at once in the detail and in the list, before the server answers', async () => {
        seed()
        let done: () => void = () => undefined
        api.saveJob.mockReturnValue(new Promise<void>((resolve) => { done = resolve }))
        const { result } = renderHook(() => useSaveJob(), { wrapper })
        let settled: Promise<unknown> = Promise.resolve()
        act(() => { settled = result.current.mutateAsync({ id: 'j1', saved: true }) })
        await waitFor(() => expect((qc.getQueryData(jobKeys.detail('a-job', 'u1')) as { viewer: { saved: boolean } }).viewer.saved).toBe(true))
        const savedIds = () => (qc.getQueryData(jobKeys.list({}, 'u1')) as { pages: { viewer: { savedIds: string[] } }[] }).pages[0].viewer.savedIds
        expect(savedIds()).toContain('j1')
        expect(toast.addToast).not.toHaveBeenCalled()
        await act(async () => { done(); await settled })
        expect(api.saveJob).toHaveBeenCalledWith('j1')
        expect(toast.addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
    })

    it('counts "already saved" (409) on save as saved, and "not saved" (404) on unsave as removed', async () => {
        seed()
        api.saveJob.mockRejectedValue(new ApiError('already', 409, 'JOB_ALREADY_SAVED'))
        const { result } = renderHook(() => useSaveJob(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'j1', saved: true }) })
        expect(toast.addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
        expect(toast.addToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }))

        toast.addToast.mockClear()
        api.unsaveJob.mockRejectedValue(new ApiError('not saved', 404, 'SAVED_JOB_NOT_FOUND'))
        await act(async () => { await result.current.mutateAsync({ id: 'j1', saved: false }) })
        expect(toast.addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
        expect(toast.addToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }))
    })

    it('still reports a 404 on save and a 409 on unsave as the errors they are', async () => {
        seed()
        api.saveJob.mockRejectedValue(new ApiError('gone', 404, 'JOB_NOT_FOUND'))
        const { result } = renderHook(() => useSaveJob(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'j1', saved: true }).catch(() => undefined) })
        expect(toast.addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }))
    })

    it('stops only the reads it is about to patch, not every jobs query, and reads the details and lists again after', async () => {
        seed()
        // An unrelated read in flight (the poster list) must not be cancelled by a save
        const mine = new Promise(() => undefined)
        void qc.prefetchQuery({ queryKey: jobKeys.myList('', 'u1'), queryFn: () => mine })
        const cancel = vi.spyOn(qc, 'cancelQueries')
        const invalidate = vi.spyOn(qc, 'invalidateQueries')
        api.saveJob.mockResolvedValue(undefined)
        const { result } = renderHook(() => useSaveJob(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'j1', saved: true }) })
        const cancelled = cancel.mock.calls.map(([f]) => JSON.stringify(f?.queryKey))
        expect(cancelled).not.toContain(JSON.stringify(jobKeys.all))
        expect(cancelled).not.toContain(JSON.stringify(jobKeys.myList('', 'u1')))
        expect(cancelled).toContain(JSON.stringify(jobKeys.detail('a-job', 'u1')))
        expect(cancelled).toContain(JSON.stringify(jobKeys.list({}, 'u1')))
        const invalidated = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey))
        expect(invalidated).toContain(JSON.stringify(jobKeys.details()))
        expect(invalidated).toContain(JSON.stringify(jobKeys.lists()))
        expect(qc.getQueryState(jobKeys.myList('', 'u1'))?.fetchStatus).toBe('fetching')
    })

    it('puts the old state back and says why when the call fails', async () => {
        seed()
        let fail: (e: unknown) => void = () => undefined
        api.saveJob.mockReturnValue(new Promise((_, reject) => { fail = reject }))
        const { result } = renderHook(() => useSaveJob(), { wrapper })
        let settled: Promise<unknown> = Promise.resolve()
        act(() => { settled = result.current.mutateAsync({ id: 'j1', saved: true }).catch(() => undefined) })
        await waitFor(() => expect((qc.getQueryData(jobKeys.detail('a-job', 'u1')) as { viewer: { saved: boolean } }).viewer.saved).toBe(true))
        const list = () => (qc.getQueryData(jobKeys.list({}, 'u1')) as { pages: { viewer: { savedIds: string[] } }[] }).pages[0].viewer.savedIds
        expect(list()).toContain('j1')
        await act(async () => { fail(new ApiError('gone', 404, 'JOB_NOT_FOUND')); await settled })
        expect((qc.getQueryData(jobKeys.detail('a-job', 'u1')) as { viewer: { saved: boolean } }).viewer.saved).toBe(false)
        expect(list()).not.toContain('j1')
        expect(toast.addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error', message: expect.stringMatching(/not available/) }))
    })

    it('takes a job off the saved list at once when it is unsaved', async () => {
        qc.setQueryData(jobKeys.saved('u1'), { pages: [page([card(), card({ _id: 'j2' })])], pageParams: [1] })
        api.unsaveJob.mockResolvedValue(undefined)
        const { result } = renderHook(() => useSaveJob(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'j1', saved: false }) })
        expect(api.unsaveJob).toHaveBeenCalledWith('j1')
        const left = (qc.getQueryData(jobKeys.saved('u1')) as { pages: JobsPage<JobCard>[] } | undefined)?.pages[0].data.map((j) => j._id)
        expect(left === undefined || !left.includes('j1')).toBe(true)
    })
})

describe('report', () => {
    it('sends the reason and details, and leaves the error to the dialog', async () => {
        api.reportJob.mockRejectedValueOnce(new ApiError('dup', 409))
        const { result } = renderHook(() => useReportJob(), { wrapper })
        await act(async () => { await expect(result.current.mutateAsync({ id: 'j1', reason: 'scam', details: 'asks for money' })).rejects.toBeInstanceOf(ApiError) })
        expect(api.reportJob).toHaveBeenCalledWith('j1', { reason: 'scam', details: 'asks for money' })
        expect(toast.addToast).not.toHaveBeenCalled()
    })
})

describe('employer actions', () => {
    it('submits a draft and says it went to review', async () => {
        api.submitJob.mockResolvedValue(job({ status: 'pending' }))
        const { result } = renderHook(() => useJobAction(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ action: 'submit', id: 'j1' }) })
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: expect.stringMatching(/review/) })
    })

    it('says a job is live when the server published it at once', async () => {
        api.submitJob.mockResolvedValue(job({ status: 'approved' }))
        const { result } = renderHook(() => useJobAction(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ action: 'submit', id: 'j1' }) })
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Your job is live.' })
    })

    it('reopens with the new end date, closes and deletes', async () => {
        api.reopenJob.mockResolvedValue(job({ status: 'pending' }))
        api.closeJob.mockResolvedValue(job({ status: 'closed' }))
        api.deleteJob.mockResolvedValue(undefined)
        const { result } = renderHook(() => useJobAction(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ action: 'reopen', id: 'j1', expiresAt: '2031-01-01T00:00:00.000Z' }) })
        expect(api.reopenJob).toHaveBeenCalledWith('j1', '2031-01-01T00:00:00.000Z')
        await act(async () => { await result.current.mutateAsync({ action: 'close', id: 'j1' }) })
        await act(async () => { await result.current.mutateAsync({ action: 'delete', id: 'j1' }) })
        expect(api.closeJob).toHaveBeenCalledWith('j1')
        expect(api.deleteJob).toHaveBeenCalledWith('j1')
    })

    it('shows what the job is now when it moved on under the poster', async () => {
        api.closeJob.mockRejectedValue(new ApiError('x', 409, 'JOB_INVALID_TRANSITION', undefined, { status: 'closed', to: 'closed' }))
        const { result } = renderHook(() => useJobAction(), { wrapper })
        await act(async () => { await expect(result.current.mutateAsync({ action: 'close', id: 'j1' })).rejects.toBeInstanceOf(ApiError) })
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'error', message: expect.stringMatching(/closed/) })
    })

    it('saves the edits and then sends for review, and reads again even when the send fails', async () => {
        api.updateJob.mockResolvedValue(job())
        api.submitJob.mockRejectedValue(new ApiError('x', 403, 'COMPANY_REJECTED', undefined, { reason: 'Bad site' }))
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useSaveAndSubmitJob(), { wrapper })
        await act(async () => { await expect(result.current.mutateAsync({ id: 'j1', payload: { title: 'New title here' } })).rejects.toBeInstanceOf(ApiError) })
        expect(api.updateJob).toHaveBeenCalledWith('j1', { title: 'New title here' })
        expect(spy).toHaveBeenCalled()
    })
})

describe('review', () => {
    it('keeps the queue per reviewer', async () => {
        api.listAdminJobs.mockResolvedValue(page([card()]))
        const { result } = renderHook(() => useAdminJobs({ status: 'pending' }), { wrapper })
        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(api.listAdminJobs).toHaveBeenCalledWith({ status: 'pending', limit: 20 })
        expect(qc.getQueryData(jobKeys.adminList({ status: 'pending', limit: 20 }, 'u1'))).toBeDefined()
        expect(qc.getQueryData(jobKeys.adminList({ status: 'pending', limit: 20 }, 'u2'))).toBeUndefined()
    })

    it('approves, toasts, and asks the app server to drop its cached public pages', async () => {
        api.approveJob.mockResolvedValue(job({ status: 'approved' }))
        const { result } = renderHook(() => useApproveJob(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'j1', title: 'Senior Pentester' }) })
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Approved: Senior Pentester' })
        await waitFor(() => expect(revalidate.refreshPublicJobs).toHaveBeenCalled())
    })

    it('approves in bulk one by one and reports each job on its own', async () => {
        api.approveJob
            .mockResolvedValueOnce(job())
            .mockRejectedValueOnce(new ApiError('x', 409, 'JOB_INVALID_TRANSITION', undefined, { status: 'rejected' }))
            .mockResolvedValueOnce(job())
        const { result } = renderHook(() => useBulkApprove(), { wrapper })
        let out: { id: string; ok: boolean; message?: string }[] = []
        await act(async () => { out = await result.current.mutateAsync({ items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }] }) })
        expect(out.map((o) => [o.id, o.ok])).toEqual([['a', true], ['b', false], ['c', true]])
        expect(out[1].message).toMatch(/rejected/)
        expect(api.approveJob.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c'])
    })
})
