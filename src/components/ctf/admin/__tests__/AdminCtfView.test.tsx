import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCompetition } from '@/lib/ctf/__tests__/fixtures'
import type { CtfCompetitionCard, CtfPage } from '@/types/ctf'

const auth = vi.hoisted(() => ({ user: null as { id: string; username: string; role: string } | null, loading: false }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, loading: auth.loading }) }))
const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace }) }))
const list = vi.hoisted(() => ({ data: undefined as CtfPage<CtfCompetitionCard> | undefined, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() }))
const params = vi.hoisted(() => ({ calls: [] as { page?: number; status?: string }[] }))
vi.mock('@/hooks/queries/useCtf', () => ({
    useAdminCtfList: (p: { page?: number; status?: string }) => { params.calls.push(p); return list },
}))

import { AdminCtfView } from '../AdminCtfView'

const page = (rows: CtfCompetitionCard[], pages = 1, p = 1): CtfPage<CtfCompetitionCard> => ({ data: rows, pagination: { page: p, limit: 20, total: rows.length, pages } })
const rows = [
    makeCompetition({ _id: 'a', title: 'Winter CTF', slug: 'winter-ctf', status: 'live', challengeCount: 6, participantCount: 12, maxParticipants: 50 }),
    makeCompetition({ _id: 'b', title: 'Spring Draft', slug: 'spring-draft', status: 'draft', challengeCount: 0, participantCount: 0, teamsEnabled: true, minTeamSize: 2, maxTeamSize: 4, scoringMode: 'dynamic' }),
]

beforeEach(() => {
    vi.clearAllMocks()
    params.calls = []
    auth.user = { id: 'u1', username: 'root', role: 'admin' }; auth.loading = false
    list.data = page(rows); list.isLoading = false; list.isError = false; list.error = null
})

describe('AdminCtfView access', () => {
    it('sends a signed-out visitor to sign in', () => {
        auth.user = null
        render(<AdminCtfView />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fadmin%2Fctf')
        expect(screen.queryByTestId('admin-ctf')).toBeNull()
    })

    it.each(['user', 'mentor', 'employer'])('refuses a %s with a clear message', (role) => {
        auth.user = { id: 'u2', username: 'x', role }
        render(<AdminCtfView />)
        expect(screen.getByText('You cannot open this page')).toBeInTheDocument()
        expect(screen.queryByTestId('admin-ctf')).toBeNull()
    })

    it.each(['admin', 'owner'])('lets %s read the list and create or edit', (role) => {
        auth.user = { id: 'u2', username: 'x', role }
        render(<AdminCtfView />)
        expect(screen.getByRole('link', { name: /New competition/ })).toHaveAttribute('href', '/admin/ctf/create')
        expect(screen.getByRole('link', { name: 'Edit Winter CTF' })).toHaveAttribute('href', '/admin/ctf/winter-ctf/edit')
        expect(screen.queryByTestId('read-only-note')).toBeNull()
    })

    it('shows a moderator the list read-only: no create, no edit', () => {
        auth.user = { id: 'u3', username: 'mod', role: 'moderator' }
        render(<AdminCtfView />)
        expect(screen.getAllByTestId('admin-ctf')).toHaveLength(2)
        expect(screen.getByTestId('read-only-note')).toHaveTextContent(/Only administrators and owners can create or change/)
        expect(screen.queryByRole('link', { name: /New competition/ })).toBeNull()
        expect(screen.queryByRole('link', { name: /^Edit / })).toBeNull()
        expect(screen.getByRole('link', { name: 'View Winter CTF' })).toBeInTheDocument()
    })
})

describe('AdminCtfView list', () => {
    it('shows status, counts, scoring and team size of each competition', () => {
        render(<AdminCtfView />)
        const [winter, spring] = screen.getAllByTestId('admin-ctf')
        expect(winter).toHaveAttribute('data-status', 'live')
        expect(winter).toHaveTextContent('Live')
        expect(winter.querySelector('[data-testid="admin-counts"]')).toHaveTextContent('6 challenges')
        expect(winter.querySelector('[data-testid="admin-counts"]')).toHaveTextContent('12 of 50 players')
        expect(winter).toHaveTextContent('Static scoring')
        expect(winter).toHaveTextContent('Solo')
        expect(spring).toHaveTextContent('Draft')
        expect(spring).toHaveTextContent('Dynamic scoring')
        expect(spring).toHaveTextContent('Teams of 2 to 4')
        expect(spring.querySelector('[data-testid="admin-counts"]')).toHaveTextContent('0 challenges')
    })

    it('asks the API for the chosen status and goes back to page one', () => {
        render(<AdminCtfView />)
        expect(params.calls.at(-1)).toEqual({ page: 1, status: undefined })
        fireEvent.click(screen.getByRole('button', { name: 'Draft' }))
        expect(params.calls.at(-1)).toEqual({ page: 1, status: 'draft' })
        expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(screen.getByRole('button', { name: 'Live or frozen' }))
        expect(params.calls.at(-1)).toEqual({ page: 1, status: 'live' })
    })

    it('pages through the list', () => {
        list.data = page(rows, 3, 1)
        render(<AdminCtfView />)
        const nav = screen.getByRole('navigation', { name: 'Pages' })
        expect(within(nav).getByRole('button', { name: /Previous/ })).toBeDisabled()
        expect(nav).toHaveTextContent('Page 1 of 3')
        fireEvent.click(within(nav).getByRole('button', { name: /Next/ }))
        expect(params.calls.at(-1)?.page).toBe(2)
    })

    it('warns about a published competition with no challenges', () => {
        list.data = page([makeCompetition({ _id: 'c', title: 'Empty', slug: 'empty', status: 'upcoming', challengeCount: 0 })])
        render(<AdminCtfView />)
        expect(screen.getByText(/players see an empty competition/)).toBeInTheDocument()
    })

    it('has an empty state, a loading state and an error state', () => {
        list.data = page([])
        const empty = render(<AdminCtfView />)
        expect(screen.getByText('No competitions yet')).toBeInTheDocument()
        empty.unmount()
        list.data = undefined; list.isLoading = true
        const loading = render(<AdminCtfView />)
        expect(screen.getByLabelText('Loading competitions')).toBeInTheDocument()
        loading.unmount()
        list.isLoading = false; list.isError = true; list.error = new Error('down')
        render(<AdminCtfView />)
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load the competitions')
    })
})
