import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeCard } from '@/lib/labs/__tests__/fixtures'

const replace = vi.hoisted(() => vi.fn())
const search = vi.hoisted(() => ({ current: '' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => '/labs', useSearchParams: () => new URLSearchParams(search.current) }))
const auth = vi.hoisted(() => ({ current: { user: null as { id: string; role: string } | null } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const board = vi.hoisted(() => ({ current: {} as Record<string, unknown>, calls: [] as unknown[] }))
const list = vi.hoisted(() => ({ current: {} as Record<string, unknown>, calls: [] as unknown[][] }))
vi.mock('@/hooks/queries/useLabs', () => ({
    useLabs: (filters: unknown, initial: unknown) => { list.calls.push([filters, initial]); return list.current },
    useLabStats: () => ({ isLoading: false, isError: false, data: { totalStarted: 3, totalCompleted: 2, totalPoints: 150, totalHintsUsed: 1, totalTimeSpent: 0, byDifficulty: { easy: { started: 2, completed: 2, points: 100 }, hard: { started: 1, completed: 0, points: 0 } } } }),
    useGlobalLeaderboard: (params: unknown) => { board.calls.push(params); return board.current },
    useLabCategories: () => ({ data: { total: 3, categories: [{ category: 'web-security', count: 2 }, { category: 'osint', count: 1 }], difficulties: [{ difficulty: 'easy', count: 2 }] } }),
}))

import { LabsExplorer } from '../LabsExplorer'

const result = (cards: unknown[], extra = {}, total: number | null = cards.length) => ({
    data: { pages: [{ data: cards, pagination: { page: 1, limit: 12, total, totalPages: 1, hasMore: false } }] },
    isLoading: false, isError: false, isPlaceholderData: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(), ...extra,
})
const cards = () => [makeCard({ _id: '1', slug: 'one-lab', title: 'One' }), makeCard({ _id: '2', slug: 'two-lab', title: 'Two', difficulty: 'hard' })]
const lastFilters = () => list.calls[list.calls.length - 1][0]
const lastInitial = () => list.calls[list.calls.length - 1][1]

beforeEach(() => {
    vi.clearAllMocks()
    list.calls = []
    search.current = ''
    auth.current = { user: null }
    list.current = result(cards())
    board.calls = []
    board.current = { data: [], isLoading: false, isError: false, refetch: vi.fn() }
})
afterEach(() => { vi.useRealTimers(); window.history.replaceState(null, '', '/') })

describe('LabsExplorer filters in the address', () => {
    it('reads the filters from the address and sends them to the API', () => {
        search.current = 'category=osint&difficulty=hard&sort=points&q=sql'
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(lastFilters()).toEqual({ category: 'osint', difficulty: 'hard', status: '', q: 'sql', sort: 'points' })
        expect(screen.getByLabelText('Category')).toHaveValue('osint')
        expect(screen.getByLabelText('Sort by')).toHaveValue('points')
        expect(screen.getByRole('button', { name: /^Hard/ })).toHaveAttribute('aria-pressed', 'true')
    })

    it('writes a chosen difficulty and category to the address and drops the defaults', () => {
        search.current = 'sort=points'
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        fireEvent.click(screen.getByRole('button', { name: /^Easy/ }))
        expect(replace).toHaveBeenLastCalledWith('/labs?sort=points&difficulty=easy', { scroll: false })
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'osint' } })
        expect(replace).toHaveBeenLastCalledWith('/labs?sort=points&category=osint', { scroll: false })
        fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'newest' } })
        expect(replace).toHaveBeenLastCalledWith('/labs', { scroll: false })
    })

    it('clears every filter', () => {
        search.current = 'category=osint&difficulty=hard&q=sql'
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
        expect(replace).toHaveBeenLastCalledWith('/labs', { scroll: false })
    })

    it('hands the server page over for the plain list only', () => {
        const page = { success: true, count: 0, data: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 1, hasMore: false } }
        render(<LabsExplorer initialPage={page} initialFacets={null} />)
        expect(lastInitial()).toBe(page)
        search.current = 'difficulty=easy'
        render(<LabsExplorer initialPage={page} initialFacets={null} />)
        expect(lastInitial()).toBeNull()
    })
})

