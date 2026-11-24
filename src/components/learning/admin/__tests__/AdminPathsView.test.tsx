import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeDetail } from '@/lib/learning/__tests__/fixtures'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))

const admin = vi.hoisted(() => ({ current: {} as Record<string, unknown>, args: [] as unknown[] }))
vi.mock('@/hooks/queries/useLearningPaths', () => ({ useAdminPaths: (...args: unknown[]) => { admin.args = args; return admin.current } }))

import { AdminPathsView } from '../AdminPathsView'

const card = (over = {}) => {
    const { modules: _m, stages: _s, prerequisites: _p, description: _d, archived: _a, viewer: _v, ...rest } = makeDetail()
    return { ...rest, status: 'draft', createdBy: { id: 'u1', username: 'ada' }, updatedAt: '2026-11-20T10:00:00Z', ...over }
}
const page = (data: unknown[], counts?: Record<string, number>, extra = {}) => ({
    isLoading: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    data: { pages: [{ data, counts, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1, hasMore: false } }] }, ...extra,
})

beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ user: { id: 'm1', role: 'moderator' }, loading: false })
    admin.current = page([card(), card({ id: 'p2', slug: 'live', title: 'Live one', status: 'published', isFeatured: true }), card({ id: 'p3', slug: 'rework', title: 'Rework me', reviewNote: 'Add sources' })], { draft: 2, in_review: 0, published: 1, archived: 0 })
})

describe('the authoring list', () => {
    it('sends a signed-out visitor to sign in and back', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        render(<AdminPathsView />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fadmin%2Flearning-paths')
    })
    it('keeps ordinary members out and does not ask for the staff list', () => {
        useAuth.mockReturnValue({ user: { id: 'u', role: 'user' }, loading: false })
        render(<AdminPathsView />)
        expect(screen.getByText('You cannot open this page')).toBeInTheDocument()
        expect(admin.args[1]).toMatchObject({ enabled: false })
    })
    it('shows counts per status and rows with edit links', () => {
        render(<AdminPathsView />)
        expect(screen.getByRole('tab', { name: /Drafts/ })).toHaveTextContent('2')
        expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('3')
        const rows = screen.getAllByTestId('admin-path-row')
        expect(rows).toHaveLength(3)
        expect(within(rows[0]).getByRole('link', { name: /^Edit/ })).toHaveAttribute('href', '/admin/learning-paths/p1')
        expect(rows[1]).toHaveTextContent('Published')
        expect(rows[1]).toHaveTextContent('Featured')
        expect(within(rows[1]).getByRole('link', { name: 'View live' })).toHaveAttribute('href', '/roadmaps/live')
        expect(rows[2]).toHaveTextContent('Changes requested: Add sources')
    })
    it('filters by status and kind', () => {
        render(<AdminPathsView />)
        fireEvent.click(screen.getByRole('tab', { name: /Published/ }))
        expect(admin.args[0]).toMatchObject({ status: 'published' })
        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'path' } })
        expect(admin.args[0]).toMatchObject({ status: 'published', kind: 'path' })
    })
    it('links to the new roadmap form', () => {
        render(<AdminPathsView />)
        expect(screen.getByRole('link', { name: /New/ })).toHaveAttribute('href', '/admin/learning-paths/new')
    })
    it('shows the loading, error and empty states', () => {
        admin.current = { ...page([]), isLoading: true, data: undefined }
        const { unmount } = render(<AdminPathsView />)
        expect(screen.getByRole('status', { name: 'Loading the list' })).toBeInTheDocument()
        unmount()
        const refetch = vi.fn()
        admin.current = { ...page([]), isError: true, error: new ApiError('down', 500), data: undefined, refetch }
        const second = render(<AdminPathsView />)
        fireEvent.click(screen.getByRole('button', { name: /try again/i }))
        expect(refetch).toHaveBeenCalled()
        second.unmount()
        admin.current = page([])
        render(<AdminPathsView />)
        expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
    })
})
