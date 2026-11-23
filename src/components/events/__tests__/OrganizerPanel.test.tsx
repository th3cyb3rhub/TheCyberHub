import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

const attendees = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const mark = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const cancel = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useEvents', () => ({
    useEventAttendees: () => attendees.current,
    useMarkAttendance: () => mark,
    useCancelEvent: () => cancel,
}))

import { OrganizerPanel } from '../OrganizerPanel'

const rows = [
    { user: { _id: 'u1', username: 'ada', name: 'Ada L' }, status: 'registered', registeredAt: '2026-11-01', attendedAt: null, waitlistSeq: null },
    { user: { _id: 'u2', username: 'bob', name: 'Bob' }, status: 'attended', registeredAt: '2026-11-02', attendedAt: '2026-12-05', waitlistSeq: null },
    { user: { _id: 'u3', username: 'cy', name: 'Cy' }, status: 'waitlisted', registeredAt: '2026-11-03', attendedAt: null, waitlistSeq: 2 },
]
const ok = (data = rows) => ({ isLoading: false, isError: false, isSuccess: true, data: { data, pagination: { page: 1, limit: 100, total: data.length, pages: 1, hasMore: false } }, refetch: vi.fn() })
const event = makeEvent({ viewer: viewer({ canManage: true }) })
const BEFORE = new Date('2026-12-01T10:00:00Z')
const DURING = new Date('2026-12-05T17:30:00Z')

beforeEach(() => {
    vi.clearAllMocks()
    attendees.current = ok()
})

describe('OrganizerPanel', () => {
    it('lists who signed up, with their state', () => {
        render(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.getByText('3 people signed up')).toBeInTheDocument()
        expect(screen.getByText('Ada L')).toBeInTheDocument()
        expect(screen.getByText('Attended')).toBeInTheDocument()
        expect(screen.getByText('Waiting #2')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Edit event/ })).toHaveAttribute('href', '/events/winter-ctf-night/edit')
    })

    it('does not offer attendance before the event starts', () => {
        render(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.queryByRole('checkbox')).toBeNull()
        expect(screen.getByText(/once the event has started/)).toBeInTheDocument()
    })

    it('marks the selected registered members once the event is live', () => {
        render(<OrganizerPanel event={makeEvent({ status: 'live', viewer: viewer({ canManage: true }) })} now={DURING} />)
        const mine = screen.getByRole('checkbox', { name: 'Mark Ada L as attended' })
        // Only registered members can be marked
        expect(screen.queryByRole('checkbox', { name: /Bob/ })).toBeNull()
        fireEvent.click(mine)
        fireEvent.click(screen.getByRole('button', { name: /Mark 1 attended/ }))
        expect(mark.mutate).toHaveBeenCalledWith({ id: event._id, userIds: ['u1'] }, expect.any(Object))
    })

    it('selects everyone registered in one go', () => {
        render(<OrganizerPanel event={makeEvent({ status: 'live', viewer: viewer({ canManage: true }) })} now={DURING} />)
        fireEvent.click(screen.getByRole('checkbox', { name: 'Select everyone registered' }))
        fireEvent.click(screen.getByRole('button', { name: /Mark 1 attended/ }))
        expect(mark.mutate).toHaveBeenCalledWith({ id: event._id, userIds: ['u1'] }, expect.any(Object))
    })

    it('shows loading, error and empty states', () => {
        attendees.current = { isLoading: true, isError: false, isSuccess: false, data: undefined, refetch: vi.fn() }
        const { rerender } = render(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.getByRole('status', { name: 'Loading attendees' })).toBeInTheDocument()

        const refetch = vi.fn()
        attendees.current = { isLoading: false, isError: true, isSuccess: false, error: new ApiError('x', 403, 'AUTHZ_FORBIDDEN'), data: undefined, refetch }
        rerender(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.getByRole('alert')).toHaveTextContent('not allowed')
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()

        attendees.current = ok([])
        rerender(<OrganizerPanel event={event} now={BEFORE} />)
        expect(screen.getByText('Nobody has signed up yet.')).toBeInTheDocument()
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