describe('LabsExplorer status filter', () => {
    it('offers the member states only when signed in, and sends them', () => {
        const { unmount } = render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.queryByRole('group', { name: 'My progress' })).not.toBeInTheDocument()
        unmount()
        auth.current = { user: { id: 'u1', role: 'user' } }
        search.current = 'status=completed'
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(lastFilters()).toMatchObject({ status: 'completed' })
        fireEvent.click(screen.getByRole('button', { name: 'In progress' }))
        expect(replace).toHaveBeenLastCalledWith('/labs?status=in-progress', { scroll: false })
    })

    it('ignores the status in the address for a visitor', () => {
        search.current = 'status=completed'
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(lastFilters()).toMatchObject({ status: '' })
    })

    it('shows the admin link to admins and owners only', () => {
        const { unmount } = render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.queryByRole('link', { name: /Manage labs/ })).not.toBeInTheDocument()
        unmount()
        auth.current = { user: { id: 'm', role: 'moderator' } }
        const second = render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.queryByRole('link', { name: /Manage labs/ })).not.toBeInTheDocument()
        second.unmount()
        auth.current = { user: { id: 'a', role: 'admin' } }
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByRole('link', { name: /Manage labs/ })).toHaveAttribute('href', '/admin/labs')
    })
})

describe('LabsExplorer search', () => {
    it('waits 300 ms after the last key before it changes the address', () => {
        vi.useFakeTimers()
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        const box = screen.getByLabelText('Search labs')
        fireEvent.change(box, { target: { value: 'sq' } })
        act(() => { vi.advanceTimersByTime(250) })
        expect(replace).not.toHaveBeenCalled()
        fireEvent.change(box, { target: { value: 'sql' } })
        act(() => { vi.advanceTimersByTime(250) })
        expect(replace).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(60) })
        expect(replace).toHaveBeenCalledTimes(1)
        expect(replace).toHaveBeenLastCalledWith('/labs?q=sql', { scroll: false })
    })

    it('does not send one character to the API and says why', () => {
        search.current = 'q=a'
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(lastFilters()).toMatchObject({ q: '' })
        expect(screen.getByText(/Type at least 2 characters/)).toBeInTheDocument()
    })

    it('removes the query from the address when the box is emptied', () => {
        vi.useFakeTimers()
        search.current = 'q=sql&difficulty=easy'
        // The push reads the live address, so other filters changed meanwhile are kept
        window.history.replaceState(null, '', '/labs?q=sql&difficulty=easy')
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        fireEvent.change(screen.getByLabelText('Search labs'), { target: { value: '' } })
        act(() => { vi.advanceTimersByTime(310) })
        expect(replace).toHaveBeenLastCalledWith('/labs?difficulty=easy', { scroll: false })
    })
})

describe('LabsExplorer list', () => {
    it('counts with the total of page 1 and says nothing wrong when it is missing', () => {
        list.current = result(cards(), {}, 30)
        const { unmount } = render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByTestId('lab-count')).toHaveTextContent('Showing 2 of 30 labs')
        unmount()
        list.current = result(cards(), {}, null)
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByTestId('lab-count')).toHaveTextContent('2 labs')
    })

    it('shows each lab with its state, points and counts', () => {
        auth.current = { user: { id: 'u1', role: 'user' } }
        list.current = result([makeCard({ myStatus: 'completed', points: 50, hintCount: 2, fileCount: 1, estimatedMinutes: 90 })])
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        const card = screen.getByTestId('lab-card')
        expect(card).toHaveTextContent('Completed')
        expect(card).toHaveTextContent('50 pts')
        expect(card).toHaveTextContent('2 hints')
        expect(card).toHaveTextContent('1 file')
        expect(card).toHaveTextContent('1 h 30 min')
        expect(screen.getByRole('link', { name: 'SQL Injection Basics' })).toHaveAttribute('href', '/labs/sql-injection-basics')
    })

    it('loads more while the API says there is more', () => {
        const fetchNextPage = vi.fn()
        list.current = result(cards(), { hasNextPage: true, fetchNextPage }, 20)
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
        expect(fetchNextPage).toHaveBeenCalled()
    })

    it('shows the empty, filtered-empty, loading and error states', () => {
        list.current = result([])
        const a = render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByText('No labs are published yet')).toBeInTheDocument()
        a.unmount()
        search.current = 'difficulty=hard'
        const b = render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByText('No labs match these filters')).toBeInTheDocument()
        b.unmount()
        list.current = result([], { isLoading: true, data: undefined })
        const c = render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByRole('status', { name: 'Loading labs' })).toBeInTheDocument()
        c.unmount()
        const refetch = vi.fn()
        list.current = result([], { isError: true, data: undefined, error: new Error('boom'), refetch })
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByRole('alert')).toHaveTextContent('boom')
        fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
        expect(refetch).toHaveBeenCalled()
    })
})

