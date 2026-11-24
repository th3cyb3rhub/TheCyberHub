import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeMentorship, makeMessage, makeRequest } from '@/lib/mentorship/__tests__/fixtures'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', username: 'grace', role: 'user' }, loading: false }) }))
vi.mock('@/context/NotificationProvider', () => ({ useNotificationSocket: () => ({ connected: false, socket: null }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const api = vi.hoisted(() => ({
    sendMessage: vi.fn(), pauseMentorship: vi.fn(), resumeMentorship: vi.fn(), cancelRequest: vi.fn(), listMessages: vi.fn(), getMentorship: vi.fn(),
}))
vi.mock('@/lib/api/mentorship', () => api)

import { mentorshipKeys, optimisticMentorship, flattenMessagePages, useCancelRequest, useMessages, useSendMessage, useToggleMentorshipPause } from '../useMentorship'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const mid = '64b0000000000000000000b1'

beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('query keys', () => {
    it('start with mentorship and carry the user id', () => {
        const keys = [
            mentorshipKeys.mentors({}, 'u1'), mentorshipKeys.mentor('a', 'u1'), mentorshipKeys.eligibility('u1'), mentorshipKeys.requests('u1'),
            mentorshipKeys.list({}, 'u1'), mentorshipKeys.detail('a', 'u1'), mentorshipKeys.summary('u1'), mentorshipKeys.messages('a', 'u1'),
            mentorshipKeys.sessionList('a', 'all', 'u1'), mentorshipKeys.feedback('a', 'u1'), mentorshipKeys.applications({}, 'u1'), mentorshipKeys.reported('u1'),
        ]
        for (const key of keys) {
            expect(key[0]).toBe('mentorship')
            expect(key).toContain('u1')
        }
    })
    it('differ between two members', () => {
        expect(mentorshipKeys.messages(mid, 'u1')).not.toEqual(mentorshipKeys.messages(mid, 'u2'))
    })
})

describe('optimistic patches', () => {
    it('pausing turns chat and scheduling off and offers resume', () => {
        const next = optimisticMentorship.pause(makeMentorship())
        expect(next.status).toBe('paused')
        expect(next.viewer).toMatchObject({ canPause: false, canResume: true, canMessage: false, canSchedule: false })
    })
    it('resuming undoes it', () => {
        const next = optimisticMentorship.resume(optimisticMentorship.pause(makeMentorship()))
        expect(next.status).toBe('active')
        expect(next.viewer).toMatchObject({ canPause: true, canResume: false, canMessage: true })
    })
})

describe('pause and resume', () => {
    it('shows the pause at once and rolls back when the API refuses', async () => {
        const key = mentorshipKeys.detail(mid, 'u1')
        qc.setQueryData(key, makeMentorship())
        let reject: (e: unknown) => void = () => {}
        api.pauseMentorship.mockReturnValue(new Promise((_, r) => { reject = r }))
        const { result } = renderHook(() => useToggleMentorshipPause(mid), { wrapper })
        act(() => { result.current.mutate({ pause: true, reason: 'Exams' }) })
        await waitFor(() => expect((qc.getQueryData(key) as { status: string }).status).toBe('paused'))
        await act(async () => { reject(new ApiError('Not allowed', 409, 'MENTORSHIP_NOT_ACTIVE')) })
        await waitFor(() => expect((qc.getQueryData(key) as { status: string }).status).toBe('active'))
        expect(addToast).toHaveBeenCalled()
    })
})

describe('cancel request', () => {
    it('marks it cancelled at once and restores it on failure', async () => {
        const key = mentorshipKeys.myRequests({}, 'u1')
        qc.setQueryData(key, { pages: [{ data: [makeRequest({ _id: 'r1', status: 'matched' })], pagination: { page: 1, limit: 20, total: 1, pages: 1 } }], pageParams: [1] })
        api.cancelRequest.mockRejectedValue(new ApiError('Nope', 409, 'REQUEST_NOT_OPEN'))
        const { result } = renderHook(() => useCancelRequest(), { wrapper })
        await act(async () => { result.current.mutate({ id: 'r1' }) })
        await waitFor(() => expect(result.current.isError).toBe(true))
        const data = qc.getQueryData(key) as { pages: { data: { status: string }[] }[] }
        expect(data.pages[0].data[0].status).toBe('matched')
    })
})

describe('sending a message', () => {
    const key = mentorshipKeys.messages(mid, 'u1')
    const seed = () => qc.setQueryData(key, { pages: [{ data: [makeMessage({ _id: 'old' })], pagination: { limit: 30, hasMore: false, nextBefore: null } }], pageParams: [undefined] })
    const list = () => flattenMessagePages(qc.getQueryData(key))

    it('shows the message while it is sending, then swaps in the saved one', async () => {
        seed()
        let resolve: (m: unknown) => void = () => {}
        api.sendMessage.mockReturnValue(new Promise((r) => { resolve = r }))
        const { result } = renderHook(() => useSendMessage(mid), { wrapper })
        act(() => { result.current.mutate({ content: 'Hi', contentType: 'text' }) })
        await waitFor(() => expect(list().some((m) => m.pending === 'sending')).toBe(true))
        await act(async () => { resolve(makeMessage({ _id: 'saved', content: 'Hi' })) })
        await waitFor(() => expect(list().map((m) => m._id)).toEqual(['old', 'saved']))
    })

    it('keeps a failed message in the list, marked as failed, and shows the error', async () => {
        seed()
        api.sendMessage.mockRejectedValue(new ApiError('Paused', 409, 'MENTORSHIP_NOT_ACTIVE'))
        const { result } = renderHook(() => useSendMessage(mid), { wrapper })
        await act(async () => { result.current.mutate({ content: 'Hi', contentType: 'text' }) })
        await waitFor(() => expect(list().some((m) => m.pending === 'failed')).toBe(true))
        expect(addToast).toHaveBeenCalled()
    })
})

describe('messages', () => {
    it('are listed oldest first, with older pages above', async () => {
        // Within a page the API sends oldest first; page 0 is the newest page
        api.listMessages.mockResolvedValue({ data: [makeMessage({ _id: 'a', createdAt: '2026-12-01T10:00:00Z' }), makeMessage({ _id: 'b', createdAt: '2026-12-01T10:05:00Z' })], pagination: { limit: 30, hasMore: false, nextBefore: null } })
        const { result } = renderHook(() => useMessages(mid), { wrapper })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(flattenMessagePages(result.current.data).map((m) => m._id)).toEqual(['a', 'b'])
    })
})
