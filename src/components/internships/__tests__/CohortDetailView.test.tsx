import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeCohort, viewer } from '@/lib/internships/__tests__/fixtures'

const q = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/hooks/queries/useInternships', () => ({ useInternship: () => q.current }))
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }))
const withdraw = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('../WithdrawDialog', () => ({
    WithdrawDialog: (p: { applicationId: string; cohortId?: string; accepted?: boolean; onClose: () => void }) => (
        <div role="dialog" aria-label="Withdraw your application?">
            <button onClick={() => withdraw.mutate({ id: p.applicationId, cohortId: p.cohortId, accepted: p.accepted })}>Confirm withdraw</button>
            <button onClick={p.onClose}>Keep my application</button>
        </div>
    ),
}))

import { CohortDetailView } from '../CohortDetailView'

const ok = (cohort: unknown) => ({ data: cohort, isError: false, isLoading: false, isPending: false, isPlaceholderData: false, isFetching: false, refetch: vi.fn() })
const applied = (status: 'pending' | 'reviewing' | 'accepted' | 'rejected' | 'withdrawn') => viewer({ canApply: false, userApplication: { _id: 'app1', status, appliedAt: '2026-12-01T10:00:00.000Z', updatedAt: '2026-12-02T10:00:00.000Z' } })

beforeEach(() => { vi.clearAllMocks(); auth.user = null })

