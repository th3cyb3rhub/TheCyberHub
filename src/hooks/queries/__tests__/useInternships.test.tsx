import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { internshipErrorMessage } from '@/lib/internships/errors'
import { COHORT_ID, makeCohort, makeMine, makeRow, makeStaffApplication, viewer } from '@/lib/internships/__tests__/fixtures'
import type { CohortDetail, MyApplication, Page } from '@/types/internship'

const auth = vi.hoisted(() => ({ current: { user: { id: 'u1', role: 'user' } as { id: string; role: string } | null, loading: false } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const api = vi.hoisted(() => ({
    listCohorts: vi.fn(), listPastCohorts: vi.fn(), getCohort: vi.fn(), applyToCohort: vi.fn(), listMyApplications: vi.fn(),
    withdrawApplication: vi.fn(), listAdminCohorts: vi.fn(), createCohort: vi.fn(), updateCohort: vi.fn(),
    listCohortApplications: vi.fn(), getStaffApplication: vi.fn(), changeApplicationStatus: vi.fn(),
}))
vi.mock('@/lib/api/internships', () => api)

import {
    internshipKeys, useApplyInternship, useChangeApplicationStatus, useCloseCohort, useInternship, useInternships, useMyApplications,
    useWithdrawApplication,
} from '../useInternships'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const page = <T,>(data: T[], hasMore = false): Page<T> => ({ success: true, count: data.length, data, pagination: { page: 1, limit: 12, total: data.length, totalPages: 1, hasMore } })

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'u1', role: 'user' }, loading: false }
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('query keys', () => {
    it('put the user in everything that depends on who is asking', () => {
        expect(internshipKeys.detail('c1', 'u1')).not.toEqual(internshipKeys.detail('c1', 'u2'))
        expect(internshipKeys.detail('c1', null)).toEqual(['internships', 'detail', 'c1', null])
        expect(internshipKeys.myApplications({}, 'u1')).not.toEqual(internshipKeys.myApplications({}, 'u2'))
        expect(internshipKeys.list({ type: 'internship' }, 'u1')).not.toEqual(internshipKeys.list({ type: 'internship' }, null))
        expect(internshipKeys.adminList({}, 'a')).not.toEqual(internshipKeys.adminList({}, 'b'))
        expect(internshipKeys.cohortApplications('c1', {}, 'a')).not.toEqual(internshipKeys.cohortApplications('c1', {}, 'b'))
        expect(internshipKeys.application('x', 'a')).not.toEqual(internshipKeys.application('x', 'b'))
    })

    it('keep the past showcase public: the same for everyone', () => {
        expect(internshipKeys.past({ limit: 6 })).toEqual(['internships', 'past', { limit: 6 }])
    })

    it('share a prefix so one invalidation reaches every viewer of a cohort', () => {
        const key = internshipKeys.detail('c1', 'u1')
        expect(key.slice(0, 3)).toEqual([...internshipKeys.details(), 'c1'])
        expect(internshipKeys.cohortApplications('c1', { page: 2 }, 'a').slice(0, 4)).toEqual(internshipKeys.cohortApplicationsOf('c1'))
    })
})

describe('reads', () => {
    it('loads the list under the signed-in user and pages with load more', async () => {
        api.listCohorts.mockResolvedValueOnce(page([{ _id: 'a' }], true)).mockResolvedValueOnce({ ...page([{ _id: 'b' }]), pagination: { page: 2, limit: 12, total: 2, totalPages: 2, hasMore: false } })
        const { result } = renderHook(() => useInternships({ type: 'internship' }), { wrapper })
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
        expect(api.listCohorts).toHaveBeenCalledWith({ limit: 12, type: 'internship', page: 1 })
        expect(result.current.hasNextPage).toBe(true)
        await act(async () => { await result.current.fetchNextPage() })
        expect(api.listCohorts).toHaveBeenLastCalledWith({ limit: 12, type: 'internship', page: 2 })
        expect(qc.getQueryData(internshipKeys.list({ limit: 12, type: 'internship', page: undefined }, 'u1'))).toBeDefined()
        await waitFor(() => expect(result.current.hasNextPage).toBe(false))
    })

    it('waits for the session before asking, because the answer depends on it', async () => {
        auth.current = { user: null, loading: true }
        const { result } = renderHook(() => useInternships(), { wrapper })
        await act(async () => { await Promise.resolve() })
        expect(api.listCohorts).not.toHaveBeenCalled()
        expect(result.current.fetchStatus).toBe('idle')
    })

    it('shows the server copy to a signed-in member only as a placeholder, until their own answer arrives', async () => {
        api.getCohort.mockResolvedValue(makeCohort({ viewer: viewer({ canApply: false }) }))
        const { result } = renderHook(() => useInternship(COHORT_ID, makeCohort({ viewer: null })), { wrapper })
        expect(result.current.data?.viewer).toBeNull() // the server copy is shown at once...
        expect(result.current.isPlaceholderData).toBe(true) // ...as a placeholder, never as the answer
        await waitFor(() => expect(result.current.data?.viewer?.canApply).toBe(false))
        expect(result.current.isPlaceholderData).toBe(false)
        expect(api.getCohort).toHaveBeenCalledTimes(1)
        expect(qc.getQueryData(internshipKeys.detail(COHORT_ID, 'u1'))).toBeDefined()
        expect(qc.getQueryData(internshipKeys.detail(COHORT_ID, null))).toBeUndefined()
    })

    it('keeps no cached answer when a signed-in member\'s own request fails, so the placeholder is not mistaken for it', async () => {
        api.getCohort.mockRejectedValue(new ApiError('down', 500, 'INTERNAL_ERROR'))
        const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
        const w = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
        const { result } = renderHook(() => useInternship(COHORT_ID, makeCohort({ viewer: null })), { wrapper: w })
        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.data).toBeUndefined()
    })

    it('does not refetch for an anonymous visitor right after the page rendered', async () => {
        auth.current = { user: null, loading: false }
        const { result } = renderHook(() => useInternship(COHORT_ID, makeCohort({ viewer: null })), { wrapper })
        expect(result.current.data?.title).toBe('Summer Security Internship')
        expect(result.current.isPlaceholderData).toBe(false)
        await new Promise((r) => setTimeout(r, 20))
        expect(api.getCohort).not.toHaveBeenCalled()
        expect(qc.getQueryData(internshipKeys.detail(COHORT_ID, null))).toBeDefined()
    })

    it('waits for the session before asking', () => {
        auth.current = { user: null, loading: true }
        renderHook(() => useInternship(COHORT_ID), { wrapper })
        expect(api.getCohort).not.toHaveBeenCalled()
    })

    it('does not retry a 404', async () => {
        api.getCohort.mockRejectedValue(new ApiError('nope', 404, 'INTERNSHIP_NOT_FOUND'))
        const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
        const w = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
        const { result } = renderHook(() => useInternship(COHORT_ID), { wrapper: w })
        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(api.getCohort).toHaveBeenCalledTimes(1)
    })

    it('does not ask for my applications while signed out', () => {
        auth.current = { user: null, loading: false }
        renderHook(() => useMyApplications(), { wrapper })
        expect(api.listMyApplications).not.toHaveBeenCalled()
    })
})

