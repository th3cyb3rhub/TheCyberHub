import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))

const queue = vi.hoisted(() => ({ current: {} as Record<string, unknown>, status: '' }))
const approve = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const reject = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const idle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useEvents', () => ({
    useReviewQueue: (status: string) => { queue.status = status; return queue.current },
    useEventPage: () => ({ data: { pagination: { total: 2 } } }),
    useApproveEvent: () => approve,
    useRejectEvent: () => reject,
    useCancelEvent: () => idle,
    useDeleteEvent: () => idle,
    useToggleFeatured: () => idle,
}))

import { AdminEventsView } from '../AdminEventsView'

const pending = makeEvent({ _id: 'p1', slug: 'pending-one', title: 'Pending One', status: 'pending', createdAt: '2026-11-20T10:00:00Z', viewer: undefined })
const rejected = makeEvent({ _id: 'r1', slug: 'rejected-one', title: 'Rejected One', status: 'rejected', rejectionReason: 'Too vague', viewer: undefined })
const page = (data: unknown[]) => ({ isLoading: false, isError: false, data: { pages: [{ data, pagination: { page: 1, limit: 20, total: data.length, hasMore: false } }] }, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() })

beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ user: { id: 'm1', role: 'moderator' }, loading: false })
    queue.current = page([pending, rejected])
})

describe('access control', () => {
    it('sends a signed-out visitor to sign in and back', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        render(<AdminEventsView />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fadmin%2Fevents')
        expect(screen.queryByText('Event review')).toBeNull()
    })
    it('keeps ordinary members out', () => {
        useAuth.mockReturnValue({ user: { id: 'u', role: 'user' }, loading: false })
        render(<AdminEventsView />)
        expect(screen.getByText('You cannot open this page')).toBeInTheDocument()
        expect(screen.queryByTestId('queue-row')).toBeNull()
    })
    it('waits while the session loads', () => {
        useAuth.mockReturnValue({ user: null, loading: true })
        render(<AdminEventsView />)
        expect(replace).not.toHaveBeenCalled()
        expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    })
})

describe('review queue', () => {
    it('opens on the pending tab, with the count', () => {
        render(<AdminEventsView />)
        expect(queue.status).toBe('pending')
        expect(screen.getByRole('tab', { name: /Pending/ })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('tab', { name: /Pending/ })).toHaveTextContent('2')
        expect(screen.getAllByTestId('queue-row')).toHaveLength(2)
    })

    it('lets a moderator approve, but not edit or delete', () => {
        render(<AdminEventsView />)
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
        expect(approve.mutate).toHaveBeenCalledWith({ id: 'p1' })
        expect(screen.queryByRole('link', { name: /Edit/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
    })

    it('does not let a moderator approve their own submission, but an administrator can', () => {
        const own = makeEvent({ _id: 'p9', slug: 'mine', title: 'Mine', status: 'pending', viewer: viewer({ canManage: true }) })
        queue.current = page([own])
        const { unmount } = render(<AdminEventsView />)
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
        expect(screen.getByTestId('own-submission')).toHaveTextContent('another reviewer')
        unmount()
        useAuth.mockReturnValue({ user: { id: 'a1', role: 'admin' }, loading: false })
        render(<AdminEventsView />)
        expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    })

    it('rejects with a reason of at least five characters', () => {
        render(<AdminEventsView />)
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
        const dialog = screen.getByRole('dialog')
        const confirm = within(dialog).getByRole('button', { name: 'Reject' })
        fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'no' } })
        expect(confirm).toBeDisabled()
        fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Needs a clear agenda' } })
        fireEvent.click(confirm)
        expect(reject.mutate).toHaveBeenCalledWith({ id: 'p1', reason: 'Needs a clear agenda' }, expect.any(Object))
    })

    it('shows the rejection reason on rejected events', () => {
        render(<AdminEventsView />)
        expect(screen.getByText('Reason: Too vague')).toBeInTheDocument()
    })

    it('gives administrators the extra controls', () => {
        useAuth.mockReturnValue({ user: { id: 'a1', role: 'admin' }, loading: false })
        render(<AdminEventsView />)
        expect(screen.getAllByRole('link', { name: /Edit/ })[0]).toHaveAttribute('href', '/admin/events/p1/edit')
        expect(screen.getByRole('link', { name: /New event/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Delete Pending One' })).toBeInTheDocument()
    })

    it('switches the filter', () => {
        render(<AdminEventsView />)
        fireEvent.click(screen.getByRole('tab', { name: 'Rejected' }))
        expect(queue.status).toBe('rejected')
        fireEvent.click(screen.getByRole('tab', { name: 'All' }))
        expect(queue.status).toBe('')
    })

    it('shows loading, error and empty states', () => {
        queue.current = { ...page([]), isLoading: true, data: undefined }
        const { rerender } = render(<AdminEventsView />)
        expect(screen.getByRole('status', { name: 'Loading events' })).toBeInTheDocument()

        const refetch = vi.fn()
        queue.current = { ...page([]), isError: true, error: new Error('Network down'), data: undefined, refetch }
        rerender(<AdminEventsView />)
        expect(screen.getByRole('alert')).toHaveTextContent('Network down')
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()

        queue.current = page([])
        rerender(<AdminEventsView />)
        expect(screen.getByText('Nothing waiting for review')).toBeInTheDocument()
    })
})

describe('series occurrences', () => {
    const occurrence = makeEvent({ _id: 'o1', slug: 'weekly-2026-12-10', title: 'Weekly Night', status: 'upcoming', seriesId: '64b000000000000000000009', viewer: undefined })

    it('links the series, cancels the occurrence and offers no delete', () => {
        useAuth.mockReturnValue({ user: { id: 'a1', role: 'admin' }, loading: false })
        queue.current = page([occurrence, makeEvent({ _id: 'n1', slug: 'plain', title: 'Plain', viewer: undefined })])
        render(<AdminEventsView />)
        const rows = screen.getAllByTestId('queue-row')
        expect(within(rows[0]).getByRole('link', { name: /Series/ })).toHaveAttribute('href', '/events/series/64b000000000000000000009')
        expect(within(rows[0]).getByRole('button', { name: 'Cancel this occurrence' })).toBeInTheDocument()
        expect(within(rows[0]).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
        expect(within(rows[1]).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(within(rows[1]).getByRole('button', { name: /Delete Plain/ })).toBeInTheDocument()
    })

    it('explains that only this date is cancelled', () => {
        useAuth.mockReturnValue({ user: { id: 'a1', role: 'admin' }, loading: false })
        queue.current = page([occurrence])
        render(<AdminEventsView />)
        fireEvent.click(screen.getByRole('button', { name: 'Cancel this occurrence' }))
        expect(screen.getByRole('dialog')).toHaveTextContent('Only this date is cancelled and the series goes on.')
    })

    it('links to the series screen for staff', () => {
        render(<AdminEventsView />)
        expect(screen.getByRole('link', { name: /Recurring series/ })).toHaveAttribute('href', '/admin/events/series')
    })
})
