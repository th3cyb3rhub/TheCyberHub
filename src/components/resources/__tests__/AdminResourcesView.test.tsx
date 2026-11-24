import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeResource } from '@/lib/learning/__tests__/fixtures'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))

const queue = vi.hoisted(() => ({ current: {} as Record<string, unknown>, args: [] as unknown[] }))
const approve = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }))
const reject = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null }))
const link = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null }))
const feature = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useResources', () => ({
    useResourceReviewQueue: (...args: unknown[]) => { queue.args = args; return queue.current },
    useApproveResource: () => approve, useRejectResource: () => reject, useSetLinkStatus: () => link, useFeatureResource: () => feature,
}))

import { AdminResourcesView } from '../AdminResourcesView'

const pending = makeResource({ id: 'r1', slug: 'pending-one', title: 'Pending One', status: 'pending', approvedAt: null, submittedBy: { username: 'sam', avatar: null }, submitterRecord: { approved: 3, rejected: 1, pending: 1 }, sameDomainCount: 2, openReports: 0 })
const reported = makeResource({ id: 'r2', slug: 'reported-one', title: 'Reported One', status: 'approved', openReports: 2, linkStatus: 'broken' })
const page = (data: unknown[], counts?: Record<string, number>) => ({
    isLoading: false, isError: false, error: null, data: { pages: [{ data, counts, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1, hasMore: false } }] },
    hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
})

beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({ user: { id: 'm1', username: 'mod', role: 'moderator' }, loading: false })
    queue.current = page([pending, reported], { pending: 1, broken: 1 })
})

describe('access', () => {
    it('sends a signed-out visitor to sign in and back', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        render(<AdminResourcesView />)
        expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Fadmin%2Fresources')
        expect(screen.queryByTestId('queue')).toBeNull()
    })
    it('keeps ordinary members out', () => {
        useAuth.mockReturnValue({ user: { id: 'u', role: 'user' }, loading: false })
        render(<AdminResourcesView />)
        expect(screen.getByText('You cannot open this page')).toBeInTheDocument()
        expect(screen.queryByTestId('queue')).toBeNull()
    })
})

describe('the queue', () => {
    it('asks for the pending queue first and shows each row', () => {
        render(<AdminResourcesView />)
        expect(queue.args[0]).toBe('pending')
        const rows = screen.getAllByTestId('queue-row')
        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveTextContent('By @sam')
        expect(rows[0]).toHaveTextContent(/3 approved, 1 rejected/)
        expect(rows[1]).toHaveTextContent('2 open reports')
    })
    it('switches queue with the tabs', () => {
        render(<AdminResourcesView />)
        fireEvent.click(screen.getByRole('tab', { name: /Broken links/ }))
        expect(queue.args[0]).toBe('broken')
    })
    it('shows the loading, error and empty states', () => {
        queue.current = { ...page([]), isLoading: true, data: undefined }
        const { unmount } = render(<AdminResourcesView />)
        expect(screen.getByRole('status', { name: 'Loading the queue' })).toBeInTheDocument()
        unmount()
        const refetch = vi.fn()
        queue.current = { ...page([]), isError: true, error: new ApiError('down', 500), data: undefined, refetch }
        const second = render(<AdminResourcesView />)
        fireEvent.click(screen.getByRole('button', { name: /try again/i }))
        expect(refetch).toHaveBeenCalled()
        second.unmount()
        queue.current = page([])
        render(<AdminResourcesView />)
        expect(screen.getByText('Queue clear')).toBeInTheDocument()
    })
})

describe('moderating', () => {
    it('approves from the row', () => {
        render(<AdminResourcesView />)
        fireEvent.click(within(screen.getAllByTestId('queue-row')[0]).getByRole('button', { name: /Approve/ }))
        expect(approve.mutate).toHaveBeenCalledWith({ slug: 'pending-one', title: 'Pending One' })
    })
    it('offers approve only for entries waiting for review', () => {
        queue.current = page([pending, makeResource({ id: 'r3', slug: 'gone', title: 'Rejected One', status: 'rejected' }), reported])
        render(<AdminResourcesView />)
        const rows = screen.getAllByTestId('queue-row')
        expect(within(rows[0]).getByRole('button', { name: /Approve/ })).toBeInTheDocument()
        expect(within(rows[1]).queryByRole('button', { name: /Approve/ })).toBeNull()
        expect(within(rows[2]).queryByRole('button', { name: /Approve/ })).toBeNull()
    })
    it('does not offer to approve what is already approved', () => {
        render(<AdminResourcesView />)
        expect(within(screen.getAllByTestId('queue-row')[1]).queryByRole('button', { name: /Approve/ })).toBeNull()
    })
    it('needs a reason to reject and a note for "other"', () => {
        render(<AdminResourcesView />)
        fireEvent.click(within(screen.getAllByTestId('queue-row')[0]).getByRole('button', { name: /Reject/ }))
        const dialog = screen.getByRole('dialog')
        const confirm = within(dialog).getByRole('button', { name: 'Reject' })
        expect(confirm).toBeDisabled()
        fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'other' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))
        expect(reject.mutate).not.toHaveBeenCalled()
        expect(within(dialog).getByText(/note is required/)).toBeInTheDocument()
        fireEvent.change(within(dialog).getByLabelText(/Note/), { target: { value: 'Not about security' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))
        expect(reject.mutate).toHaveBeenCalledWith({ slug: 'pending-one', reason: 'other', note: 'Not about security' }, expect.any(Object))
    })
    it('records a link check', () => {
        render(<AdminResourcesView />)
        fireEvent.click(within(screen.getAllByTestId('queue-row')[1]).getByRole('button', { name: /Link status/ }))
        const dialog = screen.getByRole('dialog')
        fireEvent.change(within(dialog).getByLabelText('Link status'), { target: { value: 'ok' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
        expect(link.mutate).toHaveBeenCalledWith({ slug: 'reported-one', status: 'ok', note: '' }, expect.any(Object))
    })
    it('does not let a moderator review their own submission', () => {
        useAuth.mockReturnValue({ user: { id: 'm1', username: 'sam', role: 'moderator' }, loading: false })
        render(<AdminResourcesView />)
        const row = screen.getAllByTestId('queue-row')[0]
        expect(within(row).getByTestId('own-submission')).toBeInTheDocument()
        expect(within(row).queryByRole('button', { name: /Approve/ })).toBeNull()
        expect(within(row).queryByRole('button', { name: /Reject/ })).toBeNull()
    })
    it('shows the feature toggle to admins only', () => {
        const { unmount } = render(<AdminResourcesView />)
        expect(screen.queryByRole('button', { name: /^Feature/ })).toBeNull()
        unmount()
        useAuth.mockReturnValue({ user: { id: 'a1', username: 'root', role: 'admin' }, loading: false })
        render(<AdminResourcesView />)
        fireEvent.click(screen.getByRole('button', { name: /^Feature/ }))
        expect(feature.mutate).toHaveBeenCalledWith({ slug: 'reported-one', featured: true })
    })
    it('opens the submitted link safely and never as javascript', () => {
        queue.current = page([pending, makeResource({ id: 'r9', slug: 'bad', title: 'Bad', url: 'javascript:alert(1)', status: 'pending' })])
        const { container } = render(<AdminResourcesView />)
        expect(container.querySelector('a[href^="javascript"]')).toBeNull()
        const open = container.querySelector('a[href="https://owasp.org/Top10"]')
        expect(open?.getAttribute('rel')).toMatch(/noopener noreferrer/)
        expect(open?.getAttribute('target')).toBe('_blank')
    })
})
