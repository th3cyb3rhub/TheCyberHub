import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="signups-chart" /> }))

const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))

const useActivationFunnel = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/queries/useAdminMetrics', () => ({ useActivationFunnel }))

import ActivationFunnelPage from '../page'

const week = (label: string, over: Record<string, number> = {}) => ({
    week: label, signups: 100, verified: 80, onboarded: 50, skipped: 10, firstSolve: 25, firstPost: 20,
    firstComment: 15, firstForum: 5, firstFollow: 40, returnedD7: 30, returnedD30: 12, ...over,
})

const result = (over: Record<string, unknown> = {}) => ({
    data: { weeks: [week('2026-W41'), week('2026-W42', { signups: 200, verified: 100 })] },
    isLoading: false, isError: false, isFetching: false, refetch: vi.fn(), ...over,
})

beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ user: { id: 'a1', role: 'admin' }, loading: false })
    useActivationFunnel.mockReturnValue(result())
})

describe('ActivationFunnelPage', () => {
    it('shows the weekly table with conversion from sign-ups, newest week first', () => {
        render(<ActivationFunnelPage />)
        const table = screen.getByRole('table')
        const rows = within(table).getAllByRole('row')
        expect(rows[1]).toHaveTextContent('2026-W42')
        expect(rows[2]).toHaveTextContent('2026-W41')
        // W41: 80 of 100 verified
        expect(within(rows[2]).getByText('80%')).toBeInTheDocument()
        // W42: 100 of 200 verified
        expect(within(rows[1]).getAllByText('50%').length).toBeGreaterThan(0)
        expect(screen.getByTestId('signups-chart')).toBeInTheDocument()
    })

    it('shows the combined funnel as bars with percentages of sign-ups', () => {
        render(<ActivationFunnelPage />)
        // 300 sign-ups, 180 verified = 60%
        const bar = screen.getByRole('progressbar', { name: /verified their email: 60% of sign-ups/i })
        expect(bar).toHaveAttribute('aria-valuenow', '60')
        expect(screen.getByText('300 sign-ups')).toBeInTheDocument()
    })

    it('asks for 12 weeks first and lets the range change', () => {
        render(<ActivationFunnelPage />)
        expect(useActivationFunnel).toHaveBeenLastCalledWith(12, true)
        expect(screen.getByRole('button', { name: '12 weeks' })).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(screen.getByRole('button', { name: '26 weeks' }))
        expect(useActivationFunnel).toHaveBeenLastCalledWith(26, true)
        for (const choice of ['4 weeks', '8 weeks']) expect(screen.getByRole('button', { name: choice })).toBeInTheDocument()
    })

    it('does not divide by zero for a week without sign-ups', () => {
        useActivationFunnel.mockReturnValue(result({ data: { weeks: [week('2026-W40', { signups: 0, verified: 0, onboarded: 0 }), week('2026-W41')] } }))
        render(<ActivationFunnelPage />)
        expect(screen.queryByText('NaN%')).toBeNull()
        expect(screen.queryByText('Infinity%')).toBeNull()
        expect(within(screen.getByRole('table')).getAllByText('-').length).toBeGreaterThan(0)
    })

    it('shows a loading state', () => {
        useActivationFunnel.mockReturnValue(result({ data: undefined, isLoading: true }))
        render(<ActivationFunnelPage />)
        expect(screen.getByRole('status', { name: /loading the funnel/i })).toBeInTheDocument()
    })

    it('shows an error with a retry', () => {
        const refetch = vi.fn()
        useActivationFunnel.mockReturnValue(result({ data: undefined, isError: true, refetch }))
        render(<ActivationFunnelPage />)
        fireEvent.click(screen.getByRole('button', { name: /try again/i }))
        expect(refetch).toHaveBeenCalled()
    })

    it('shows an empty state when nobody signed up', () => {
        useActivationFunnel.mockReturnValue(result({ data: { weeks: [] } }))
        render(<ActivationFunnelPage />)
        expect(screen.getByText(/no sign-ups in the last 12 weeks/i)).toBeInTheDocument()
        expect(screen.queryByRole('table')).toBeNull()
    })

    it('lets the owner in too', () => {
        useAuth.mockReturnValue({ user: { id: 'o1', role: 'owner' }, loading: false })
        render(<ActivationFunnelPage />)
        expect(screen.getByRole('heading', { name: 'Activation funnel' })).toBeInTheDocument()
        expect(replace).not.toHaveBeenCalled()
    })
})

describe('ActivationFunnelPage access', () => {
    it('sends a visitor to sign in and asks for nothing', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        render(<ActivationFunnelPage />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=/admin/activation')
        expect(useActivationFunnel).toHaveBeenLastCalledWith(12, false)
        expect(screen.queryByRole('table')).toBeNull()
    })

    it('sends a member home and shows nothing', () => {
        useAuth.mockReturnValue({ user: { id: 'u1', role: 'user' }, loading: false })
        render(<ActivationFunnelPage />)
        expect(replace).toHaveBeenCalledWith('/')
        expect(useActivationFunnel).toHaveBeenLastCalledWith(12, false)
        expect(screen.queryByRole('heading', { name: 'Activation funnel' })).toBeNull()
    })

    it('sends a moderator to the admin dashboard', () => {
        useAuth.mockReturnValue({ user: { id: 'm1', role: 'moderator' }, loading: false })
        render(<ActivationFunnelPage />)
        expect(replace).toHaveBeenCalledWith('/admin')
        expect(screen.queryByRole('table')).toBeNull()
    })

    it('waits for the session before deciding', () => {
        useAuth.mockReturnValue({ user: null, loading: true })
        render(<ActivationFunnelPage />)
        expect(replace).not.toHaveBeenCalled()
        expect(screen.getByRole('status')).toBeInTheDocument()
    })
})
