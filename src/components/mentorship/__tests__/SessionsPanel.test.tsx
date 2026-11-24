import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMentorship, makeSession, viewer } from '@/lib/mentorship/__tests__/fixtures'

vi.mock('@/lib/events/clock', () => ({ useViewerZone: () => 'America/New_York', useNow: () => new Date('2026-12-01T00:00:00Z') }))

const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null as unknown }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null as unknown }))
const cancel = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null as unknown }))
const complete = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null as unknown }))
const idle = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null as unknown }))
const sessions = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/hooks/queries/useMentorship', () => ({
    useSessions: () => sessions.current,
    useCreateSession: () => create,
    useUpdateSession: () => update,
    useCancelSession: () => cancel,
    useCompleteSession: () => complete,
    useSaveSessionNotes: () => idle,
    useSessionFeedback: () => idle,
}))

import { SessionCard, SessionFormDialog, SessionsPanel } from '../SessionsPanel'

const mentorship = makeMentorship({ mentorProfile: { _id: 'p1', timezone: 'Asia/Kolkata' } })

beforeEach(() => {
    vi.clearAllMocks()
    sessions.current = { isLoading: false, isError: false, error: null, refetch: vi.fn(), data: [makeSession()] }
})

describe('SessionsPanel', () => {
    it('shows loading, empty and error states', () => {
        sessions.current = { isLoading: true, data: undefined }
        const { rerender } = render(<SessionsPanel mentorship={mentorship} />)
        expect(screen.getByRole('status')).toBeInTheDocument()
        sessions.current = { isLoading: false, isError: false, data: [], refetch: vi.fn() }
        rerender(<SessionsPanel mentorship={mentorship} />)
        expect(screen.queryAllByTestId('session-card')).toHaveLength(0)
        expect(screen.getAllByRole('button', { name: /Schedule/ }).length).toBeGreaterThan(0)
        sessions.current = { isLoading: false, isError: true, error: new Error('x'), data: undefined, refetch: vi.fn() }
        rerender(<SessionsPanel mentorship={mentorship} />)
        expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument()
    })

    it('hides scheduling when the viewer cannot schedule', () => {
        render(<SessionsPanel mentorship={makeMentorship({ viewer: viewer({ canSchedule: false }) })} />)
        expect(screen.queryByRole('button', { name: /Schedule/ })).toBeNull()
    })
})

describe('SessionCard', () => {
    it('shows the time in my zone and the zone it was planned in', () => {
        render(<ul><SessionCard session={makeSession()} mentorship={mentorship} zone="America/New_York" /></ul>)
        expect(screen.getByTestId('session-time')).toHaveTextContent(/EST/)
        expect(screen.getByTestId('session-time-secondary')).toHaveTextContent('Asia/Kolkata')
    })

    it('follows the viewer block for each action', () => {
        const s = makeSession({ viewer: { role: 'mentee', canReschedule: false, canCancel: false, canComplete: false, canAddNotes: false, isProposer: false } })
        render(<ul><SessionCard session={s} mentorship={mentorship} zone="UTC" /></ul>)
        expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Reschedule/ })).toBeNull()
        expect(screen.queryByRole('button', { name: /Mark as held/ })).toBeNull()
    })

    it('cancels with a reason', () => {
        render(<ul><SessionCard session={makeSession()} mentorship={mentorship} zone="UTC" /></ul>)
        fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))
        fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Something came up' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel session' }))
        expect(cancel.mutate).toHaveBeenCalledWith({ id: '64b0000000000000000000c1', reason: 'Something came up' }, expect.anything())
    })

    it('lets only the mentor mark a held session', () => {
        const s = makeSession({ viewer: { role: 'mentor', canReschedule: true, canCancel: true, canComplete: true, canAddNotes: true, isProposer: false } })
        render(<ul><SessionCard session={s} mentorship={makeMentorship({ viewer: viewer({ role: 'mentor' }) })} zone="UTC" /></ul>)
        fireEvent.click(screen.getByRole('button', { name: /Mark as held/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Mark as held', hidden: false }))
        expect(complete.mutate).toHaveBeenCalled()
    })

    it('only links https meeting URLs', () => {
        render(<ul><SessionCard session={makeSession({ meetingUrl: 'javascript:alert(1)' })} mentorship={mentorship} zone="UTC" /></ul>)
        expect(screen.queryByRole('link', { name: /Join the call/ })).toBeNull()
    })
})

describe('SessionFormDialog', () => {
    it('previews the time in the viewer, mentor and UTC zones', () => {
        render(<SessionFormDialog open onOpenChange={vi.fn()} mentorship={mentorship} />)
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-12-14' } })
        fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '18:00' } })
        const preview = screen.getByTestId('time-preview')
        expect(preview).toHaveTextContent('Your time')
        expect(preview).toHaveTextContent("Mentor's time")
        expect(preview).toHaveTextContent('UTC')
    })

    it('shows field problems and does not send an invalid session', () => {
        render(<SessionFormDialog open onOpenChange={vi.fn()} mentorship={mentorship} />)
        fireEvent.click(screen.getByRole('button', { name: 'Schedule session' }))
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getAllByText(/./, { selector: '[role="alert"], p.text-red-700' }).length).toBeGreaterThan(0)
    })

    it('sends an instant and the time zone hint', () => {
        render(<SessionFormDialog open onOpenChange={vi.fn()} mentorship={mentorship} />)
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Kickoff call' } })
        const day = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: day } })
        fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:00' } })
        fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Kolkata' } })
        fireEvent.click(screen.getByRole('button', { name: 'Schedule session' }))
        expect(create.mutate).toHaveBeenCalledTimes(1)
        expect(create.mutate.mock.calls[0][0]).toMatchObject({ title: 'Kickoff call', scheduledAt: `${day}T03:30:00.000Z`, timezone: 'Asia/Kolkata', duration: 60 })
    })
})
