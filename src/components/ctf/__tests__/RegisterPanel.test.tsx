import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeCompetition, makeMe } from '@/lib/ctf/__tests__/fixtures'

const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const register = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const unregister = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useCtf', () => ({ useRegisterCtf: () => register, useUnregisterCtf: () => unregister }))

import { RegisterPanel } from '../RegisterPanel'

type Callbacks = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void }
const last = (m: { mutate: ReturnType<typeof vi.fn> }) => m.mutate.mock.calls[m.mutate.mock.calls.length - 1] as [Record<string, unknown>, Callbacks]

const comp = makeCompetition({ teamsEnabled: false, registrationOpen: true, participantCount: 3, maxParticipants: 0 })
const renderPanel = (over: Partial<Parameters<typeof RegisterPanel>[0]> = {}) =>
    render(<RegisterPanel competition={comp} status="live" me={makeMe({ registered: true, solveCount: 0 })} signedIn {...over} />)

beforeEach(() => {
    vi.clearAllMocks()
    register.isPending = false
    unregister.isPending = false
})

describe('RegisterPanel', () => {
    it('shows nothing for a team competition, a visitor, or a finished competition', () => {
        expect(renderPanel({ competition: makeCompetition({ teamsEnabled: true }) }).container).toBeEmptyDOMElement()
        expect(renderPanel({ signedIn: false }).container).toBeEmptyDOMElement()
        expect(renderPanel({ status: 'ended' }).container).toBeEmptyDOMElement()
        expect(renderPanel({ status: 'cancelled' }).container).toBeEmptyDOMElement()
    })

    it('registers an unregistered player', () => {
        renderPanel({ me: makeMe({ registered: false }) })
        fireEvent.click(screen.getByRole('button', { name: /Register/ }))
        expect(last(register)[0]).toEqual({ slug: comp.slug })
        act(() => { last(register)[1].onSuccess?.({ registered: true }) })
        expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
    })

    it('says when registration is closed or the competition is full', () => {
        renderPanel({ me: makeMe({ registered: false }), competition: makeCompetition({ teamsEnabled: false, registrationOpen: false }) })
        expect(screen.getByTestId('register-closed')).toHaveTextContent('Registration is closed')
    })

    it('unregisters only after confirming', () => {
        renderPanel()
        fireEvent.click(screen.getByRole('button', { name: /Unregister/ }))
        expect(unregister.mutate).not.toHaveBeenCalled()
        fireEvent.click(screen.getAllByRole('button', { name: 'Unregister' }).at(-1) as HTMLElement)
        expect(last(unregister)[0]).toEqual({ slug: comp.slug })
    })

    it('disables Unregister with the reason once the player has solved something during play', () => {
        renderPanel({ me: makeMe({ registered: true, solveCount: 2 }) })
        const button = screen.getByRole('button', { name: /Unregister/ })
        expect(button).toHaveAttribute('aria-disabled', 'true')
        expect(button).toHaveAttribute('aria-describedby', 'unregister-locked-note')
        expect(screen.getByTestId('unregister-locked')).toHaveTextContent(/until the competition ends/)
        fireEvent.click(button)
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(unregister.mutate).not.toHaveBeenCalled()
    })

    it.each(['live', 'frozen'] as const)('locks it while the competition is %s', (status) => {
        renderPanel({ status, me: makeMe({ registered: true, solveCount: 1 }) })
        expect(screen.getByTestId('unregister-locked')).toBeInTheDocument()
    })

    it('does not lock it before the start, or for a player without a solve', () => {
        renderPanel({ status: 'upcoming', me: makeMe({ registered: true, solveCount: 1 }) })
        expect(screen.queryByTestId('unregister-locked')).toBeNull()
        expect(screen.getByRole('button', { name: /Unregister/ })).not.toHaveAttribute('aria-disabled')
    })

    it('shows a clear message when the server refuses with CTF_MEMBER_HAS_SOLVES', () => {
        renderPanel()
        fireEvent.click(screen.getByRole('button', { name: /Unregister/ }))
        fireEvent.click(screen.getAllByRole('button', { name: 'Unregister' }).at(-1) as HTMLElement)
        act(() => { last(unregister)[1].onError?.(new ApiError('A member who has solved a challenge cannot leave', 409, 'CTF_MEMBER_HAS_SOLVES')) })
        expect(screen.getByRole('alert')).toHaveTextContent(/You have solved a challenge, so you stay registered until the competition ends/)
    })

    it('ignores a second press while the first request is on its way', () => {
        unregister.isPending = true
        renderPanel()
        fireEvent.click(screen.getByRole('button', { name: /Unregister/ }))
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})
