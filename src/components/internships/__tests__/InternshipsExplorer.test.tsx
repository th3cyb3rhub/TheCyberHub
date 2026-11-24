import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCard } from '@/lib/internships/__tests__/fixtures'

const replace = vi.hoisted(() => vi.fn())
const search = vi.hoisted(() => ({ current: '' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => '/internships', useSearchParams: () => new URLSearchParams(search.current) }))
const auth = vi.hoisted(() => ({ current: { user: null as { role: string } | null } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const list = vi.hoisted(() => ({ current: {} as Record<string, unknown>, calls: [] as unknown[] }))
const past = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/hooks/queries/useInternships', () => ({
    useInternships: (filters: unknown) => { list.calls.push(filters); return list.current },
    usePastInternships: () => past.current,
}))

import { filtersFromParams, InternshipsExplorer } from '../InternshipsExplorer'

const result = (cards: unknown[], extra = {}, total = cards.length) => ({ data: { pages: [{ data: cards, pagination: { page: 1, limit: 50, total, totalPages: 1, hasMore: false } }] }, isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(), ...extra })
const cards = () => [
    makeCard({ _id: '1'.repeat(24), title: 'Open one', status: 'open' }),
    makeCard({ _id: '2'.repeat(24), title: 'Closed one', status: 'closed', applicationsOpen: false }),
    makeCard({ _id: '3'.repeat(24), title: 'Mentoring', status: 'in-progress', applicationsOpen: false, type: 'mentorship', capacity: 0, spotsLeft: null }),
]

beforeEach(() => {
    vi.clearAllMocks()
    list.calls = []
    search.current = ''
    auth.current = { user: null }
    list.current = result(cards())
    past.current = { data: { pages: [{ data: [] }] }, isLoading: false, isError: false, hasNextPage: false }
})

describe('filtersFromParams', () => {
    it('reads the type and status and ignores anything else', () => {
        expect(filtersFromParams(new URLSearchParams('type=mentorship&status=closed'))).toEqual({ type: 'mentorship', status: 'closed' })
        expect(filtersFromParams(new URLSearchParams('type=x&status=draft'))).toEqual({ type: '', status: '' })
        expect(filtersFromParams(new URLSearchParams('status=completed'))).toEqual({ type: '', status: '' })
    })
})

describe('InternshipsExplorer count', () => {
    it('says how many of the programs are shown when there are more', () => {
        list.current = result(cards(), {}, 7)
        render(<InternshipsExplorer />)
        expect(screen.getByText('Showing 3 of 7 programs')).toBeInTheDocument()
    })

    it('says only the number when everything is shown', () => {
        render(<InternshipsExplorer />)
        expect(screen.getByText('3 programs')).toBeInTheDocument()
    })

    it('does not trust the API total behind a visitor\'s status filter, which is applied here', () => {
        search.current = 'status=closed'
        list.current = result(cards(), {}, 7)
        render(<InternshipsExplorer />)
        expect(screen.getByText('1 program')).toBeInTheDocument()
    })

    it('uses the API total for staff, whose filter is applied by the API', () => {
        auth.current = { user: { role: 'moderator' } }
        search.current = 'status=closed'
        list.current = result([cards()[1]], {}, 4)
        render(<InternshipsExplorer />)
        expect(screen.getByText('Showing 1 of 4 programs')).toBeInTheDocument()
    })
})

describe('InternshipsExplorer', () => {
    it('shows each program with its seats and the deadline of an open one', () => {
        render(<InternshipsExplorer />)
        const cardEls = screen.getAllByTestId('cohort-card')
        expect(cardEls).toHaveLength(3)
        expect(cardEls[0]).toHaveTextContent('4 of 10 spots left')
        expect(cardEls[0]).toHaveTextContent('Apply by')
        expect(cardEls[1]).not.toHaveTextContent('Apply by')
        expect(cardEls[2]).toHaveTextContent('No seat limit') // in progress: not "open" seats
        expect(cardEls[2]).not.toHaveTextContent('Open seats')
    })

    it('has a Closed chip, writes the filter in the address and links to my applications when signed in', () => {
        auth.current = { user: { role: 'user' } }
        render(<InternshipsExplorer />)
        fireEvent.click(screen.getByRole('button', { name: 'Closed' }))
        expect(replace).toHaveBeenCalledWith('/internships?status=closed', { scroll: false })
        expect(screen.getByRole('link', { name: /My applications/ })).toHaveAttribute('href', '/internships/applications')
        expect(screen.queryByRole('link', { name: /Manage programs/ })).toBeNull()
    })

    it('filters the cards by status in the browser, because the API ignores status for the public', () => {
        search.current = 'status=closed'
        render(<InternshipsExplorer />)
        const cardEls = screen.getAllByTestId('cohort-card')
        expect(cardEls).toHaveLength(1)
        expect(cardEls[0]).toHaveTextContent('Closed one')
        expect(screen.getByRole('button', { name: 'Closed' })).toHaveAttribute('aria-pressed', 'true')
        expect(list.calls.at(-1)).toMatchObject({ type: '', status: '' })
    })

    it('sends the status to the API for staff, who can use it', () => {
        auth.current = { user: { role: 'moderator' } }
        search.current = 'status=open&type=internship'
        render(<InternshipsExplorer />)
        expect(list.calls.at(-1)).toMatchObject({ type: 'internship', status: 'open' })
        expect(screen.getByRole('link', { name: /Manage programs/ })).toBeInTheDocument()
    })

    it('loads more on request', () => {
        const fetchNextPage = vi.fn()
        list.current = result(cards(), { hasNextPage: true, fetchNextPage })
        render(<InternshipsExplorer />)
        fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
        expect(fetchNextPage).toHaveBeenCalled()
    })

    it('keeps looking on the next page while the filter has nothing to show yet', () => {
        const fetchNextPage = vi.fn()
        search.current = 'status=closed'
        list.current = result([makeCard()], { hasNextPage: true, fetchNextPage })
        render(<InternshipsExplorer />)
        expect(fetchNextPage).toHaveBeenCalled()
        expect(screen.getByRole('status')).toHaveTextContent('Looking for matching programs')
    })

    it('has an empty state that clears the filters, and an error state that retries', () => {
        search.current = 'type=mentorship'
        list.current = result([])
        const { unmount } = render(<InternshipsExplorer />)
        expect(screen.getByText('No programs match these filters')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
        expect(replace).toHaveBeenCalledWith('/internships', { scroll: false })
        unmount()
        const refetch = vi.fn()
        list.current = { data: undefined, isLoading: false, isError: true, error: new Error('x'), refetch }
        render(<InternshipsExplorer />)
        fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
        expect(refetch).toHaveBeenCalled()
    })

    it('lists past programs with safe showcase links', () => {
        past.current = { data: { pages: [{ data: [{ _id: 'p1', title: 'Spring 2026', description: 'd', type: 'internship', startDate: '2026-03-01T00:00:00Z', endDate: '2026-05-01T00:00:00Z', technologies: ['Go'], capacity: 5, showcaseProjects: [{ title: 'Fuzzer', description: '', teamMembers: [], demoLink: 'data:text/html,x', repoLink: 'https://github.com/a/b' }] }] }] }, isLoading: false, isError: false, hasNextPage: false }
        render(<InternshipsExplorer />)
        const section = screen.getByTestId('past-section')
        expect(within(section).getByText('Spring 2026')).toBeInTheDocument()
        expect(within(section).getByRole('link', { name: /Code/ })).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
        expect(within(section).queryByRole('link', { name: /Demo/ })).toBeNull()
    })
})
