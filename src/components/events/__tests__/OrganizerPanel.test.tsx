import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

const attendees = vi.hoisted(() => ({ byStatus: {} as Record<string, unknown>, asked: [] as unknown[] }))
const mark = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const cancel = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useEvents', () => ({
    useEventAttendees: (_id: string, params: { status: string }) => { attendees.asked.push(params); return attendees.byStatus[params.status] },
    useMarkAttendance: () => mark,
    useCancelEvent: () => cancel,
}))

import { OrganizerPanel } from '../OrganizerPanel'

const person = (id: string, name: string, status: string, over: Record<string, unknown> = {}) =>
    ({ user: { _id: id, username: name.toLowerCase(), name }, status, registeredAt: '2026-11-01', attendedAt: status === 'attended' ? '2026-12-05' : null, waitlistSeq: null, ...over })
const ok = (data: unknown[], over: Record<string, unknown> = {}) => ({
    isLoading: false, isError: false, isSuccess: true, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    data: { pages: [{ data, pagination: { page: 1, limit: 50, total: data.length, pages: 1, hasMore: false } }] },
    ...over,
})
const event = makeEvent({ viewer: viewer({ canManage: true }) })
const BEFORE = new Date('2026-12-01T10:00:00Z')
const DURING = new Date('2026-12-05T17:30:00Z')
const live = () => makeEvent({ status: 'live', viewer: viewer({ canManage: true }) })

beforeEach(() => {
    vi.clearAllMocks()
    attendees.asked = []
    attendees.byStatus = {
        registered: ok([person('u1', 'Ada L', 'registered')]),
        attended: ok([person('u2', 'Bob', 'attended')]),
        waitlisted: ok([person('u3', 'Cy', 'waitlisted', { waitlistSeq: 7 }), person('u4', 'Di', 'waitlisted', { waitlistSeq: 9 })]),
    }
})

describe('OrganizerPanel', () => {
    it('asks for the registered members first and lists them', () => {
        render(<OrganizerPanel event={event} now={BEFORE} />)
        expect(attendees.asked[0]).toEqual({ status: 'registered' })
        expect(screen.getByText('1 person registered')).toBeInTheDocument()
        expect(screen.getByText('Ada L')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Edit event/ })).toHaveAttribute('href', '/events/winter-ctf-night/edit')
    })

    it('switches to the attended and waiting groups', () => {
        render(<OrganizerPanel event={event} now={BEFORE} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Attended' }))
        expect(attendees.asked).toContainEqual({ status: 'attended' })
        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(within(screen.getByRole('list')).getByText('Attended')).toBeInTheDocument()
    })

    it('numbers the waiting list by its order in the list, not the stored sequence', () => {
        render(<OrganizerPanel event={event} now={BEFORE} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Waiting list' }))
        expect(screen.getByText('#1')).toBeInTheDocument()
        expect(screen.getByText('#2')).toBeInTheDocument()
        expect(screen.queryByText('#7')).toBeNull()
    })

    it('loads more attendees when there are more pages', () => {
        const fetchNextPage = vi.fn()
        attendees.byStatus.registered = ok([person('u1', 'Ada L', 'registered')], {
            hasNextPage: true, fetchNextPage,
            data: { pages: [{ data: [person('u1', 'Ada L', 'registered')], pagination: { page: 1, limit: 50, total: 120, pages: 3, hasMore: true } }] },
        })
        render(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.getByText('Showing 1 of 120.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
        expect(fetchNextPage).toHaveBeenCalled()
    })

    it('does not offer attendance before the event starts', () => {
        render(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.queryByRole('checkbox')).toBeNull()
        expect(screen.getByText(/once the event has started/)).toBeInTheDocument()
    })

    it('marks the selected registered members once the event is live', () => {
        render(<OrganizerPanel event={live()} now={DURING} />)
        fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Ada L as attended' }))
        fireEvent.click(screen.getByRole('button', { name: /Mark 1 attended/ }))
        expect(mark.mutate).toHaveBeenCalledWith({ id: event._id, userIds: ['u1'] }, expect.any(Object))
    })

    it('does not offer to mark people who already attended', () => {
        render(<OrganizerPanel event={live()} now={DURING} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Attended' }))
        expect(screen.queryByRole('checkbox')).toBeNull()
    })

    it('selects everyone listed in one go', () => {
        render(<OrganizerPanel event={live()} now={DURING} />)
        fireEvent.click(screen.getByRole('checkbox', { name: 'Select everyone listed' }))
        fireEvent.click(screen.getByRole('button', { name: /Mark 1 attended/ }))
        expect(mark.mutate).toHaveBeenCalledWith({ id: event._id, userIds: ['u1'] }, expect.any(Object))
    })

    it('shows loading, error and empty states', () => {
        attendees.byStatus.registered = { isLoading: true, isError: false, isSuccess: false, data: undefined, refetch: vi.fn() }
        const { rerender } = render(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.getByRole('status', { name: 'Loading attendees' })).toBeInTheDocument()

        const refetch = vi.fn()
        attendees.byStatus.registered = { isLoading: false, isError: true, isSuccess: false, error: new ApiError('x', 403, 'AUTHZ_FORBIDDEN'), data: undefined, refetch }
        rerender(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.getByRole('alert')).toHaveTextContent('not allowed')
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()

        attendees.byStatus.registered = ok([])
        rerender(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.getByText('Nobody is registered right now.')).toBeInTheDocument()
    })

    it('needs a reason to cancel the event', () => {
        render(<OrganizerPanel event={event} now={BEFORE} />)
        fireEvent.click(screen.getByRole('button', { name: /Cancel event/ }))
        const dialog = screen.getByRole('dialog')
        const confirm = within(dialog).getByRole('button', { name: 'Cancel the event' })
        expect(confirm).toBeDisabled()
        fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Speaker is ill' } })
        expect(confirm).toBeEnabled()
        fireEvent.click(confirm)
        expect(cancel.mutate).toHaveBeenCalledWith({ id: event._id, reason: 'Speaker is ill' }, expect.any(Object))
    })

    it('does not list attendees for an event that is not public yet', () => {
        render(<OrganizerPanel event={makeEvent({ status: 'pending', viewer: viewer({ canManage: true }) })} now={BEFORE} />)
        expect(screen.getByText(/once the event is approved/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Cancel event/ })).toBeNull()
    })
})
