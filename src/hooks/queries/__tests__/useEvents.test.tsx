import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'user' }, loading: false }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const api = vi.hoisted(() => ({
    registerForEvent: vi.fn(), unregisterFromEvent: vi.fn(), joinWaitlist: vi.fn(), leaveWaitlist: vi.fn(), setReminder: vi.fn(),
    getEvent: vi.fn(), listEvents: vi.fn(),
}))
vi.mock('@/lib/api/events', () => api)

import { eventKeys, optimistic, useEvent, useEventList, useJoinWaitlist, useRegisterForEvent, useSetReminder, useUnregisterFromEvent } from '../useEvents'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const key = eventKeys.detail('winter-ctf-night', 'u1')
const target = { id: '64b000000000000000000001', slug: 'winter-ctf-night' }

beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    api.getEvent.mockResolvedValue(makeEvent())
})

describe('optimistic patches', () => {
    it('registering takes a seat', () => {
        const next = optimistic.register(makeEvent())
        expect(next).toMatchObject({ registeredCount: 43, spotsLeft: 17, isFull: false })
        expect(next.viewer).toMatchObject({ registered: true, canRegister: false })
    })
    it('taking the last seat makes the event full', () => {
        expect(optimistic.register(makeEvent({ spotsLeft: 1 }))).toMatchObject({ spotsLeft: 0, isFull: true })
    })
    it('joins the waiting list when the viewer can only wait', () => {
        const next = optimistic.register(makeEvent({ isFull: true, spotsLeft: 0, waitlistCount: 2, viewer: viewer({ canRegister: false, canJoinWaitlist: true }) }))
        expect(next).toMatchObject({ waitlistCount: 3, registeredCount: 42 })
        expect(next.viewer).toMatchObject({ waitlisted: true, position: 3 })
    })
    it('joins the waiting list on a full event even if the viewer block still says canRegister', () => {
        const next = optimistic.register(makeEvent({ isFull: true, spotsLeft: 0, waitlistCount: 0, viewer: viewer({ canRegister: true, canJoinWaitlist: false }) }))
        expect(next.viewer).toMatchObject({ waitlisted: true, registered: false })
        expect(next.registeredCount).toBe(42)
    })
    it('leaving gives the seat back', () => {
        const next = optimistic.unregister(makeEvent({ joinLink: 'https://x.org', viewer: viewer({ registered: true, canRegister: false }) }))
        expect(next).toMatchObject({ registeredCount: 41, spotsLeft: 19, joinLink: null })
        expect(next.viewer).toMatchObject({ registered: false, canRegister: true })
    })
    it('does not invent a seat count for an event without a limit', () => {
        expect(optimistic.register(makeEvent({ maxParticipants: null, spotsLeft: null })).spotsLeft).toBeNull()
    })
})

describe('registration mutations', () => {
    it('shows the registration at once and keeps it when the API agrees', async () => {
        qc.setQueryData(key, makeEvent())
        let release: (v: unknown) => void = () => {}
        api.registerForEvent.mockReturnValue(new Promise((r) => { release = r }))
        const { result } = renderHook(() => useRegisterForEvent(), { wrapper })

        act(() => { result.current.mutate(target) })
        await waitFor(() => expect(qc.getQueryData<ReturnType<typeof makeEvent>>(key)?.viewer?.registered).toBe(true))
        await act(async () => { release({ status: 'registered' }) })
        await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })))
    })

    it('rolls back and shows the reason when the API refuses', async () => {
        const before = makeEvent()
        qc.setQueryData(key, before)
        api.registerForEvent.mockRejectedValue(new ApiError('Full', 409, 'EVENT_FULL'))
        const { result } = renderHook(() => useRegisterForEvent(), { wrapper })

        await act(async () => { result.current.mutate(target) })
        await waitFor(() => expect(addToast).toHaveBeenCalled())
        expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: expect.stringContaining('full') })
        expect(qc.getQueryData(key)).toEqual(before)
    })

    it('rolls back a failed cancellation', async () => {
        const before = makeEvent({ viewer: viewer({ registered: true, canRegister: false }) })
        qc.setQueryData(key, before)
        api.unregisterFromEvent.mockRejectedValue(new ApiError('x', 409, 'EVENT_ALREADY_ATTENDED'))
        const { result } = renderHook(() => useUnregisterFromEvent(), { wrapper })
        await act(async () => { result.current.mutate(target) })
        await waitFor(() => expect(addToast).toHaveBeenCalled())
        expect(qc.getQueryData(key)).toEqual(before)
    })

    it('passes the activity feed choice to the API', async () => {
        api.registerForEvent.mockResolvedValue({ status: 'registered' })
        const { result } = renderHook(() => useRegisterForEvent(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ ...target, shareActivity: false }) })
        expect(api.registerForEvent).toHaveBeenCalledWith(target.id, { shareActivity: false })
    })

    it('tells the member when they landed on the waiting list', async () => {
        api.joinWaitlist.mockResolvedValue({ status: 'waitlisted', position: 4 })
        const { result } = renderHook(() => useJoinWaitlist(), { wrapper })
        await act(async () => { await result.current.mutateAsync(target) })
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: 'You are on the waiting list at position 4.' })
    })

    it('sets a reminder optimistically and rolls it back on failure', async () => {
        const before = makeEvent({ viewer: viewer({ registered: true, canRegister: false }) })
        qc.setQueryData(key, before)
        api.setReminder.mockRejectedValue(new ApiError('x', 409, 'EVENT_REMINDER_UNAVAILABLE'))
        const { result } = renderHook(() => useSetReminder(), { wrapper })
        await act(async () => { result.current.mutate({ ...target, offsetMinutes: 60 }) })
        await waitFor(() => expect(addToast).toHaveBeenCalled())
        expect(qc.getQueryData(key)).toEqual(before)
    })
})

describe('queries', () => {
    it('refetches server rendered data with the member token', async () => {
        const initial = makeEvent({ viewer: undefined })
        const { result } = renderHook(() => useEvent('winter-ctf-night', initial), { wrapper })
        expect(result.current.data).toEqual(initial)
        await waitFor(() => expect(api.getEvent).toHaveBeenCalledWith('winter-ctf-night'))
        await waitFor(() => expect(result.current.data?.viewer).toBeDefined())
    })

    it('loads list pages and stops when the API says there is no more', async () => {
        api.listEvents
            .mockResolvedValueOnce({ data: [makeEvent()], pagination: { page: 1, limit: 12, total: 2, hasMore: true } })
            .mockResolvedValueOnce({ data: [makeEvent({ _id: 'b' })], pagination: { page: 2, limit: 12, total: 2, hasMore: false } })
        const { result } = renderHook(() => useEventList({ scope: 'past', category: 'ctf' }), { wrapper })
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
        expect(api.listEvents).toHaveBeenLastCalledWith({ scope: 'past', category: 'ctf', limit: 12, page: 1 })
        expect(result.current.hasNextPage).toBe(true)
        await act(async () => { await result.current.fetchNextPage() })
        expect(api.listEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
        await waitFor(() => expect(result.current.hasNextPage).toBe(false))
    })
})
