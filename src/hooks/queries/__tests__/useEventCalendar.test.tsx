import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'

const auth = vi.hoisted(() => ({ user: { id: 'u1', role: 'user' } as { id: string; role: string } | null }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const api = vi.hoisted(() => ({
    getCalendar: vi.fn(), listArchives: vi.fn(), getCalendarTokenStatus: vi.fn(), createCalendarToken: vi.fn(), revokeCalendarToken: vi.fn(),
    exportAttendees: vi.fn(), undoAttendance: vi.fn(), getSeries: vi.fn(), createSeries: vi.fn(), patchSeries: vi.fn(),
    pauseSeries: vi.fn(), resumeSeries: vi.fn(), endSeries: vi.fn(),
}))
vi.mock('@/lib/api/events', () => api)
const saveBlob = vi.hoisted(() => vi.fn())
vi.mock('@/lib/events/download', () => ({ saveBlob }))

import { eventKeys } from '../useEvents'
import {
    downloadAttendeesCsv, undoSummary, useCalendarToken, useCreateCalendarToken, useEventArchives, useEventsCalendar, useExportAttendees,
    useRevokeCalendarToken, useUndoAttendance,
} from '../useEventCalendar'
import { useEndSeries, useEventSeries, usePauseSeries } from '../useEventSeries'

let qc: QueryClient
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const SECRET = 'tchcal_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFG'
const created = { url: `https://api.example.test/api/events/me/calendar.ics?token=${SECRET}`, webcalUrl: `webcal://api.example.test/api/events/me/calendar.ics?token=${SECRET}`, createdAt: '2026-11-24T10:00:00.000Z', rotated: false }
const range = { from: '2026-11-30T00:00:00.000Z', to: '2027-01-10T23:59:59.999Z' }

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1', role: 'user' }
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
})

describe('query keys', () => {
    it('keeps the public calendar and archive free of the viewer and the private data per member', () => {
        expect(eventKeys.calendar(range, 'ctf')).toEqual(['events', 'calendar', range.from, range.to, 'ctf'])
        expect(JSON.stringify(eventKeys.calendar(range, ''))).not.toContain('u1')
        expect(eventKeys.archives({ q: 'web' })).toEqual(['events', 'archives', { q: 'web' }])
        expect(eventKeys.calendarToken('u1')).not.toEqual(eventKeys.calendarToken('u2'))
        expect(eventKeys.series('s1', 'u1')).not.toEqual(eventKeys.series('s1', 'u2'))
        expect(eventKeys.series('s1', null)).not.toEqual(eventKeys.series('s1', 'u2'))
    })

    it('sits under the events prefix so a write refreshes it', () => {
        for (const key of [eventKeys.calendar(range, ''), eventKeys.archives({}), eventKeys.calendarToken('u'), eventKeys.series('s', 'u')]) {
            expect(key[0]).toBe('events')
        }
    })
})

describe('useEventsCalendar', () => {
    it('asks for the range and the category and keeps the meta', async () => {
        api.getCalendar.mockResolvedValue({ items: [{ id: 'a' }], meta: { from: range.from, to: range.to, count: 1, truncated: false } })
        const { result } = renderHook(() => useEventsCalendar(range, 'ctf'), { wrapper })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(api.getCalendar).toHaveBeenCalledWith({ from: range.from, to: range.to, category: 'ctf' })
        expect(result.current.data?.items).toHaveLength(1)
        expect(qc.getQueryData(eventKeys.calendar(range, 'ctf'))).toBeDefined()
    })

    it('does not ask without a range, and shares one cache entry between members', async () => {
        const { result } = renderHook(() => useEventsCalendar(null), { wrapper })
        expect(result.current.fetchStatus).toBe('idle')
        expect(api.getCalendar).not.toHaveBeenCalled()
        api.getCalendar.mockResolvedValue({ items: [], meta: { from: '', to: '', count: 0, truncated: false } })
        const first = renderHook(() => useEventsCalendar(range), { wrapper })
        await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
        auth.user = { id: 'u2', role: 'user' }
        renderHook(() => useEventsCalendar(range), { wrapper })
        expect(api.getCalendar).toHaveBeenCalledTimes(1)
    })

    it('does not retry a rejected range', async () => {
        api.getCalendar.mockRejectedValue(new ApiError('bad', 400, 'VALIDATION_ERROR'))
        qc = new QueryClient()
        const { result } = renderHook(() => useEventsCalendar(range), { wrapper })
        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(api.getCalendar).toHaveBeenCalledTimes(1)
    })
})

