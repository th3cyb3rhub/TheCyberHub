import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeCompetition, makeTeam } from '@/lib/ctf/__tests__/fixtures'
import type { CtfTeam } from '@/types/ctf'

const auth = vi.hoisted(() => ({ user: { id: 'u1', username: 'captain' } as { id: string; username: string } | null }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const team = vi.hoisted(() => ({ data: undefined as CtfTeam | null | undefined, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() }))
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const join = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const leave = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const kick = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useCtf', () => ({
    useCtfMe: () => ({ data: undefined }),
    useCtfTeam: () => team,
    useCreateCtfTeam: () => create, useJoinCtfTeam: () => join, useLeaveCtfTeam: () => leave, useKickCtfMember: () => kick,
}))

import { TeamPanel } from '../TeamPanel'

type Callbacks = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void }
const last = (m: { mutate: ReturnType<typeof vi.fn> }) => m.mutate.mock.calls[m.mutate.mock.calls.length - 1] as [Record<string, unknown>, Callbacks]

const comp = makeCompetition({ teamsEnabled: true, minTeamSize: 2, maxTeamSize: 4 })
const trio = (over: Partial<CtfTeam> = {}) => makeTeam({
    members: [
        { _id: 'u1', username: 'captain', avatar: null },
        { _id: 'u2', username: 'second', avatar: null },
        { _id: 'u3', username: 'third', avatar: null },
    ],
    solveCount: 0,
    ...over,
})
const renderPanel = (over: Partial<Parameters<typeof TeamPanel>[0]> = {}) => render(<TeamPanel competition={comp} status="live" signedIn {...over} />)

beforeEach(() => {
    vi.clearAllMocks()
    auth.user = { id: 'u1', username: 'captain' }
    team.data = trio(); team.isLoading = false; team.isError = false; team.error = null
    for (const m of [create, join, leave, kick]) m.isPending = false
})

