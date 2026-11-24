import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import type { LearningCard } from '@/types/learning'
import { makeCard, progress } from '@/lib/learning/__tests__/fixtures'

const replace = vi.fn()
const search = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => '/roadmaps', useSearchParams: () => new URLSearchParams(search.value),
}))
const useAuth = vi.fn()
vi.mock('@/context/AuthContext', () => ({ useAuth: () => useAuth() }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

const list = vi.hoisted(() => ({ current: {} as Record<string, unknown>, filters: undefined as unknown }))
const summary = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/hooks/queries/useLearningPaths', () => ({
    useLearningList: (f: unknown) => { list.filters = f; return list.current },
    useLearningSummary: () => summary.current,
    useBookmarkPath: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { LearningCatalog } from '../LearningCatalog'

const card = (over: Partial<LearningCard> = {}) => ({ ...makeCard(), ...over })
const page = (data: unknown[], extra = {}) => ({
    isLoading: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    data: { pages: [{ data, pagination: { page: 1, limit: 12, total: data.length, totalPages: 1, hasMore: false } }] }, ...extra,
})

beforeEach(() => {
    vi.clearAllMocks()
    search.value = ''
    useAuth.mockReturnValue({ user: { id: 'u1', role: 'user' }, loading: false })
    list.current = page([card(), card({ id: 'p2', slug: 'blue-team', title: 'Blue team' })])
    summary.current = { isLoading: false, isError: false, error: null, refetch: vi.fn(), data: { totals: { enrolled: 1, inProgress: 1, completed: 0, roadmapsCompleted: 0 }, continue: [], recentlyCompleted: [] } }
})

describe('the roadmap index', () => {
    it('asks only for roadmaps and links each card to its page', () => {
        render(<LearningCatalog kind="roadmap" />)
        expect(list.filters).toMatchObject({ kind: 'roadmap' })
        expect(screen.getByRole('link', { name: 'Web hacking' })).toHaveAttribute('href', '/roadmaps/web-hacking')
    })
    it('puts the filters in the address and ignores unknown values', () => {
        search.value = 'category=offensive&difficulty=nope&sort=new'
        render(<LearningCatalog kind="roadmap" />)
        expect(list.filters).toMatchObject({ category: 'offensive', difficulty: undefined, sort: 'new' })
        fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'advanced' } })
        expect(replace).toHaveBeenCalledWith('/roadmaps?category=offensive&difficulty=advanced&sort=new', { scroll: false })
    })
    it('does not send a one letter search', () => {
        search.value = 'q=a'
        render(<LearningCatalog kind="roadmap" />)
        expect(list.filters).toMatchObject({ search: undefined })
    })
    it('shows the loading, error and empty states', () => {
        list.current = { ...page([]), isLoading: true, data: undefined }
        const { unmount } = render(<LearningCatalog kind="roadmap" />)
        expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
        unmount()
        const refetch = vi.fn()
        list.current = { ...page([]), isError: true, error: new ApiError('down', 500), data: undefined, refetch }
        const second = render(<LearningCatalog kind="roadmap" />)
        fireEvent.click(screen.getByRole('button', { name: /try again/i }))
        expect(refetch).toHaveBeenCalled()
        second.unmount()
        list.current = page([])
        render(<LearningCatalog kind="roadmap" />)
        expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    it('shows the progress tab only to signed in members', () => {
        useAuth.mockReturnValue({ user: null, loading: false })
        const { unmount } = render(<LearningCatalog kind="roadmap" />)
        expect(screen.queryByRole('tab', { name: 'My progress' })).toBeNull()
        unmount()
        useAuth.mockReturnValue({ user: { id: 'u1', role: 'user' }, loading: false })
        render(<LearningCatalog kind="roadmap" />)
        expect(screen.getByRole('tab', { name: 'My progress' })).toBeInTheDocument()
    })
})

describe('my progress tab', () => {
    beforeEach(() => { search.value = 'tab=mine' })
    it('lists the paths in progress with the next step', () => {
        summary.current = {
            ...(summary.current as object),
            data: { totals: { enrolled: 1, inProgress: 1, completed: 0, roadmapsCompleted: 0 }, continue: [{ path: card(), progress: progress({ percent: 33 }), next: { id: 'b', key: 'b', title: 'Injection', stage: null, optional: false, requires: [], items: [] } }], recentlyCompleted: [] },
        }
        render(<LearningCatalog kind="roadmap" />)
        expect(screen.getByTestId('continue-list')).toHaveTextContent('Web hacking')
        expect(screen.getByTestId('continue-list')).toHaveTextContent('Injection')
        expect(screen.getByRole('link', { name: 'Web hacking' })).toHaveAttribute('href', '/roadmaps/web-hacking')
    })
    it('invites the member to start when nothing is in progress', () => {
        render(<LearningCatalog kind="roadmap" />)
        expect(screen.getByText('Nothing started yet')).toBeInTheDocument()
    })
    it('shows completed items with their certificate', () => {
        summary.current = { ...(summary.current as object), data: { totals: { enrolled: 1, inProgress: 0, completed: 1, roadmapsCompleted: 1 }, continue: [], recentlyCompleted: [{ path: card(), completedAt: '2026-11-03T10:00:00Z', certificateId: 'CH-1' }] } }
        render(<LearningCatalog kind="roadmap" />)
        expect(screen.getByRole('link', { name: /Certificate/ })).toHaveAttribute('href', '/certificates/CH-1')
    })
    it('shows the error of the summary with a retry', () => {
        const refetch = vi.fn()
        summary.current = { isLoading: false, isError: true, error: new ApiError('down', 500), data: undefined, refetch }
        render(<LearningCatalog kind="roadmap" />)
        fireEvent.click(screen.getByRole('button', { name: /try again/i }))
        expect(refetch).toHaveBeenCalled()
    })
})
