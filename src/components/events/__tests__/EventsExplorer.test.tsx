import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeEvent, viewer } from '@/lib/events/__tests__/fixtures'

const replace = vi.fn()
let search = ''
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace }),
    usePathname: () => '/events',
    useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }))

const state = vi.hoisted(() => ({ list: {} as Record<string, unknown>, filters: undefined as unknown, featured: { data: undefined } as Record<string, unknown> }))
vi.mock('@/hooks/queries/useEvents', () => ({
    useEventList: (filters: unknown) => { state.filters = filters; return state.list },
    useEventPage: () => state.featured,
}))

import { EventsExplorer, filtersFromParams } from '../EventsExplorer'

const page = (data: unknown[], more = false) => ({ isLoading: false, isError: false, data: { pages: [{ data, pagination: { page: 1, limit: 12, total: data.length, hasMore: more } }] }, hasNextPage: more, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() })

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    search = ''
    state.list = page([makeEvent(), makeEvent({ _id: 'b', slug: 'full-one', title: 'Full One', isFull: true, spotsLeft: 0, waitlistCount: 3 })])
    state.featured = { data: undefined }
})
afterEach(() => vi.useRealTimers())

describe('filtersFromParams', () => {
    it('reads the URL, ignoring unknown values', () => {
        expect(filtersFromParams(new URLSearchParams('tab=past&category=ctf&format=hybrid&type=official&q=web'))).toEqual({ tab: 'past', category: 'ctf', format: 'hybrid', eventType: 'official', q: 'web' })
        expect(filtersFromParams(new URLSearchParams('tab=x&category=nope&format=nope&type=nope'))).toEqual({ tab: 'upcoming', category: '', format: '', eventType: '', q: '' })
    })
})

describe('EventsExplorer', () => {
    it('lists upcoming events with spots left, full and waitlist', () => {
        render(<EventsExplorer />)
        expect(state.filters).toMatchObject({ scope: 'upcoming' })
        expect(screen.getAllByTestId('event-card')).toHaveLength(2)
        expect(screen.getByText('18 spots left')).toBeInTheDocument()
        expect(screen.getByText('Full · waitlist open (3 waiting)')).toBeInTheDocument()
    })

    it('reads filters from the URL and sends them to the API', () => {
        search = 'tab=past&category=workshop&format=online&q=nmap'
        render(<EventsExplorer />)
        expect(state.filters).toMatchObject({ scope: 'past', category: 'workshop', format: 'online', q: 'nmap' })
        expect(screen.getByRole('tab', { name: 'Past' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByLabelText('Search events')).toHaveValue('nmap')
    })

    it('writes the filters back to the URL', () => {
        render(<EventsExplorer />)
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'ctf' } })
        expect(replace).toHaveBeenLastCalledWith('/events?category=ctf', { scroll: false })
        fireEvent.click(screen.getByRole('tab', { name: 'Past' }))
        expect(replace).toHaveBeenLastCalledWith('/events?tab=past', { scroll: false })
    })

    it('waits until typing pauses before it writes ?q=', () => {
        render(<EventsExplorer />)
        const box = screen.getByLabelText('Search events')
        fireEvent.change(box, { target: { value: 'n' } })
        fireEvent.change(box, { target: { value: 'nm' } })
        fireEvent.change(box, { target: { value: 'nmap' } })
        expect(replace).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(300) })
        expect(replace).toHaveBeenCalledTimes(1)
        expect(replace).toHaveBeenCalledWith('/events?q=nmap', { scroll: false })
    })

    it('shows real data only: an empty list is an empty state, not sample events', () => {
        state.list = page([])
        render(<EventsExplorer />)
        expect(screen.getByText('No upcoming events')).toBeInTheDocument()
        expect(screen.getAllByRole('link', { name: 'Host an event' }).every((a) => a.getAttribute('href') === '/events/submit')).toBe(true)
    })

    it('offers to clear filters that match nothing', () => {
        search = 'category=ctf'
        state.list = page([])
        render(<EventsExplorer />)
        expect(screen.getByText('No events match these filters')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
        expect(replace).toHaveBeenLastCalledWith('/events', { scroll: false })
    })

    it('shows an API error with a retry', () => {
        const refetch = vi.fn()
        state.list = { isLoading: false, isError: true, error: new Error('Network down'), data: undefined, refetch }
        render(<EventsExplorer />)
        expect(screen.getByRole('alert')).toHaveTextContent('Network down')
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()
    })

    it('shows skeletons while loading', () => {
        state.list = { isLoading: true, isError: false, data: undefined }
        render(<EventsExplorer />)
        expect(screen.getByRole('status', { name: 'Loading events' })).toBeInTheDocument()
    })

    it('loads more', () => {
        const list = page([makeEvent()], true)
        state.list = list
        render(<EventsExplorer />)
        fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
        expect(list.fetchNextPage).toHaveBeenCalled()
    })

    it('shows a featured strip only when there are featured events, and does not repeat them', () => {
        const star = makeEvent({ _id: 'f', slug: 'star', title: 'Star Event', isFeatured: true })
        state.featured = { data: { data: [star] } }
        state.list = page([star, makeEvent()])
        render(<EventsExplorer />)
        expect(screen.getByRole('heading', { name: /Featured/ })).toBeInTheDocument()
        expect(screen.getAllByText('Star Event')).toHaveLength(1)
    })

    it('marks events the member is registered for', () => {
        state.list = page([makeEvent({ viewer: viewer({ registered: true, canRegister: false }) })])
        render(<EventsExplorer />)
        expect(screen.getByText('You are registered')).toBeInTheDocument()
    })
})
