import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeResource } from '@/lib/learning/__tests__/fixtures'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => '/resources/my', useSearchParams: () => new URLSearchParams() }))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

const mine = vi.hoisted(() => ({ current: {} as Record<string, unknown>, status: '' }))
const reading = vi.hoisted(() => ({ current: {} as Record<string, unknown>, status: '' }))
const del = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useResources', () => ({
    useMyResourceSubmissions: (s: string) => { mine.status = s; return mine.current },
    useReadingList: (s: string) => { reading.status = s; return reading.current },
    useDeleteResource: () => del,
    useVoteResource: () => ({ mutate: vi.fn(), isPending: false }),
    useBookmarkResource: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { MyResourcesView } from '../MyResourcesView'

const page = (data: unknown[], counts?: Record<string, number>, extra = {}) => ({
    isLoading: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    data: { pages: [{ data, counts, pagination: { page: 1, limit: 12, total: data.length, totalPages: 1, hasMore: false } }] }, ...extra,
})

beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ user: { id: 'u1', username: 'ada', role: 'user' }, loading: false })
    mine.current = page([
        makeResource({ id: 'a', slug: 'waiting', title: 'Waiting one', status: 'pending' }),
        makeResource({ id: 'b', slug: 'rejected', title: 'Rejected one', status: 'rejected', rejectionCode: 'duplicate', rejectionReason: 'Same as another link' }),
    ], { pending: 1, rejected: 1, approved: 0 })
    reading.current = page([])
})

describe('my submissions', () => {
    it('sends a signed-out visitor to sign in and back', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        render(<MyResourcesView />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fresources%2Fmy')
    })
    it('shows each submission with its status and the rejection reason', () => {
        render(<MyResourcesView />)
        const list = screen.getByTestId('my-submissions')
        expect(list).toHaveTextContent('Waiting one')
        expect(list).toHaveTextContent('Waiting for review')
        expect(list).toHaveTextContent('Rejected')
        expect(list).toHaveTextContent('Same as another link')
    })
    it('offers edit and resubmit for a rejected one', () => {
        render(<MyResourcesView />)
        expect(screen.getByRole('link', { name: /Edit and resubmit/ })).toHaveAttribute('href', '/resources/rejected/edit')
    })
    it('filters by status with the tabs', () => {
        render(<MyResourcesView />)
        fireEvent.click(screen.getByRole('tab', { name: /Rejected/ }))
        expect(mine.status).toBe('rejected')
    })
    it('confirms before deleting', () => {
        render(<MyResourcesView />)
        fireEvent.click(screen.getAllByRole('button', { name: /Delete/ })[0])
        const dialog = screen.getByRole('dialog')
        expect(del.mutate).not.toHaveBeenCalled()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
        expect(del.mutate).toHaveBeenCalledWith({ slug: 'waiting' }, expect.any(Object))
    })
    it('shows empty and error states', () => {
        mine.current = page([])
        const { unmount } = render(<MyResourcesView />)
        expect(screen.getByText('You have not submitted anything yet')).toBeInTheDocument()
        unmount()
        mine.current = { ...page([]), isError: true, error: new ApiError('down', 500), data: undefined }
        render(<MyResourcesView />)
        expect(screen.getByText('Could not load your submissions')).toBeInTheDocument()
    })
    it('has a reading list tab', () => {
        render(<MyResourcesView />)
        fireEvent.click(screen.getByRole('tab', { name: 'Reading list' }))
        expect(screen.getByText('Your reading list is empty')).toBeInTheDocument()
    })
})