describe('TeamPanel: the captain', () => {
    it('sees the invite code, a remove button for each other member, and cannot leave while they remain', () => {
        renderPanel()
        expect(screen.getByTestId('team-card')).toHaveAttribute('data-role', 'captain')
        expect(screen.getAllByTestId('team-member')).toHaveLength(3)
        expect(screen.getByRole('button', { name: 'Remove second' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Remove third' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Remove captain' })).toBeNull()
        expect(screen.getAllByText('Invite code').length).toBeGreaterThan(0)
        const blocked = screen.getByTestId('leave-blocked')
        expect(within(blocked).getByRole('button', { name: /Leave team/ })).toHaveAttribute('aria-disabled', 'true')
        expect(blocked).toHaveTextContent(/Remove the other members first/)
    })

    it('removes a member only after confirming, with the member id', () => {
        renderPanel()
        fireEvent.click(screen.getByRole('button', { name: 'Remove second' }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Remove second?')
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove player' }))
        expect(kick.mutate).toHaveBeenCalledWith({ slug: comp.slug, memberId: 'u2' }, expect.any(Object))
    })

    it('shows the server reason when a removal is refused', () => {
        renderPanel()
        fireEvent.click(screen.getByRole('button', { name: 'Remove second' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove player' }))
        act(() => { last(kick)[1].onError?.(new ApiError('x', 409, 'CTF_TEAM_HAS_SOLVES')) })
        expect(screen.getByTestId('team-error')).toHaveTextContent(/roster is fixed/)
    })

    it('lets a captain who is alone leave and disband', () => {
        team.data = makeTeam({ members: [{ _id: 'u1', username: 'captain', avatar: null }], solveCount: 0 })
        renderPanel()
        expect(screen.queryByTestId('leave-blocked')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Leave and disband' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave and disband' }))
        expect(leave.mutate).toHaveBeenCalledWith({ slug: comp.slug }, expect.any(Object))
    })

    it('warns when the team is below the minimum size', () => {
        team.data = makeTeam({ members: [{ _id: 'u1', username: 'captain', avatar: null }], solveCount: 0 })
        renderPanel()
        expect(screen.getByTestId('team-small')).toHaveTextContent(/needs at least 2|at least 2/)
    })
})

describe('TeamPanel: a member', () => {
    beforeEach(() => { auth.user = { id: 'u2', username: 'second' } })

    it('sees no remove buttons and can leave', () => {
        renderPanel()
        expect(screen.getByTestId('team-card')).toHaveAttribute('data-role', 'member')
        expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
        expect(screen.queryByTestId('leave-blocked')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Leave team' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave team' }))
        expect(leave.mutate).toHaveBeenCalledWith({ slug: comp.slug }, expect.any(Object))
    })
})

describe('TeamPanel: a roster that is fixed', () => {
    it('removes the remove buttons and the leave button once the team has solved a challenge', () => {
        team.data = trio({ solveCount: 2 })
        renderPanel()
        expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
        const locked = screen.getByTestId('roster-locked')
        expect(within(locked).getByRole('button', { name: 'Leave team' })).toHaveAttribute('aria-disabled', 'true')
        expect(locked).toHaveTextContent(/roster is fixed until the competition ends/)
        fireEvent.click(within(locked).getByRole('button', { name: 'Leave team' }))
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('says the roster is closed after the end', () => {
        renderPanel({ status: 'ended' })
        expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
        expect(screen.getByText(/the roster is closed/)).toBeInTheDocument()
    })
})

describe('TeamPanel: no team yet', () => {
    beforeEach(() => { team.data = null })

    it('creates a team with a checked name and shows a taken name under the field', () => {
        renderPanel()
        fireEvent.click(screen.getByRole('button', { name: 'Create team' }))
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByLabelText('Team name')).toHaveAttribute('aria-invalid', 'true')
        fireEvent.change(screen.getByLabelText('Team name'), { target: { value: '  Red Pandas  ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create team' }))
        expect(create.mutate).toHaveBeenCalledWith({ slug: comp.slug, name: 'Red Pandas' }, expect.any(Object))
        act(() => { last(create)[1].onError?.(new ApiError('x', 409, 'CTF_TEAM_NAME_TAKEN')) })
        expect(screen.getByText(/Another team already uses that name/)).toBeInTheDocument()
    })

    it('joins with an invite code typed any way and maps a wrong code', () => {
        renderPanel()
        fireEvent.change(screen.getByLabelText(/Invite code/), { target: { value: ' abcd 1234 ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Join team' }))
        expect(join.mutate).toHaveBeenCalledWith({ slug: comp.slug, inviteCode: 'ABCD1234' }, expect.any(Object))
        act(() => { last(join)[1].onError?.(new ApiError('x', 404, 'CTF_INVITE_INVALID')) })
        expect(screen.getByText(/does not match any team/)).toBeInTheDocument()
    })

    it('turns the forms off with the reason when registration is closed or the competition is full', () => {
        const closed = render(<TeamPanel competition={makeCompetition({ ...comp, registrationOpen: false })} status="live" signedIn />)
        expect(screen.getByTestId('join-block')).toHaveTextContent(/Registration is closed/)
        expect(screen.getByRole('button', { name: 'Create team' })).toBeDisabled()
        closed.unmount()
        render(<TeamPanel competition={makeCompetition({ ...comp, maxParticipants: 12, participantCount: 12 })} status="live" signedIn />)
        expect(screen.getByTestId('join-block')).toHaveTextContent(/competition is full/)
    })
})

describe('TeamPanel: other states', () => {
    it('explains a solo competition', () => {
        renderPanel({ competition: makeCompetition({ teamsEnabled: false }) })
        expect(screen.getByTestId('solo-note')).toHaveTextContent(/played solo/)
    })

    it('asks a visitor to sign in', () => {
        renderPanel({ signedIn: false })
        expect(screen.getByTestId('team-signin')).toHaveTextContent('Teams of 2 to 4')
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', expect.stringContaining('/auth?redirect='))
    })
})