describe('apply', () => {
    it('shows the application on the cohort at once and refreshes the lists and my applications', async () => {
        qc.setQueryData(internshipKeys.detail(COHORT_ID, 'u1'), makeCohort())
        const spy = vi.spyOn(qc, 'invalidateQueries')
        api.applyToCohort.mockResolvedValue(makeMine({ status: 'pending' }))
        const { result } = renderHook(() => useApplyInternship(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: COHORT_ID, payload: { coverLetter: 'long enough letter', answers: [] } }) })

        const cached = qc.getQueryData<CohortDetail>(internshipKeys.detail(COHORT_ID, 'u1'))
        expect(cached?.viewer).toMatchObject({ canApply: false, userApplication: { status: 'pending' } })
        const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
        expect(keys).toContainEqual(internshipKeys.mine())
        expect(keys).toContainEqual(internshipKeys.lists())
        expect(keys).toContainEqual([...internshipKeys.details(), COHORT_ID])
        expect(keys).toContainEqual(internshipKeys.admin())
    })

    it('leaves the cache alone and hands the error to the form when the API refuses', async () => {
        qc.setQueryData(internshipKeys.detail(COHORT_ID, 'u1'), makeCohort())
        api.applyToCohort.mockRejectedValue(new ApiError('closed', 409, 'INTERNSHIP_CLOSED'))
        const { result } = renderHook(() => useApplyInternship(), { wrapper })
        let caught: unknown
        await act(async () => { await result.current.mutateAsync({ id: COHORT_ID, payload: { coverLetter: 'long enough letter', answers: [] } }).catch((e) => { caught = e }) })
        expect(qc.getQueryData<CohortDetail>(internshipKeys.detail(COHORT_ID, 'u1'))?.viewer?.canApply).toBe(true)
        expect(addToast).not.toHaveBeenCalled()
        expect(internshipErrorMessage(caught)).toMatch(/closed/i)
    })
})

