import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))

const m = () => ({ mutate: vi.fn(), isPending: false })
const mut = vi.hoisted(() => ({}) as Record<string, { mutate: ReturnType<typeof vi.fn>; isPending: boolean }>)
vi.mock('@/hooks/queries/useEvents', () => ({
    useRegisterForEvent: () => mut.register,
    useUnregisterFromEvent: () => mut.unregister,
    useJoinWaitlist: () => mut.join,
    useLeaveWaitlist: () => mut.leave,
    useSetReminder: () => mut.remind,
}))

import { RegistrationPanel } from '../RegistrationPanel'

const BEFORE = new Date('2026-12-01T10:00:00Z')
const target = { id: '64b000000000000000000001', slug: 'winter-ctf-night' }
const panel = (event = makeEvent(), now: Date | null = BEFORE) => render(<RegistrationPanel event={event} now={now} />)

beforeEach(() => {
    for (const k of ['register', 'unregister', 'join', 'leave', 'remind']) mut[k] = m()
    useAuth.mockReturnValue({ user: { id: 'me', role: 'user' }, loading: false })
})

describe('RegistrationPanel', () => {
    it('registers a member, sharing on the activity feed by default', () => {
        panel()
        expect(screen.getByTestId('registration-panel')).toHaveAttribute('data-view', 'can-register')
        expect(screen.getByText('18 spots left')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Register' }))
        expect(mut.register.mutate).toHaveBeenCalledWith({ ...target, shareActivity: true })
    })

    it('lets a member keep the registration off the activity feed', () => {
        panel()
        fireEvent.click(screen.getByRole('checkbox', { name: /Share on the activity feed/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Register' }))
        expect(mut.register.mutate).toHaveBeenCalledWith({ ...target, shareActivity: false })
    })

    it('sends a signed-out visitor to sign in and back', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        panel(makeEvent({ viewer: undefined }))
        const link = screen.getByRole('link', { name: /Sign in to register/ })
        expect(link).toHaveAttribute('href', '/auth?redirect=%2Fevents%2Fwinter-ctf-night')
        expect(screen.queryByRole('button', { name: 'Register' })).toBeNull()
    })

    it('offers the waiting list when full', () => {
        panel(makeEvent({ isFull: true, spotsLeft: 0, waitlistCount: 2, viewer: viewer({ canRegister: false, canJoinWaitlist: true }) }))
        expect(screen.getByText(/Full · waitlist open \(2 waiting\)/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Register' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Join the waiting list' }))
        expect(mut.join.mutate).toHaveBeenCalledWith(target)
    })

    it('shows the position on the waiting list and lets the member leave', () => {
        panel(makeEvent({ isFull: true, viewer: viewer({ canRegister: false, waitlisted: true, position: 3 }) }))
        expect(screen.getByTestId('waitlist-status')).toHaveTextContent('You are #3 on the waiting list')
        fireEvent.click(screen.getByRole('button', { name: 'Leave the waiting list' }))
        expect(mut.leave.mutate).toHaveBeenCalledWith(target)
    })

    it('shows a registered member the reminder choices and sets one', () => {
        panel(makeEvent({ viewer: viewer({ canRegister: false, registered: true }) }))
        expect(screen.getByTestId('registered-status')).toHaveTextContent('You are registered')
        expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true')
        fireEvent.click(screen.getByRole('radio', { name: '1 hour before' }))
        expect(mut.remind.mutate).toHaveBeenCalledWith({ ...target, offsetMinutes: 60 })
    })

    it('marks the current reminder and can turn it off', () => {
        panel(makeEvent({ viewer: viewer({ canRegister: false, registered: true, reminder: { offsetMinutes: 1440, remindAt: '2026-12-04T17:00:00Z', sent: false } }) }))
        expect(screen.getByRole('radio', { name: '1 day before' })).toHaveAttribute('aria-checked', 'true')
        fireEvent.click(screen.getByRole('radio', { name: 'Off' }))
        expect(mut.remind.mutate).toHaveBeenCalledWith({ ...target, offsetMinutes: null })
    })

    it('shows the join link once the API sends it, and says when it will open before that', () => {
        const registered = viewer({ canRegister: false, registered: true, joinOpensAt: '2026-12-05T16:30:00.000Z' })
        const { unmount } = panel(makeEvent({ viewer: registered }))
        expect(screen.queryByRole('link', { name: /Join the event/ })).toBeNull()
        expect(screen.getByTestId('join-opens')).toHaveTextContent('Sat, Dec 5 · 5:30 PM GMT+1')
        unmount()
        panel(makeEvent({ viewer: registered, joinLink: 'https://meet.example.org/abc' }), new Date('2026-12-05T16:45:00Z'))
        const join = screen.getByRole('link', { name: /Join the event/ })
        expect(join).toHaveAttribute('href', 'https://meet.example.org/abc')
        expect(join).toHaveAttribute('rel', expect.stringContaining('noopener'))
    })

    it('asks before cancelling a registration', () => {
        panel(makeEvent({ viewer: viewer({ canRegister: false, registered: true }) }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel my registration' }))
        expect(mut.unregister.mutate).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Cancel registration' }))
        expect(mut.unregister.mutate).toHaveBeenCalledWith(target, expect.any(Object))
    })

    it('says why registration is closed instead of showing a button', () => {
        panel(makeEvent({ isFull: true, waitlistEnabled: false, spotsLeft: 0, viewer: viewer({ canRegister: false }) }))
        expect(screen.getByTestId('closed-reason')).toHaveTextContent('full and has no waiting list')
        expect(screen.queryByRole('button', { name: 'Register' })).toBeNull()
    })

    it('shows a skeleton while the member state loads', () => {
        panel(makeEvent({ viewer: undefined }))
        expect(screen.getByRole('status', { name: 'Loading your registration' })).toBeInTheDocument()
    })

    it('shows the ended and cancelled states without actions', () => {
        const ended = makeEvent({ status: 'ended', viewer: viewer({ canRegister: false, registered: true, attended: true }) })
        const { unmount } = panel(ended, new Date('2026-12-06T10:00:00Z'))
        expect(screen.getByText('This event is over.')).toBeInTheDocument()
        expect(screen.getByText('You attended.')).toBeInTheDocument()
        expect(screen.queryByRole('button')).toBeNull()
        unmount()
        panel(makeEvent({ status: 'cancelled', cancelReason: 'Speaker ill' }))
        expect(screen.getByText(/This event was cancelled/)).toBeInTheDocument()
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('links the organizer registration page when there is one', () => {
        panel(makeEvent({ registrationLink: 'https://tickets.example.org/e' }))
        expect(screen.getByRole('link', { name: /Organizer.s registration page/ })).toHaveAttribute('href', 'https://tickets.example.org/e')
    })

    it('trusts the server render before the clock is known', () => {
        panel(makeEvent({ status: 'ended', viewer: viewer({ canRegister: false }) }), null)
        expect(screen.getByText('This event is over.')).toBeInTheDocument()
    })
})
