import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCard } from '@/lib/labs/__tests__/fixtures'

const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
const auth = vi.hoisted(() => ({ current: { user: null as { id: string; role: string } | null, loading: false } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const list = vi.hoisted(() => ({ current: {} as Record<string, unknown>, calls: [] as unknown[] }))
vi.mock('@/hooks/queries/useLabs', () => ({ useManagedLabs: (params: unknown) => { list.calls.push(params); return list.current } }))
vi.mock('@/components/internships/ViewerTime', () => ({ ViewerTime: ({ iso }: { iso: string }) => <time>{iso}</time> }))

import { AdminLabsView, needsFlag } from '../AdminLabsView'

const row = (over = {}) => ({ ...makeCard(), status: 'published', flagCount: 2, startCount: 5, updatedAt: '2030-01-01T00:00:00Z', ...over })
const result = (rows: unknown[], pagination = { page: 1, limit: 20, total: rows.length, totalPages: 1, hasMore: false }) => ({ data: { data: rows, pagination }, isLoading: false, isError: false, refetch: vi.fn() })

beforeEach(() => {
    vi.clearAllMocks()
    list.calls = []
    auth.current = { user: { id: 'a', role: 'admin' }, loading: false }
    list.current = result([row()])
})

describe('AdminLabsView', () => {
    it('lets admins and owners in', () => {
        const { unmount } = render(<AdminLabsView />)
        expect(screen.getByRole('heading', { level: 1, name: 'Labs' })).toBeInTheDocument()
        unmount()
        auth.current = { user: { id: 'o', role: 'owner' }, loading: false }
        render(<AdminLabsView />)
        expect(screen.getByRole('heading', { level: 1, name: 'Labs' })).toBeInTheDocument()
    })

    it('keeps moderators and members out', () => {
        auth.current = { user: { id: 'm', role: 'moderator' }, loading: false }
        const { unmount } = render(<AdminLabsView />)
        expect(screen.getByText('Only administrators and owners can manage labs.')).toBeInTheDocument()
        expect(screen.queryByTestId('admin-lab')).not.toBeInTheDocument()
        unmount()
        auth.current = { user: { id: 'u', role: 'user' }, loading: false }
        render(<AdminLabsView />)
        expect(screen.getByText('Only administrators and owners can manage labs.')).toBeInTheDocument()
    })

    it('shows the counters and warns about a published lab without a flag', () => {
        list.current = result([row({ title: 'Ready lab' }), row({ _id: '2', slug: 'no-flag-lab', title: 'No flag lab', flagCount: 0, startCount: 9 }), row({ _id: '3', slug: 'draft-lab', title: 'Draft lab', status: 'draft', flagCount: 0 })])
        render(<AdminLabsView />)
        const rows = screen.getAllByTestId('admin-lab')
        expect(within(rows[0]).getByTestId('admin-counts')).toHaveTextContent('2 flags')
        expect(within(rows[0]).getByTestId('admin-counts')).toHaveTextContent('5 started')
        expect(within(rows[0]).queryByTestId('no-flag-warning')).not.toBeInTheDocument()
        expect(within(rows[1]).getByTestId('no-flag-warning')).toHaveTextContent('Published without a flag')
        expect(within(rows[2]).queryByTestId('no-flag-warning')).not.toBeInTheDocument()
        expect(screen.getByTestId('unflagged-banner')).toHaveTextContent('1 published lab has no flag')
        expect(within(rows[1]).getByRole('link', { name: /Edit/ })).toHaveAttribute('href', '/admin/labs/no-flag-lab/edit')
        expect(needsFlag({ status: 'archived', flagCount: 0 })).toBe(false)
    })

    it('filters by status and goes back to page one', () => {
        render(<AdminLabsView />)
        fireEvent.click(screen.getByRole('button', { name: 'Draft' }))
        expect(list.calls[list.calls.length - 1]).toEqual({ page: 1, status: 'draft' })
    })

    it('pages by hasMore, since the total is only counted on page one', () => {
        list.current = result([row()], { page: 2, limit: 20, total: null as never, totalPages: null as never, hasMore: false })
        render(<AdminLabsView />)
        expect(screen.getByText('Page 2')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled()
    })

    it('shows the empty state with a way to create the first lab', () => {
        list.current = result([])
        render(<AdminLabsView />)
        expect(screen.getByText('No labs yet')).toBeInTheDocument()
        for (const link of screen.getAllByRole('link', { name: /New lab/ })) expect(link).toHaveAttribute('href', '/admin/labs/create')
    })
})
