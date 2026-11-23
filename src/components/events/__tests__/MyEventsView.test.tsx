import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

const replace = vi.fn()
let tabParam: string | null = null
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push: vi.fn() }),
    usePathname: () => '/my-events',
    useSearchParams: () => new URLSearchParams(tabParam ? `tab=${tabParam}` : ''),
}))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))

const lists = vi.hoisted(() => ({ registered: {} as Record<string, unknown>, other: {} as Record<string, unknown>, submitted: {} as Record<string, unknown> }))
const calls = vi.hoisted(() => ({ params: [] as unknown[] }))
const mut = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useEvents', () => ({
    useMyRegistrations: (params: { status?: string; scope?: string }, enabled: boolean) => { calls.params.push({ params, enabled }); return params.status === 'registered' ? lists.registered : lists.other },
    useMySubmissions: () => lists.submitted,
    useUnregisterFromEvent: () => mut,
    useLeaveWaitlist: () => mut,
    useSetReminder: () => mut,
}))

import { MyEventsView } from '../MyEventsView'

const page = (data: unknown[]) => ({ isLoading: false, isError: false, data: { pages: [{ data, pagination: { page: 1, limit: 12, total: data.length, hasMore: false } }] }, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() })

const registered = makeEvent({ viewer: viewer({ registered: true, canRegister: false, reminder: { offsetMinutes: 60, remindAt: '2026-12-05T16:00:00Z', sent: false } }) })
const rejected = makeEvent({ _id: 'r1', slug: 'rejected-ev', title: 'Rejected Ev', status: 'rejected', rejectionReason: 'Please add an agenda', viewer: undefined })
const pending = makeEvent({ _id: 'p1', slug: 'pending-ev', title: 'Pending Ev', status: 'pending', viewer: undefined })

beforeEach(() => {
    vi.clearAllMocks()
    calls.params = []
    tabParam = null
    useAuth.mockReturnValue({ user: { id: 'u1', role: 'user' }, loading: false })
    lists.registered = page([registered])
    lists.other = page([])
    lists.submitted = page([rejected, pending])
})

describe('MyEventsView', () => {
    it('sends a signed-out visitor to sign in and back', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        render(<MyEventsView />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fmy-events')
    })

    it('opens on the registered tab with reminder and cancel controls', () => {
        render(<MyEventsView />)
        expect(screen.getByRole('tab', { name: 'Registered' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Winter CTF Night')).toBeInTheDocument()
        expect(screen.getByLabelText('Reminder for Winter CTF Night')).toHaveValue('60')
        fireEvent.change(screen.getByLabelText('Reminder for Winter CTF Night'), { target: { value: '' } })
        expect(mut.mutate).toHaveBeenCalledWith({ id: registered._id, slug: registered.slug, offsetMinutes: null })
        expect(screen.getByRole('button', { name: 'Cancel registration' })).toBeInTheDocument()
    })

    it('shows the status and the rejection reason on submissions, with a way to edit and resubmit', () => {
        tabParam = 'submitted'
        render(<MyEventsView />)
        expect(screen.getByTestId('rejection-reason')).toHaveTextContent('Please add an agenda')
        expect(screen.getByRole('link', { name: 'Edit and send again' })).toHaveAttribute('href', '/events/rejected-ev/edit')
        expect(screen.getByText('Waiting for review')).toBeInTheDocument()
        expect(screen.getByText('Rejected')).toBeInTheDocument()
    })

    it('moves between tabs through the URL', () => {
        render(<MyEventsView />)
        fireEvent.click(screen.getByRole('tab', { name: 'Waitlisted' }))
        expect(replace).toHaveBeenCalledWith('/my-events?tab=waitlisted', { scroll: false })
    })

    it('lets a waitlisted member leave', () => {
        tabParam = 'waitlisted'
        lists.other = page([makeEvent({ viewer: viewer({ waitlisted: true, position: 2, canRegister: false }) })])
        render(<MyEventsView />)
        expect(screen.getByText('Waitlist #2')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Leave the waiting list' }))
        expect(mut.mutate).toHaveBeenCalledWith({ id: registered._id, slug: registered.slug })
    })

    it('offers feedback on a past event that allows it', () => {
        tabParam = 'past'
        lists.other = page([makeEvent({ status: 'ended', viewer: viewer({ registered: true, canRegister: false, canFeedback: true }) })])
        render(<MyEventsView />)
        expect(screen.getByRole('link', { name: 'Leave feedback' })).toBeInTheDocument()
    })

    it('shows loading, error and empty states', () => {
        lists.registered = { ...page([]), isLoading: true, data: undefined }
        const { rerender } = render(<MyEventsView />)
        expect(screen.getByRole('status', { name: 'Loading events' })).toBeInTheDocument()

        const refetch = vi.fn()
        lists.registered = { ...page([]), isError: true, error: new Error('Network down'), data: undefined, refetch }
        rerender(<MyEventsView />)
        expect(screen.getByRole('alert')).toHaveTextContent('Network down')
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()

        lists.registered = page([])
        rerender(<MyEventsView />)
        expect(screen.getByText('No upcoming events yet')).toBeInTheDocument()
    })
})