describe('CohortDetailView states', () => {
    it('asks an anonymous visitor to sign in, and comes back to the apply page', () => {
        q.current = ok(makeCohort({ viewer: null }))
        render(<CohortDetailView id="c1" />)
        expect(screen.getByRole('heading', { level: 1, name: 'Summer Security Internship' })).toBeInTheDocument()
        const link = screen.getByRole('link', { name: 'Sign in to apply' })
        expect(link.getAttribute('href')).toBe(`/auth?redirect=${encodeURIComponent('/internships/aaaaaaaaaaaaaaaaaaaaaaaa/apply')}`)
        expect(screen.getByTestId('apply-panel')).toHaveAttribute('data-state', 'anonymous')
    })

    it('offers Apply only when the member can', () => {
        q.current = ok(makeCohort())
        render(<CohortDetailView id="c1" />)
        expect(screen.getByRole('link', { name: 'Apply now' })).toHaveAttribute('href', '/internships/aaaaaaaaaaaaaaaaaaaaaaaa/apply')
    })

    it('shows the application with its status and progress for a member who applied, and no Apply', () => {
        q.current = ok(makeCohort({ viewer: applied('reviewing') }))
        render(<CohortDetailView id="c1" />)
        const panel = screen.getByTestId('your-application')
        expect(panel).toHaveTextContent('In review')
        expect(screen.getByTestId('application-progress')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Apply now' })).toBeNull()
        expect(screen.getByRole('link', { name: /See my timeline/ })).toHaveAttribute('href', '/internships/applications')
    })

    it('says closed instead of Apply when applications are over', () => {
        q.current = ok(makeCohort({ status: 'closed', applicationsOpen: false, viewer: viewer({ canApply: false }) }))
        render(<CohortDetailView id="c1" />)
        expect(screen.getByTestId('apply-panel')).toHaveAttribute('data-state', 'closed')
        expect(screen.getByRole('heading', { name: 'Applications closed' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Apply now|Sign in to apply/ })).toBeNull()
    })

    it('says full instead of Apply when every seat is taken', () => {
        q.current = ok(makeCohort({ spotsLeft: 0 }))
        render(<CohortDetailView id="c1" />)
        expect(screen.getByTestId('apply-panel')).toHaveAttribute('data-state', 'full')
        expect(screen.getByRole('heading', { name: 'This program is full' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Apply now' })).toBeNull()
        expect(screen.getAllByText('No spots left').length).toBeGreaterThan(0)
    })

    it('shows the curriculum in week order and a program without a seat limit as such', () => {
        q.current = ok(makeCohort({ capacity: 0, spotsLeft: null }))
        render(<CohortDetailView id="c1" />)
        const weeks = screen.getAllByTestId('syllabus-week')
        expect(weeks[0]).toHaveTextContent('Week 1: Foundations')
        expect(weeks[1]).toHaveTextContent('Week 2: Injection')
        expect(screen.getByText('No limit')).toBeInTheDocument()
    })

    it('renders text from the API as text and links showcase projects safely', () => {
        q.current = ok(makeCohort({
            title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', status: 'completed', applicationsOpen: false,
            showcaseProjects: [{ title: 'Scanner', description: 'd', teamMembers: ['Ada'], demoLink: 'javascript:alert(1)', repoLink: 'https://github.com/a/b' }],
        }))
        const { container } = render(<CohortDetailView id="c1" />)
        expect(container.querySelector('script')).toBeNull()
        expect(container.querySelector('img')).toBeNull()
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('<img src=x onerror=alert(1)>')
        const repo = screen.getByRole('link', { name: /Code/ })
        expect(repo).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
        expect(repo).toHaveAttribute('target', '_blank')
        expect(screen.queryByRole('link', { name: /Demo/ })).toBeNull()
        expect(container.querySelector('a[href^="javascript"]')).toBeNull()
    })

    it('says the program is not available on a 404 and offers the retry on other errors', () => {
        q.current = { data: undefined, isError: true, isLoading: false, isPending: false, error: new ApiError('x', 404, 'INTERNSHIP_NOT_FOUND'), refetch: vi.fn() }
        const { unmount } = render(<CohortDetailView id="c1" />)
        expect(screen.getByRole('heading', { name: 'This program is not available' })).toBeInTheDocument()
        unmount()
        const refetch = vi.fn()
        q.current = { data: undefined, isError: true, isLoading: false, isPending: false, error: new ApiError('x', 500), refetch }
        render(<CohortDetailView id="c1" />)
        fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
        expect(refetch).toHaveBeenCalled()
    })
})

describe('a signed-in member and the server copy', () => {
    const serverCopy = () => makeCohort({ viewer: null })

    it('shows a neutral panel, not "Sign in to apply", while their own answer is on its way', () => {
        auth.user = { id: 'u1' }
        q.current = { ...ok(serverCopy()), isPlaceholderData: true, isFetching: true }
        render(<CohortDetailView id="c1" initialCohort={serverCopy()} />)
        expect(screen.getByRole('heading', { level: 1, name: 'Summer Security Internship' })).toBeInTheDocument()
        expect(screen.getByTestId('apply-pending')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Sign in to apply|Apply now/ })).toBeNull()
        expect(screen.queryByTestId('apply-panel')).toBeNull()
    })

    it('does not take a viewer-less answer for theirs even when it is no placeholder', () => {
        auth.user = { id: 'u1' }
        q.current = ok(serverCopy())
        render(<CohortDetailView id="c1" />)
        expect(screen.getByTestId('apply-retry')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Sign in to apply' })).toBeNull()
    })

    it('offers a retry, with the program still shown, when their own request failed', () => {
        auth.user = { id: 'u1' }
        const refetch = vi.fn()
        q.current = { data: undefined, isError: true, isLoading: false, isPending: false, isPlaceholderData: false, isFetching: false, error: new ApiError('down', 500), refetch }
        render(<CohortDetailView id="c1" initialCohort={serverCopy()} />)
        expect(screen.getByRole('heading', { level: 1, name: 'Summer Security Internship' })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Sign in to apply' })).toBeNull()
        fireEvent.click(within(screen.getByTestId('apply-retry')).getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()
    })

    it('shows the real panel once their answer is in', () => {
        auth.user = { id: 'u1' }
        q.current = ok(makeCohort())
        render(<CohortDetailView id="c1" initialCohort={serverCopy()} />)
        expect(screen.getByRole('link', { name: 'Apply now' })).toBeInTheDocument()
        expect(screen.queryByTestId('apply-pending')).toBeNull()
    })

    it('shows "not available" when the API now says 404, whatever was cached', () => {
        q.current = { ...ok(makeCohort()), isError: true, error: new ApiError('gone', 404, 'INTERNSHIP_NOT_FOUND') }
        render(<CohortDetailView id="c1" initialCohort={makeCohort()} />)
        expect(screen.getByRole('heading', { name: 'This program is not available' })).toBeInTheDocument()
        expect(screen.queryByRole('heading', { level: 1, name: 'Summer Security Internship' })).toBeNull()
    })
})

describe('withdraw from the detail page', () => {
    it('opens the confirmation for a pending, reviewing or accepted application', () => {
        for (const status of ['pending', 'reviewing', 'accepted'] as const) {
            q.current = ok(makeCohort({ viewer: applied(status) }))
            const { unmount } = render(<CohortDetailView id="c1" />)
            expect(screen.queryByRole('dialog')).toBeNull()
            fireEvent.click(screen.getByRole('button', { name: /Withdraw/ }))
            expect(screen.getByRole('dialog', { name: 'Withdraw your application?' })).toBeInTheDocument()
            fireEvent.click(screen.getByRole('button', { name: 'Confirm withdraw' }))
            expect(withdraw.mutate).toHaveBeenLastCalledWith({ id: 'app1', cohortId: 'aaaaaaaaaaaaaaaaaaaaaaaa', accepted: status === 'accepted' })
            unmount()
        }
    })

    it('can be cancelled', () => {
        q.current = ok(makeCohort({ viewer: applied('pending') }))
        render(<CohortDetailView id="c1" />)
        fireEvent.click(screen.getByRole('button', { name: /Withdraw/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Keep my application' }))
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('offers no withdraw for a rejected or withdrawn application', () => {
        for (const status of ['rejected', 'withdrawn'] as const) {
            q.current = ok(makeCohort({ viewer: applied(status) }))
            const { unmount } = render(<CohortDetailView id="c1" />)
            expect(screen.queryByRole('button', { name: /Withdraw/ })).toBeNull()
            unmount()
        }
    })
})