describe('useEventArchives', () => {
    const page = (page: number, hasMore: boolean) => ({ data: [{ id: `p${page}` }], pagination: { page, limit: 12, hasMore } })

    it('follows hasMore for the next page and passes the filters', async () => {
        api.listArchives.mockImplementation(async (f: { page?: number }) => (f.page && f.page > 1 ? page(2, false) : page(1, true)))
        const { result } = renderHook(() => useEventArchives({ category: 'ctf', q: 'web' }), { wrapper })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(api.listArchives).toHaveBeenCalledWith({ limit: 12, category: 'ctf', q: 'web', page: 1 })
        expect(result.current.hasNextPage).toBe(true)
        await act(async () => { await result.current.fetchNextPage() })
        expect(api.listArchives).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
        await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
        expect(result.current.hasNextPage).toBe(false)
    })

    it('waits when disabled', () => {
        renderHook(() => useEventArchives({}, { enabled: false }), { wrapper })
        expect(api.listArchives).not.toHaveBeenCalled()
    })
})

describe('calendar feed token', () => {
    it('reads the status under the member key and forgets it after sign out', async () => {
        api.getCalendarTokenStatus.mockResolvedValue({ active: true, createdAt: 'c', rotatedAt: null, lastUsedAt: null })
        const { result, rerender } = renderHook(() => useCalendarToken(), { wrapper })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(qc.getQueryData(eventKeys.calendarToken('u1'))).toMatchObject({ active: true })
        auth.user = null
        rerender()
        await waitFor(() => expect(qc.getQueryData(eventKeys.calendarToken('u1'))).toBeUndefined())
    })

    it('does not ask when signed out', () => {
        auth.user = null
        renderHook(() => useCalendarToken(), { wrapper })
        expect(api.getCalendarTokenStatus).not.toHaveBeenCalled()
    })

    it('hands the address to the caller only: it is in no query, no mutation, no storage and no log', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        api.createCalendarToken.mockResolvedValue(created)
        const { result } = renderHook(() => useCreateCalendarToken(), { wrapper })

        let answer: typeof created | null = null
        await act(async () => { answer = await result.current.create() })
        expect(answer).toEqual(created)

        // What the dialog closing means: the component drops its copy. Nothing else holds one.
        const everything = JSON.stringify([
            qc.getQueryCache().getAll().map((q) => ({ key: q.queryKey, state: q.state })),
            qc.getMutationCache().getAll().map((m) => ({ state: m.state, options: m.options.mutationKey })),
            Object.entries(window.localStorage), Object.entries(window.sessionStorage),
            log.mock.calls, error.mock.calls, warn.mock.calls, addToast.mock.calls,
        ])
        expect(everything).not.toContain(SECRET)
        expect(everything).not.toContain('tchcal_')
        // The cache learns only that a feed exists
        expect(qc.getQueryData(eventKeys.calendarToken('u1'))).toMatchObject({ active: true, createdAt: created.createdAt })
        log.mockRestore(); error.mockRestore(); warn.mockRestore()
    })

    it('shows a friendly message when the server has no public address (503) and returns nothing', async () => {
        api.createCalendarToken.mockRejectedValue(new ApiError('down', 503))
        const { result } = renderHook(() => useCreateCalendarToken(), { wrapper })
        let answer: unknown = 'unset'
        await act(async () => { answer = await result.current.create() })
        expect(answer).toBeNull()
        expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: 'Calendar feed is not available right now. Please try again later.' })
        expect(result.current.error).toMatch(/not available/)
        expect(result.current.isPending).toBe(false)
    })

    it('revoking marks the feed off and says so', async () => {
        api.revokeCalendarToken.mockResolvedValue(undefined)
        const { result } = renderHook(() => useRevokeCalendarToken(), { wrapper })
        await act(async () => { await result.current.mutateAsync() })
        expect(qc.getQueryData(eventKeys.calendarToken('u1'))).toMatchObject({ active: false, lastUsedAt: null })
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success', message: expect.stringContaining('turned off') }))
    })
})