describe('withdraw', () => {
    it('updates the application in every cached page, thanks the user and refreshes the cohort', async () => {
        const mine = makeMine({ status: 'accepted' })
        const key = internshipKeys.myApplications({}, 'u1')
        qc.setQueryData<InfiniteData<Page<MyApplication>, number>>(key, { pages: [page([mine])], pageParams: [1] })
        const spy = vi.spyOn(qc, 'invalidateQueries')
        api.withdrawApplication.mockResolvedValue({ ...mine, cohort: 'only-an-id', status: 'withdrawn' })
        const { result } = renderHook(() => useWithdrawApplication(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: mine._id, cohortId: COHORT_ID, reason: 'new job' }) })

        expect(api.withdrawApplication).toHaveBeenCalledWith(mine._id, 'new job')
        const cached = qc.getQueryData<InfiniteData<Page<MyApplication>, number>>(key)
        expect(cached?.pages[0].data[0].status).toBe('withdrawn')
        // the cohort summary of the card stays: the withdraw answer carries only its id
        expect(typeof cached?.pages[0].data[0].cohort).toBe('object')
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Your application was withdrawn.' })
        const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
        expect(keys).toContainEqual([...internshipKeys.details(), COHORT_ID])
        expect(keys).toContainEqual(internshipKeys.lists())
    })

    it('explains a refusal and reloads my applications', async () => {
        const spy = vi.spyOn(qc, 'invalidateQueries')
        api.withdrawApplication.mockRejectedValue(new ApiError('x', 409, 'INTERNSHIP_INVALID_TRANSITION', undefined, { from: 'rejected', to: 'withdrawn', allowed: [] }))
        const { result } = renderHook(() => useWithdrawApplication(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'a1' }).catch(() => undefined) })
        expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: expect.stringMatching(/already rejected/) })
        expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(internshipKeys.mine())
    })

    it('says "try again in a moment" for a rate limit', async () => {
        api.withdrawApplication.mockRejectedValue(new ApiError('slow down', 429))
        const { result } = renderHook(() => useWithdrawApplication(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'a1' }).catch(() => undefined) })
        expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: 'Too many requests. Try again in a moment.' })
    })
})

describe('staff', () => {
    beforeEach(() => { auth.current = { user: { id: 'staff1', role: 'moderator' }, loading: false } })

    it('stores the reviewed application and refreshes the table, the cohort counters and the public spots', async () => {
        const spy = vi.spyOn(qc, 'invalidateQueries')
        const updated = makeStaffApplication({ status: 'accepted' })
        api.changeApplicationStatus.mockResolvedValue(updated)
        const { result } = renderHook(() => useChangeApplicationStatus(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: updated._id, cohortId: COHORT_ID, status: 'accepted', note: 'welcome' }) })

        expect(api.changeApplicationStatus).toHaveBeenCalledWith(updated._id, { status: 'accepted', note: 'welcome' })
        expect(qc.getQueryData(internshipKeys.application(updated._id, 'staff1'))).toEqual(updated)
        const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
        expect(keys).toContainEqual(internshipKeys.cohortApplicationsOf(COHORT_ID))
        expect(keys).toContainEqual([...internshipKeys.details(), COHORT_ID])
        expect(keys).toContainEqual(internshipKeys.lists())
        expect(keys).toContainEqual(internshipKeys.admin())
    })

    it('reloads the application and the table when somebody else moved it first', async () => {
        const row = makeRow()
        const spy = vi.spyOn(qc, 'invalidateQueries')
        api.changeApplicationStatus.mockRejectedValue(new ApiError('x', 409, 'INTERNSHIP_INVALID_TRANSITION', undefined, { from: 'accepted', to: 'rejected', allowed: [] }))
        const { result } = renderHook(() => useChangeApplicationStatus(), { wrapper })
        let caught: unknown
        await act(async () => { await result.current.mutateAsync({ id: row._id, cohortId: COHORT_ID, status: 'rejected' }).catch((e) => { caught = e }) })
        const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
        expect(keys).toContainEqual(internshipKeys.application(row._id, 'staff1'))
        expect(keys).toContainEqual(internshipKeys.cohortApplicationsOf(COHORT_ID))
        expect(internshipErrorMessage(caught)).toMatch(/already accepted/)
    })

    it('reloads the cohort when accepting finds it full, so the button follows the real seats', async () => {
        const row = makeRow()
        const spy = vi.spyOn(qc, 'invalidateQueries')
        api.changeApplicationStatus.mockRejectedValue(new ApiError('full', 409, 'INTERNSHIP_FULL'))
        const { result } = renderHook(() => useChangeApplicationStatus(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: row._id, cohortId: COHORT_ID, status: 'accepted' }).catch(() => undefined) })
        const keys = spy.mock.calls.map((c) => c[0]?.queryKey)
        expect(keys).toContainEqual([...internshipKeys.details(), COHORT_ID])
        expect(keys).toContainEqual(internshipKeys.lists())
    })

    it('does not reload the cohort for an error that says nothing about seats', async () => {
        const row = makeRow()
        const spy = vi.spyOn(qc, 'invalidateQueries')
        api.changeApplicationStatus.mockRejectedValue(new ApiError('x', 409, 'INTERNSHIP_INVALID_TRANSITION', undefined, { from: 'accepted', to: 'rejected', allowed: [] }))
        const { result } = renderHook(() => useChangeApplicationStatus(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: row._id, cohortId: COHORT_ID, status: 'rejected' }).catch(() => undefined) })
        expect(spy.mock.calls.map((c) => c[0]?.queryKey)).not.toContainEqual([...internshipKeys.details(), COHORT_ID])
    })

    it('closes a cohort early by setting its status, then refreshes everything', async () => {
        const spy = vi.spyOn(qc, 'invalidateQueries')
        api.updateCohort.mockResolvedValue(makeCohort({ status: 'closed' }))
        const { result } = renderHook(() => useCloseCohort(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: COHORT_ID }) })
        expect(api.updateCohort).toHaveBeenCalledWith(COHORT_ID, { status: 'closed' })
        expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(internshipKeys.all)
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Applications are closed for this program.' })
    })
})