describe('LabsExplorer leaderboard tab', () => {
    const row = (rank: number, username: string, name: string | null, totalPoints: number, labsCompleted: number) => ({ rank, user: { username, name, avatar: null }, totalPoints, labsCompleted })

    it('switches tab through the address and keeps the other filters', () => {
        search.current = 'category=osint'
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByRole('tab', { name: 'Labs' })).toHaveAttribute('aria-selected', 'true')
        fireEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }))
        expect(replace).toHaveBeenLastCalledWith('/labs?category=osint&tab=leaderboard', { scroll: false })
    })

    it('shows the board for the category in the address, with people as name, username and a profile link', () => {
        search.current = 'tab=leaderboard&category=osint'
        board.current = { data: [row(1, 'ada', 'Ada Lovelace', 300, 4), row(2, 'linus', null, 150, 2)], isLoading: false, isError: false, refetch: vi.fn() }
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(board.calls[board.calls.length - 1]).toEqual({ category: 'osint', limit: 25 })
        const rows = screen.getAllByTestId('board-row')
        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveTextContent('Ada Lovelace')
        expect(rows[0]).toHaveTextContent('@ada')
        expect(rows[0]).toHaveTextContent('300')
        expect(rows[1]).toHaveTextContent('@linus')
        expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/user/ada')
        expect(screen.queryByTestId('lab-grid')).not.toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } })
        expect(replace).toHaveBeenLastCalledWith('/labs?tab=leaderboard', { scroll: false })
    })

    it('marks the signed-in member on the board', () => {
        auth.current = { user: { id: 'u1', role: 'user', username: 'ada' } as never }
        search.current = 'tab=leaderboard'
        board.current = { data: [row(1, 'ada', 'Ada Lovelace', 300, 4)], isLoading: false, isError: false, refetch: vi.fn() }
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByTestId('board-row')).toHaveAttribute('aria-current', 'true')
    })

    it('shows an empty board and an error with a retry', () => {
        search.current = 'tab=leaderboard'
        const a = render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByText('No completions yet')).toBeInTheDocument()
        a.unmount()
        const refetch = vi.fn()
        board.current = { data: undefined, isLoading: false, isError: true, error: new Error('down'), refetch }
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
        expect(refetch).toHaveBeenCalled()
    })
})

describe('LabsExplorer stats card', () => {
    it('shows a member their totals and the split by difficulty, and a visitor nothing', () => {
        const a = render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.queryByTestId('labs-stats')).not.toBeInTheDocument()
        a.unmount()
        auth.current = { user: { id: 'u1', role: 'user' } }
        render(<LabsExplorer initialPage={null} initialFacets={null} />)
        expect(screen.getByTestId('stat-started')).toHaveTextContent('3')
        expect(screen.getByTestId('stat-completed')).toHaveTextContent('2')
        expect(screen.getByTestId('stat-points')).toHaveTextContent('150')
        expect(screen.getByTestId('stat-easy')).toHaveTextContent('2 of 2 completed, 100 pts')
        expect(screen.getByTestId('stat-medium')).toHaveTextContent('0 of 0 completed, 0 pts')
    })
})
