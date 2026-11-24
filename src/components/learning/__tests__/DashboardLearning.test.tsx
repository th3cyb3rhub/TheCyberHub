import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeDetail, node, progress } from '@/lib/learning/__tests__/fixtures'

const summary = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/hooks/queries/useLearningPaths', () => ({ useLearningSummary: () => summary.current }))

import { DashboardLearning } from '../DashboardLearning'

const card = () => {
    const { modules: _m, stages: _s, prerequisites: _p, description: _d, archived: _a, viewer: _v, ...rest } = makeDetail()
    return { ...rest, viewer: null }
}
const fallback = <a href="/cheatsheets">Cheatsheets</a>

beforeEach(() => {
    summary.current = { isLoading: false, isError: false, error: null, refetch: vi.fn(), data: { totals: { enrolled: 0, inProgress: 0, completed: 0, roadmapsCompleted: 0 }, continue: [], recentlyCompleted: [] } }
})

describe('the dashboard learning block', () => {
    it('shows the roadmaps in progress with the next step and always the quick links', () => {
        summary.current = { ...(summary.current as object), data: { totals: { enrolled: 1, inProgress: 1, completed: 0, roadmapsCompleted: 0 }, continue: [{ path: card(), progress: progress({ percent: 33 }), next: node({ id: 'b', title: 'Injection' }) }], recentlyCompleted: [] } }
        render(<DashboardLearning fallback={fallback} />)
        const link = screen.getByRole('link', { name: /Web hacking/ })
        expect(link).toHaveAttribute('href', '/roadmaps/web-hacking')
        expect(link).toHaveTextContent('Injection')
        expect(screen.getByRole('progressbar', { name: /Progress in Web hacking/ })).toHaveAttribute('aria-valuenow', '33')
        expect(screen.getByRole('link', { name: 'Cheatsheets' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /See all your progress/ })).toHaveAttribute('href', '/roadmaps?tab=mine')
    })
    it('invites a new member to start a roadmap', () => {
        render(<DashboardLearning fallback={fallback} />)
        expect(screen.getByTestId('dashboard-learning-empty')).toHaveAttribute('href', '/roadmaps')
        expect(screen.getByRole('link', { name: 'Cheatsheets' })).toBeInTheDocument()
    })
    it('shows a loading state, and an error with a retry that keeps the quick links', () => {
        summary.current = { isLoading: true, isError: false, data: undefined }
        const { unmount } = render(<DashboardLearning fallback={fallback} />)
        expect(screen.getByRole('status', { name: /Loading your learning progress/ })).toBeInTheDocument()
        unmount()
        const refetch = vi.fn()
        summary.current = { isLoading: false, isError: true, error: new ApiError('down', 500), data: undefined, refetch }
        render(<DashboardLearning fallback={fallback} />)
        expect(screen.getByRole('alert')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()
        expect(screen.getByRole('link', { name: 'Cheatsheets' })).toBeInTheDocument()
    })
})