describe('organizer exports', () => {
    const file = { blob: new Blob(['x']), filename: 'winter-attendees.csv', truncated: false, rows: 12 }

    it('saves the file and keeps only a summary, never the file', async () => {
        api.exportAttendees.mockResolvedValue(file)
        const summary = await downloadAttendeesCsv('e1', 'winter')
        expect(api.exportAttendees).toHaveBeenCalledWith('e1', 'winter')
        expect(saveBlob).toHaveBeenCalledWith(file.blob, 'winter-attendees.csv')
        expect(summary).toEqual({ filename: 'winter-attendees.csv', rows: 12, truncated: false })
    })

    it('says so in the toast when the export was cut', async () => {
        api.exportAttendees.mockResolvedValue({ ...file, truncated: true, rows: 5000 })
        const { result } = renderHook(() => useExportAttendees(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'e1', slug: 'winter' }) })
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info', message: expect.stringContaining('first 5000 rows') }))
        expect(JSON.stringify(qc.getMutationCache().getAll().map((m) => m.state.data))).not.toContain('blob')
    })

    it('explains a refused export', async () => {
        api.exportAttendees.mockRejectedValue(new ApiError('no', 403, 'AUTHZ_FORBIDDEN'))
        const { result } = renderHook(() => useExportAttendees(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'e1', slug: 'w' }).catch(() => {}) })
        expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: expect.stringMatching(/organizer/) })
        expect(saveBlob).not.toHaveBeenCalled()
    })
})

describe('undo attendance', () => {
    it('writes the counts in a sentence', () => {
        expect(undoSummary({ undone: ['a', 'b'], notAttended: ['c'], notRegistered: [], pointsReversed: 20 })).toBe('2 attendances undone, 20 points taken back, 1 was not marked as attended.')
        expect(undoSummary({ undone: ['a'], notAttended: [], notRegistered: ['d', 'e'], pointsReversed: 1 })).toBe('1 attendance undone, 1 point taken back, 2 are not registered.')
        expect(undoSummary({ undone: [], notAttended: ['a'], notRegistered: [], pointsReversed: 0 })).toBe('Nothing was undone, 1 was not marked as attended.')
    })

    it('toasts the result and refreshes the attendee lists', async () => {
        api.undoAttendance.mockResolvedValue({ undone: ['u9'], notAttended: [], notRegistered: [], pointsReversed: 10 })
        const invalidate = vi.spyOn(qc, 'invalidateQueries')
        const { result } = renderHook(() => useUndoAttendance(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'e1', userIds: ['u9'] }) })
        expect(api.undoAttendance).toHaveBeenCalledWith('e1', ['u9'])
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: '1 attendance undone, 10 points taken back.' })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['events', 'attendees'] })
    })

    it('maps a refusal to a message', async () => {
        api.undoAttendance.mockRejectedValue(new ApiError('x', 403, 'AUTHZ_FORBIDDEN'))
        const { result } = renderHook(() => useUndoAttendance(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 'e1', userIds: ['u9'] }).catch(() => {}) })
        expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: 'You are not allowed to do that.' })
    })
})

describe('series hooks', () => {
    const series = { id: 's1', title: 'T', status: 'active' }

    it('keys the series by member and treats server data as stale', async () => {
        api.getSeries.mockResolvedValue({ ...series, counts: { generated: 1 } })
        const { result } = renderHook(() => useEventSeries('s1', series as never), { wrapper })
        expect(result.current.data).toMatchObject({ id: 's1' })
        await waitFor(() => expect(api.getSeries).toHaveBeenCalled())
        await waitFor(() => expect(qc.getQueryData(eventKeys.series('s1', 'u1'))).toMatchObject({ counts: { generated: 1 } }))
        expect(qc.getQueryData(eventKeys.series('s1', 'u2'))).toBeUndefined()
    })

    it('pausing puts the answer in the cache and toasts', async () => {
        api.pauseSeries.mockResolvedValue({ ...series, status: 'paused' })
        const { result } = renderHook(() => usePauseSeries(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 's1' }) })
        expect(qc.getQueryData(eventKeys.series('s1', 'u1'))).toMatchObject({ status: 'paused' })
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
    })

    it('ending tells how many dates were cancelled and removed', async () => {
        api.endSeries.mockResolvedValue({ ...series, status: 'ended', cancelled: 2, removed: 1 })
        const { result } = renderHook(() => useEndSeries(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 's1', reason: 'Break' }) })
        expect(api.endSeries).toHaveBeenCalledWith('s1', 'Break')
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: 'The series has ended. 2 upcoming occurrences were cancelled and the registered members told. 1 with no registrations was removed.' })
    })

    it('maps series errors', async () => {
        api.pauseSeries.mockRejectedValue(new ApiError('x', 409, 'SERIES_ENDED'))
        const { result } = renderHook(() => usePauseSeries(), { wrapper })
        await act(async () => { await result.current.mutateAsync({ id: 's1' }).catch(() => {}) })
        expect(addToast).toHaveBeenCalledWith({ variant: 'error', message: 'This series has ended, so it cannot be changed.' })
    })
})
