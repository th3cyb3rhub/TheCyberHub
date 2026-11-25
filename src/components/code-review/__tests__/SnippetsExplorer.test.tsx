import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeCard } from '@/lib/codeReview/__tests__/fixtures'
import type { CrCard, CrFilters } from '@/types/codeReview'

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: '' }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
    usePathname: () => '/code-review',
    useSearchParams: () => new URLSearchParams(nav.search),
}))
const auth = vi.hoisted(() => ({ current: { user: null as null | { role: string }, loading: false } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))

const list = vi.hoisted(() => ({ filters: [] as unknown[], current: {} as Record<string, unknown>, stats: {} as Record<string, unknown> }))
vi.mock('@/hooks/queries/useCodeReview', () => ({
    useCodeSnippets: (filters: CrFilters, initial: unknown) => { list.filters.push({ filters, initial }); return list.current },
    useCodeReviewStats: () => list.stats,
}))

import { SnippetsExplorer } from '../SnippetsExplorer'

const page = (cards: CrCard[], total = cards.length) => ({ pages: [{ data: cards, pagination: { page: 1, limit: 12, total, pages: 1, hasMore: false } }] })
const ok = (cards: CrCard[], over = {}) => ({ data: page(cards), isLoading: false, isError: false, error: null, isPlaceholderData: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(), ...over })
const stats = (viewer: null | { attempted: number; passed: number; points: number } = null) => ({
    data: { total: 8, viewer, facets: { categories: [{ category: 'injection', count: 3 }, { category: 'web', count: 2 }, { category: 'sqli', count: 1 }], difficulties: [{ difficulty: 'easy', count: 4 }], languages: [{ language: 'python', count: 5 }] } },
})
const initial = { data: [], count: 0, pagination: { page: 1, limit: 12, total: 0, pages: 0, hasMore: false } }

beforeEach(() => {
    vi.clearAllMocks()
    nav.search = ''
    list.filters = []
    auth.current = { user: null, loading: false }
    list.current = ok([makeCard(), makeCard({ _id: 'c2', slug: 'second', title: 'Second one' })])
    list.stats = stats()
})

describe('SnippetsExplorer', () => {
    it('lists the exercises with a count, and has no member controls for a visitor', () => {
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        expect(screen.getAllByTestId('cr-card')).toHaveLength(2)
        expect(screen.getByTestId('cr-count')).toHaveTextContent('2 exercises')
        expect(screen.queryByRole('group', { name: 'My progress' })).not.toBeInTheDocument()
        expect(screen.queryByTestId('cr-stats')).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Manage exercises/ })).not.toBeInTheDocument()
    })

    it('does not send a status filter for a visitor even when the address has one', () => {
        nav.search = 'status=passed'
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        const sent = list.filters.at(-1) as { filters: CrFilters }
        expect(sent.filters.status ?? '').toBe('')
    })

    it('gives a member the status filter and the progress header', () => {
        auth.current = { user: { role: 'member' }, loading: false }
        list.stats = stats({ attempted: 3, passed: 2, points: 40 })
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        expect(screen.getByTestId('stat-attempted')).toHaveTextContent('3 of 8')
        expect(screen.getByTestId('stat-passed')).toHaveTextContent('2')
        expect(screen.getByTestId('stat-points')).toHaveTextContent('40')
        const group = screen.getByRole('group', { name: 'My progress' })
        expect(group).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Passed' }))
        expect(nav.replace).toHaveBeenCalledWith('/code-review?status=passed', { scroll: false })
    })

    it('sends the status filter for a member and skips the server copy', () => {
        auth.current = { user: { role: 'member' }, loading: false }
        nav.search = 'status=passed&category=injection'
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        const sent = list.filters.at(-1) as { filters: CrFilters; initial: unknown }
        expect(sent.filters.status).toBe('passed')
        expect(sent.filters.category).toBe('injection')
        expect(sent.initial).toBeNull()
    })

    it('shows card progress chips for a member', () => {
        auth.current = { user: { role: 'member' }, loading: false }
        list.current = ok([makeCard({ progress: { status: 'passed', attempts: 2, bestScore: 20, maxScore: 20, bestPercent: 100, passed: true, pointsEarned: 25 } })])
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        expect(screen.getByTestId('cr-card')).toHaveAttribute('data-status', 'passed')
        expect(screen.getByTestId('cr-card')).toHaveTextContent('25 points earned')
    })

    it('puts a filter in the address and clears them all', () => {
        nav.search = 'difficulty=easy'
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'injection' } })
        expect(nav.replace).toHaveBeenLastCalledWith('/code-review?difficulty=easy&category=injection', { scroll: false })
        expect(screen.getByRole('button', { name: /Easy/ })).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }))
        expect(nav.replace).toHaveBeenLastCalledWith('/code-review', { scroll: false })
    })

    it('offers the facet counts from the stats', () => {
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        expect(screen.getByRole('option', { name: 'Injection (3)' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Web (2)' })).toBeInTheDocument()
        // A value of the old category list in the totals would filter nothing, so it is not offered
        expect(screen.queryByRole('option', { name: /SQL injection/ })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Easy (4)' })).toBeInTheDocument()
    })

    it('links staff to the manage page', () => {
        auth.current = { user: { role: 'moderator' }, loading: false }
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        expect(screen.getByRole('link', { name: /Manage exercises/ }).getAttribute('href')).toBe('/admin/code-review')
    })

    it('shows an honest error with a retry, and never other exercises', () => {
        const refetch = vi.fn()
        list.current = { ...ok([]), data: undefined, isError: true, error: new ApiError('down', 503, 'SERVICE_UNAVAILABLE'), refetch }
        render(<SnippetsExplorer initialPage={null} initialStats={null} />)
        expect(screen.getByTestId('cr-error')).toBeInTheDocument()
        expect(screen.queryByTestId('cr-card')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()
    })

    it('says plainly when nothing is published, and when filters match nothing', () => {
        list.current = ok([])
        const { unmount } = render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        expect(screen.getByText('No exercises are published yet')).toBeInTheDocument()
        unmount()
        nav.search = 'category=web'
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        expect(screen.getByText('No exercises match these filters')).toBeInTheDocument()
        fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1) as HTMLElement)
        expect(nav.replace).toHaveBeenCalled()
    })

    it('shows a skeleton while loading', () => {
        list.current = { ...ok([]), data: undefined, isLoading: true }
        render(<SnippetsExplorer initialPage={null} initialStats={null} />)
        expect(screen.getByRole('status', { name: 'Loading exercises' })).toBeInTheDocument()
    })

    it('loads more when there is another page', () => {
        const fetchNextPage = vi.fn()
        list.current = ok([makeCard()], { hasNextPage: true, fetchNextPage, data: page([makeCard()], 30) })
        render(<SnippetsExplorer initialPage={initial} initialStats={null} />)
        expect(screen.getByTestId('cr-count')).toHaveTextContent('Showing 1 of 30 exercises')
        fireEvent.click(screen.getByRole('button', { name: /Load more/ }))
        expect(fetchNextPage).toHaveBeenCalled()
    })
})
