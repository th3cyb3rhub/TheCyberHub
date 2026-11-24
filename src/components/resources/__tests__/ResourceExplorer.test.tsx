import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeResource } from '@/lib/learning/__tests__/fixtures'

const replace = vi.fn()
const search = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => '/resources', useSearchParams: () => new URLSearchParams(search.value),
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

const list = vi.hoisted(() => ({ current: {} as Record<string, unknown>, filters: undefined as unknown }))
vi.mock('@/hooks/queries/useResources', () => ({
    useResourceList: (f: unknown) => { list.filters = f; return list.current },
    useResourceFacets: () => ({ data: { types: [{ value: 'video', count: 4 }], topics: [], difficulties: [], free: { free: 7, paid: 2 } } }),
    useVoteResource: () => ({ mutate: vi.fn(), isPending: false }),
    useBookmarkResource: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { apiFilters, filtersFromParams, ResourceExplorer } from '../ResourceExplorer'

const page = (data: unknown[], extra = {}) => ({
    isLoading: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    data: { pages: [{ data, pagination: { page: 1, limit: 12, total: data.length, totalPages: 1, hasMore: false } }] }, ...extra,
})

beforeEach(() => {
    vi.clearAllMocks()
    search.value = ''
    list.current = page([makeResource(), makeResource({ id: 'r2', slug: 'second', title: 'Second' })])
})
afterEach(() => { vi.useRealTimers() })

describe('filters in the address', () => {
    it('reads and validates the query string', () => {
        const f = filtersFromParams(new URLSearchParams('q=sql&type=video&topic=nope&difficulty=advanced&free=free&tag=XSS&sort=new'))
        expect(f).toMatchObject({ q: 'sql', type: 'video', topic: '', difficulty: 'advanced', free: 'free', tag: 'xss', sort: 'new' })
        expect(filtersFromParams(new URLSearchParams('')).sort).toBe('top')
        expect(filtersFromParams(new URLSearchParams('q=sql')).sort).toBe('relevance')
        expect(filtersFromParams(new URLSearchParams('sort=evil')).sort).toBe('top')
    })
    it('translates them into API parameters', () => {
        expect(apiFilters(filtersFromParams(new URLSearchParams('free=paid&type=book')))).toMatchObject({ isFree: false, type: 'book', sort: 'top' })
        expect(apiFilters(filtersFromParams(new URLSearchParams('q=a')))).toMatchObject({ q: undefined, sort: 'top' })
        expect(apiFilters(filtersFromParams(new URLSearchParams('q=xss&sort=relevance')))).toMatchObject({ q: 'xss', sort: 'relevance' })
    })
    it('asks the API for what the address says', () => {
        search.value = 'type=video&difficulty=beginner&free=free'
        render(<ResourceExplorer />)
        expect(list.filters).toMatchObject({ type: 'video', difficulty: 'beginner', isFree: true })
    })
    it('writes a changed filter to the address and keeps the others', () => {
        search.value = 'type=video'
        render(<ResourceExplorer />)
        fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'web-security' } })
        expect(replace).toHaveBeenCalledWith('/resources?type=video&topic=web-security', { scroll: false })
    })
    it('waits for a pause in typing before searching', () => {
        vi.useFakeTimers()
        render(<ResourceExplorer />)
        fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'sqli' } })
        expect(replace).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(350) })
        expect(replace).toHaveBeenCalledWith('/resources?q=sqli', { scroll: false })
    })
    it('clears every filter', () => {
        search.value = 'type=video&q=abc&tag=xss'
        render(<ResourceExplorer />)
        fireEvent.click(screen.getAllByRole('button', { name: /Clear filters/ })[0])
        expect(replace).toHaveBeenCalledWith('/resources', { scroll: false })
    })
    it('shows facet counts in the menus', () => {
        render(<ResourceExplorer />)
        expect(screen.getByRole('option', { name: /Video \(4\)/ })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Free (7)' })).toBeInTheDocument()
    })
})

describe('states', () => {
    it('lists the resources with a count', () => {
        render(<ResourceExplorer />)
        expect(screen.getByText('2 resources')).toBeInTheDocument()
        expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(2)
    })
    it('shows a skeleton while loading', () => {
        list.current = { ...page([]), isLoading: true, data: undefined }
        render(<ResourceExplorer />)
        expect(screen.getByRole('status', { name: 'Loading resources' })).toBeInTheDocument()
    })
    it('shows the API error with a retry', () => {
        const refetch = vi.fn()
        list.current = { ...page([]), isError: true, error: new ApiError('down', 500), data: undefined, refetch }
        render(<ResourceExplorer />)
        fireEvent.click(screen.getByRole('button', { name: /try again/i }))
        expect(refetch).toHaveBeenCalled()
    })
    it('explains an empty library and an empty search differently', () => {
        list.current = page([])
        const { unmount } = render(<ResourceExplorer />)
        expect(screen.getByText('The library is empty')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Be the first to add one' })).toHaveAttribute('href', '/resources/submit')
        unmount()
        search.value = 'q=zzzz'
        render(<ResourceExplorer />)
        expect(screen.getByText('No resources match these filters')).toBeInTheDocument()
    })
    it('offers more results', () => {
        const fetchNextPage = vi.fn()
        list.current = page([makeResource()], { hasNextPage: true, fetchNextPage })
        render(<ResourceExplorer />)
        fireEvent.click(screen.getByRole('button', { name: /load more/i }))
        expect(fetchNextPage).toHaveBeenCalled()
    })
})
