import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import type { Series } from '@/types/event'

const auth = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }))
vi.mock('@/lib/events/clock', () => ({ useViewerZone: () => 'Asia/Kolkata', useNow: () => null }))
const query = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const mut = vi.hoisted(() => ({
    pause: { mutate: vi.fn(), isPending: false }, resume: { mutate: vi.fn(), isPending: false }, end: { mutate: vi.fn(), isPending: false },
    patch: { mutate: vi.fn(), isPending: false }, create: { mutate: vi.fn(), isPending: false },
}))
vi.mock('@/hooks/queries/useEventSeries', () => ({
    useEventSeries: () => query.current,
    usePauseSeries: () => mut.pause, useResumeSeries: () => mut.resume, useEndSeries: () => mut.end, usePatchSeries: () => mut.patch, useCreateSeries: () => mut.create,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

import { SeriesView } from '../SeriesView'
import { SeriesForm } from '../SeriesForm'

const series = (over: Partial<Series> = {}): Series => ({
    id: '64b000000000000000000009', title: 'Weekly CTF Night', description: 'Bring a **laptop**.', shortDescription: 'A beginner friendly CTF.', image: null, bannerImage: null,
    category: 'ctf', tags: [], format: 'online', location: 'Online', venue: null, registrationLink: null, organizer: 'TheCyberHub', organizerLogo: null,
    maxParticipants: 60, rsvpEnabled: true, waitlistEnabled: true, status: 'active', createdAt: '2026-11-01T00:00:00Z',
    recurrence: { rule: 'weekly', interval: 1, weekday: 4, weekOfMonth: null, startsOn: '2026-12-03', startTime: '19:00', timezone: 'Europe/London', durationMinutes: 120, until: null, count: null },
    nextOccurrences: [
        { id: 'o1', slug: 'weekly-ctf-night-2026-12-03', title: 'Weekly CTF Night', category: 'ctf', startDate: '2026-12-03T19:00:00.000Z', endDate: '2026-12-03T21:00:00.000Z', timezone: 'Europe/London', format: 'online', status: 'upcoming', isAllDay: false, seriesId: '64b000000000000000000009' },
        { id: 'o2', slug: 'weekly-ctf-night-2026-12-10', title: 'Weekly CTF Night', category: 'ctf', startDate: '2026-12-10T19:00:00.000Z', endDate: '2026-12-10T21:00:00.000Z', timezone: 'Europe/London', format: 'online', status: 'cancelled', isAllDay: false, seriesId: '64b000000000000000000009' },
    ],
    ...over,
})
const ok = (s: Series) => ({ data: s, isError: false, isLoading: false, refetch: vi.fn() })
const manageable = () => series({ counts: { generated: 8, overridden: 1, pending: 3 }, generateAheadDays: 60, lastGeneratedAt: '2026-11-24T06:00:00.000Z', eventLink: null, streamLink: null })

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = null
    query.current = ok(series())
})

describe('SeriesView (public)', () => {
    it('shows the schedule in plain words, the status and the next dates in event and viewer time', () => {
        render(<SeriesView id="64b000000000000000000009" />)
        expect(screen.getByRole('heading', { level: 1, name: 'Weekly CTF Night' })).toBeInTheDocument()
        expect(screen.getByTestId('series-rule')).toHaveTextContent('Every Thursday at 19:00 Europe/London')
        expect(screen.getByText('Running')).toBeInTheDocument()
        const dates = within(screen.getByTestId('occurrences')).getAllByRole('listitem')
        expect(dates).toHaveLength(2)
        expect(within(dates[0]).getByRole('link', { name: 'Weekly CTF Night' })).toHaveAttribute('href', '/events/weekly-ctf-night-2026-12-03')
        // Event time first, then the viewer's zone (Kolkata)
        expect(dates[0]).toHaveTextContent('7:00 PM GMT')
        expect(dates[0]).toHaveTextContent('Your time: Fri, Dec 4 · 12:30 AM GMT+5:30')
        expect(within(dates[1]).getByText('Cancelled')).toBeInTheDocument()
    })

    it('has no management for the public or for a signed in member', () => {
        auth.user = { id: 'u1', role: 'user' }
        render(<SeriesView id="x" />)
        expect(screen.queryByTestId('series-manage')).not.toBeInTheDocument()
    })

    it('says so for a paused series and an ended one', () => {
        query.current = ok(series({ status: 'paused', nextOccurrences: [] }))
        const { rerender } = render(<SeriesView id="x" />)
        expect(screen.getByText('Paused')).toBeInTheDocument()
        expect(screen.getByTestId('no-occurrences')).toHaveTextContent(/paused/)
        query.current = ok(series({ status: 'ended', nextOccurrences: [] }))
        rerender(<SeriesView id="x" />)
        expect(screen.getByTestId('no-occurrences')).toHaveTextContent(/has ended/)
    })

    it('shows not found and error states', () => {
        query.current = { data: undefined, isError: true, error: new ApiError('x', 404, 'SERIES_NOT_FOUND'), refetch: vi.fn() }
        const { rerender } = render(<SeriesView id="x" />)
        expect(screen.getByRole('heading', { name: 'Series not found' })).toBeInTheDocument()
        const refetch = vi.fn()
        query.current = { data: undefined, isError: true, error: new ApiError('x', 500), refetch }
        rerender(<SeriesView id="x" />)
        fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
        expect(refetch).toHaveBeenCalled()
    })

    it('renders the description as sanitised text, not markup from the API', () => {
        query.current = ok(series({ description: 'Hello <img src=x onerror=alert(1)> **bold**' }))
        render(<SeriesView id="x" />)
        expect(document.querySelector('img[onerror]')).toBeNull()
        expect(screen.getByText('bold')).toBeInTheDocument()
    })
})

describe('series management', () => {
    it('shows counts and the review note to a moderator, and lets an administrator manage without the note', () => {
        auth.user = { id: 'm1', role: 'moderator' }
        query.current = ok(manageable())
        const { rerender } = render(<SeriesView id="x" />)
        const panel = screen.getByTestId('series-manage')
        expect(within(panel).getByTestId('pending-count')).toHaveTextContent('3')
        expect(within(panel).getByTestId('review-note')).toHaveTextContent('Occurrences wait for review')
        expect(within(panel).getByRole('link', { name: 'Open the review queue' })).toHaveAttribute('href', '/admin/events')
        auth.user = { id: 'a1', role: 'admin' }
        rerender(<SeriesView id="x" />)
        expect(screen.queryByTestId('review-note')).not.toBeInTheDocument()
    })

    it('does not show management to a moderator who is not the creator (the API sends no counts)', () => {
        auth.user = { id: 'm2', role: 'moderator' }
        query.current = ok(series())
        render(<SeriesView id="x" />)
        expect(screen.queryByTestId('series-manage')).not.toBeInTheDocument()
    })

    it('asks before it pauses, and then pauses', () => {
        auth.user = { id: 'a1', role: 'admin' }
        query.current = ok(manageable())
        render(<SeriesView id="x" />)
        fireEvent.click(screen.getByRole('button', { name: /Pause/ }))
        expect(mut.pause.mutate).not.toHaveBeenCalled()
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Pause this series?' })).getByRole('button', { name: 'Pause' }))
        expect(mut.pause.mutate).toHaveBeenCalledWith({ id: series().id }, expect.any(Object))
    })

    it('offers Resume for a paused series', () => {
        auth.user = { id: 'a1', role: 'admin' }
        query.current = ok({ ...manageable(), status: 'paused' })
        render(<SeriesView id="x" />)
        fireEvent.click(screen.getByRole('button', { name: /Resume/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resume' }))
        expect(mut.resume.mutate).toHaveBeenCalled()
    })

    it('needs a reason to end the series, and sends it', () => {
        auth.user = { id: 'a1', role: 'admin' }
        query.current = ok(manageable())
        render(<SeriesView id="x" />)
        fireEvent.click(screen.getByRole('button', { name: /End the series/ }))
        const dialog = screen.getByRole('dialog', { name: 'End this series for good?' })
        const confirm = within(dialog).getByRole('button', { name: 'End the series' })
        expect(confirm).toBeDisabled()
        fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Taking a break' } })
        fireEvent.click(confirm)
        expect(mut.end.mutate).toHaveBeenCalledWith({ id: series().id, reason: 'Taking a break' }, expect.any(Object))
    })

    it('has no actions for an ended series', () => {
        auth.user = { id: 'a1', role: 'admin' }
        query.current = ok({ ...manageable(), status: 'ended' })
        render(<SeriesView id="x" />)
        expect(screen.queryByRole('button', { name: /Pause|Edit|End the series/ })).not.toBeInTheDocument()
    })

    it('edits only the future scope by default and sends only the changed field', () => {
        auth.user = { id: 'a1', role: 'admin' }
        query.current = ok(manageable())
        render(<SeriesView id="x" />)
        fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
        const dialog = screen.getByRole('dialog', { name: 'Edit the series' })
        expect(within(dialog).getByRole('radio', { name: /This and all future dates/ })).toBeChecked()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
        expect(within(dialog).getByRole('alert')).toHaveTextContent('Nothing has changed yet.')
        fireEvent.change(within(dialog).getByLabelText('Start time'), { target: { value: '20:00' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
        expect(mut.patch.mutate).toHaveBeenCalledWith({ id: series().id, payload: { scope: 'future', startTime: '20:00' } }, expect.any(Object))
    })

    it('edits one date: the scope, the occurrence and the move', () => {
        auth.user = { id: 'a1', role: 'admin' }
        query.current = ok(manageable())
        render(<SeriesView id="x" />)
        fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
        const dialog = screen.getByRole('dialog', { name: 'Edit the series' })
        fireEvent.click(within(dialog).getByRole('radio', { name: /Only one date/ }))
        fireEvent.change(within(dialog).getByLabelText('Which date'), { target: { value: 'o2' } })
        fireEvent.change(within(dialog).getByLabelText('Move to date'), { target: { value: '2026-12-11' } })
        fireEvent.change(within(dialog).getByLabelText('Move to time'), { target: { value: '18:00' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
        expect(mut.patch.mutate).toHaveBeenCalledWith({ id: series().id, payload: { scope: 'this', eventId: 'o2', startDate: '2026-12-11T18:00:00.000Z' } }, expect.any(Object))
    })

    it('shows what the API says when a save fails', () => {
        auth.user = { id: 'a1', role: 'admin' }
        query.current = ok(manageable())
        mut.patch.mutate.mockImplementation((_v, o) => o.onError(new ApiError('x', 409, 'SERIES_OCCURRENCE_EXISTS')))
        render(<SeriesView id="x" />)
        fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
        const dialog = screen.getByRole('dialog', { name: 'Edit the series' })
        fireEvent.change(within(dialog).getByLabelText('Start time'), { target: { value: '20:00' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
        expect(within(dialog).getByRole('alert')).toHaveTextContent('Another occurrence of this series already starts at that time.')
    })
})

describe('SeriesForm', () => {
    const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

    it('shows the validation errors and sends nothing', () => {
        render(<SeriesForm admin={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Create the series' }))
        expect(screen.getByRole('alert')).toHaveTextContent(/Some fields need your attention/)
        expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument()
        expect(screen.getByText('Pick a category')).toBeInTheDocument()
        expect(screen.getByText('Pick the first date')).toBeInTheDocument()
        expect(mut.create.mutate).not.toHaveBeenCalled()
    })

    it('tells a moderator that dates wait for review', () => {
        render(<SeriesForm admin={false} />)
        expect(screen.getByTestId('review-note')).toHaveTextContent('Occurrences wait for review')
        expect(render(<SeriesForm admin />).container.querySelectorAll('[data-testid="review-note"]')).toHaveLength(0)
    })

    it('previews the rule in words and sends a valid payload', () => {
        render(<SeriesForm admin />)
        fill(/^Title/, 'Weekly CTF Night')
        fill(/^Description/, 'Bring a laptop.')
        fill(/^Category/, 'ctf')
        const start = new Date()
        start.setUTCDate(start.getUTCDate() + 10)
        fill(/^First date/, start.toISOString().slice(0, 10))
        fill(/^Time zone/, 'Europe/London')
        expect(screen.getByTestId('rule-preview')).toHaveTextContent('Every Thursday at 19:00 Europe/London')
        fill(/How often/, 'monthly-by-weekday')
        fill(/Which one of the month/, '-1')
        expect(screen.getByTestId('rule-preview')).toHaveTextContent('On the last Thursday of every month at 19:00 Europe/London')
        fireEvent.click(screen.getByRole('button', { name: 'Create the series' }))
        expect(mut.create.mutate).toHaveBeenCalledTimes(1)
        const payload = mut.create.mutate.mock.calls[0][0]
        expect(payload).toMatchObject({ title: 'Weekly CTF Night', category: 'ctf', recurrence: { rule: 'monthly-by-weekday', weekOfMonth: -1, weekday: 4, timezone: 'Europe/London' } })
    })

    it('puts an API field error on the field it belongs to', async () => {
        mut.create.mutate.mockImplementation((_p, o) => o.onError(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'recurrence.startsOn', message: 'startsOn is too far ahead' }])))
        render(<SeriesForm admin />)
        fill(/^Title/, 'Weekly CTF Night')
        fill(/^Description/, 'Bring a laptop.')
        fill(/^Category/, 'ctf')
        const start = new Date()
        start.setUTCDate(start.getUTCDate() + 10)
        fill(/^First date/, start.toISOString().slice(0, 10))
        fireEvent.click(screen.getByRole('button', { name: 'Create the series' }))
        await waitFor(() => expect(document.getElementById('sf-startsOn-error')).toHaveTextContent('startsOn is too far ahead'))
        expect(screen.getByLabelText(/^First date/)).toHaveAttribute('aria-invalid', 'true')
    })

    it('shows the result with a link to the series', () => {
        mut.create.mutate.mockImplementation((_p, o) => o.onSuccess({ ...series(), generated: 8 }))
        render(<SeriesForm admin={false} />)
        fill(/^Title/, 'Weekly CTF Night')
        fill(/^Description/, 'Bring a laptop.')
        fill(/^Category/, 'ctf')
        const start = new Date()
        start.setUTCDate(start.getUTCDate() + 10)
        fill(/^First date/, start.toISOString().slice(0, 10))
        fireEvent.click(screen.getByRole('button', { name: 'Create the series' }))
        const done = screen.getByTestId('series-created')
        expect(done).toHaveTextContent('8 dates were created.')
        expect(done).toHaveTextContent('wait for review')
        expect(within(done).getByRole('link', { name: 'Open the series' })).toHaveAttribute('href', '/events/series/64b000000000000000000009')
    })
})
