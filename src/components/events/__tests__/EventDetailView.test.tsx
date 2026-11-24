import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))
const q = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const idle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useEvents', () => ({
    useEvent: () => q.current,
    useApproveEvent: () => idle,
    useRejectEvent: () => idle,
    useRegisterForEvent: () => idle,
    useUnregisterFromEvent: () => idle,
    useJoinWaitlist: () => idle,
    useLeaveWaitlist: () => idle,
    useSetReminder: () => idle,
    useEventFeedback: () => ({ isLoading: false, isError: false, data: { feedback: [{ rating: 5, comment: 'Great night', submittedAt: '2026-12-06', author: 'Bob' }], totalReviews: 1, averageRating: 5 } }),
    useSubmitEventFeedback: () => idle,
    useEventAttendees: () => ({ isLoading: false, isError: false, isSuccess: true, hasNextPage: false, data: { pages: [{ data: [], pagination: { total: 0, hasMore: false } }] } }),
    useMarkAttendance: () => idle,
    useCancelEvent: () => idle,
}))
vi.mock('@/hooks/queries/useEventCalendar', () => ({
    useExportAttendees: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
    useUndoAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/components/ui/ReportContentButton', () => ({ ReportContentButton: ({ contentType, contentId }: { contentType: string; contentId: string }) => <button>Report {contentType} {contentId}</button> }))

import { EventDetailView } from '../EventDetailView'

const ok = (event: unknown) => ({ data: event, isError: false, isLoading: false, refetch: vi.fn() })

beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ user: { id: 'me', role: 'user' }, loading: false })
})

describe('EventDetailView', () => {
    it('shows the event times in the event zone and names it', () => {
        q.current = ok(makeEvent())
        render(<EventDetailView slug="winter-ctf-night" />)
        expect(screen.getByRole('heading', { level: 1, name: 'Winter CTF Night' })).toBeInTheDocument()
        expect(screen.getByText('Sat, Dec 5, 2026 · 6:00 PM – 8:00 PM GMT+1')).toBeInTheDocument()
        expect(screen.getByText('Event time zone: Europe/Berlin')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Report event 64b000000000000000000001' })).toBeInTheDocument()
    })

    it('shows the cancelled state with its reason and no way to register', () => {
        q.current = ok(makeEvent({ status: 'cancelled', cancelReason: 'Speaker is ill' }))
        render(<EventDetailView slug="x" />)
        expect(screen.getByText('This event was cancelled.')).toBeInTheDocument()
        expect(screen.getByText('Speaker is ill')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Register' })).toBeNull()
    })

    it('shows the recording, slides and feedback of an ended event', () => {
        q.current = ok(makeEvent({
            status: 'ended', startDate: '2020-01-01T10:00:00Z', endDate: '2020-01-01T12:00:00Z', endsAt: '2020-01-01T12:00:00Z',
            recordingLink: 'https://video.example.org/r', slidesLink: 'https://slides.example.org/s', hasRecording: true, hasSlides: true,
            averageRating: 5, ratingCount: 1, stats: { registered: 5, waitlisted: 0, attended: 4, spotsLeft: null, averageRating: 5, ratingCount: 1 },
            viewer: viewer({ registered: true, canRegister: false, canFeedback: true }),
        }))
        render(<EventDetailView slug="x" />)
        expect(screen.getByRole('link', { name: /Watch the recording/ })).toHaveAttribute('href', 'https://video.example.org/r')
        expect(screen.getByRole('link', { name: /View the slides/ })).toHaveAttribute('href', 'https://slides.example.org/s')
        expect(screen.getByTestId('feedback-form')).toBeInTheDocument()
        expect(screen.getByText('Great night')).toBeInTheDocument()
        expect(screen.queryByTestId('countdown')?.textContent).toMatch(/Ended/)
    })

    it('hides the feedback form from people who cannot leave feedback', () => {
        q.current = ok(makeEvent({ status: 'ended', startDate: '2020-01-01T10:00:00Z', endsAt: '2020-01-01T12:00:00Z', viewer: viewer({ canRegister: false, canFeedback: false }) }))
        render(<EventDetailView slug="x" />)
        expect(screen.queryByTestId('feedback-form')).toBeNull()
        expect(screen.getByTestId('feedback-section')).toBeInTheDocument()
    })

    it('never shows an unsafe link from the API', () => {
        q.current = ok(makeEvent({ status: 'ended', startDate: '2020-01-01T10:00:00Z', endsAt: '2020-01-01T12:00:00Z', recordingLink: 'javascript:alert(1)', slidesLink: 'https://slides.example.org/s' }))
        render(<EventDetailView slug="x" />)
        expect(screen.queryByRole('link', { name: /Watch the recording/ })).toBeNull()
        expect(screen.getByRole('link', { name: /View the slides/ })).toBeInTheDocument()
    })

    it('gives a reviewer approve and reject on a pending event', () => {
        useAuth.mockReturnValue({ user: { id: 'mod', role: 'moderator' }, loading: false })
        q.current = ok(makeEvent({ status: 'pending', viewer: viewer({ canRegister: false }) }))
        render(<EventDetailView slug="x" />)
        expect(screen.getByText('This event is waiting for review.')).toBeInTheDocument()
        expect(screen.getByTestId('review-bar')).toBeInTheDocument()
        expect(screen.queryByTestId('registration-panel')).toBeNull()
    })

    it('does not let a moderator review their own submission', () => {
        useAuth.mockReturnValue({ user: { id: 'mod', role: 'moderator' }, loading: false })
        q.current = ok(makeEvent({ status: 'pending', viewer: viewer({ canRegister: false, canManage: true }) }))
        render(<EventDetailView slug="x" />)
        expect(screen.queryByTestId('review-bar')).toBeNull()
    })

    it('tells the creator why a submission was rejected', () => {
        q.current = ok(makeEvent({ status: 'rejected', rejectionReason: 'Needs an agenda', viewer: viewer({ canRegister: false, canManage: true }) }))
        render(<EventDetailView slug="x" />)
        expect(screen.getByText(/Needs an agenda/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Edit and send it again' })).toHaveAttribute('href', '/events/winter-ctf-night/edit')
    })

    it('shows the organizer tools to the creator only', () => {
        q.current = ok(makeEvent({ viewer: viewer({ canManage: true }) }))
        const { unmount } = render(<EventDetailView slug="x" />)
        expect(screen.getByTestId('organizer-panel')).toBeInTheDocument()
        unmount()
        q.current = ok(makeEvent())
        render(<EventDetailView slug="x" />)
        expect(screen.queryByTestId('organizer-panel')).toBeNull()
    })

    it('shows not found for a 404, and an error with retry for anything else', () => {
        q.current = { data: undefined, isError: true, error: new ApiError('nope', 404), isLoading: false, refetch: vi.fn() }
        const { unmount } = render(<EventDetailView slug="x" />)
        expect(screen.getByRole('heading', { name: 'Event not found' })).toBeInTheDocument()
        unmount()
        q.current = { data: undefined, isError: true, error: new ApiError('Server is down', 500), isLoading: false, refetch: vi.fn() }
        render(<EventDetailView slug="x" />)
        expect(screen.getByRole('alert')).toHaveTextContent('Server is down')
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })

    it('shows a skeleton while loading', () => {
        q.current = { data: undefined, isError: false, isLoading: true, refetch: vi.fn() }
        render(<EventDetailView slug="x" />)
        expect(screen.getByRole('status', { name: 'Loading the event' })).toBeInTheDocument()
    })
})
