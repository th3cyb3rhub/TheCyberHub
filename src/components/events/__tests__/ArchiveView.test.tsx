import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ArchiveItem } from '@/types/event'

const replace = vi.fn()
let search = ''
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace, push: vi.fn() }),
    usePathname: () => '/events/archive',
    useSearchParams: () => new URLSearchParams(search),
}))
const state = vi.hoisted(() => ({ result: {} as Record<string, unknown>, calls: [] as unknown[][] }))
vi.mock('@/hooks/queries/useEventCalendar', () => ({
    useEventArchives: (...args: unknown[]) => { state.calls.push(args); return state.result },
}))

import { ArchiveView } from '../ArchiveView'

const item = (over: Partial<ArchiveItem> = {}): ArchiveItem => ({
    id: 'a1', slug: 'autumn-ctf', title: 'Autumn CTF', shortDescription: 'Web and crypto.', image: null, category: 'ctf',
    startDate: '2026-10-10T17:00:00.000Z', endDate: '2026-10-10T19:00:00.000Z', timezone: 'Europe/Berlin', format: 'online', status: 'ended',
    seriesId: null, hasRecording: true, hasSlides: true, attendedCount: 42, averageRating: 4.5, ratingCount: 8, ...over,
})
const loaded = (items: ArchiveItem[], over: Record<string, unknown> = {}) => ({
    isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, isPlaceholderData: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    data: { pages: [{ data: items, pagination: { page: 1, limit: 12, hasMore: false } }] }, ...over,
})

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    search = ''
    state.calls = []
    state.result = loaded([item()])
})
afterEach(() => vi.useRealTimers())

describe('ArchiveView', () => {
    it('shows recording and slides badges, the rating with its count, and how many attended', () => {
        render(<ArchiveView />)
        const card = screen.getByTestId('archive-card')
        expect(within(card).getByRole('link', { name: 'Autumn CTF' })).toHaveAttribute('href', '/events/autumn-ctf')
        expect(within(card).getByText('Recording')).toBeInTheDocument()
        expect(within(card).getByText('Slides')).toBeInTheDocument()
        expect(card).toHaveTextContent('4.5')
        expect(card).toHaveTextContent('(8 ratings)')
        expect(card).toHaveTextContent('42 attended')
        expect(within(card).queryByText('Series')).not.toBeInTheDocument()
    })

    it('shows the series chip for an occurrence of a series and leaves out empty counts', () => {
        state.result = loaded([item({ seriesId: 's1', hasRecording: false, hasSlides: false, ratingCount: 0, averageRating: null, attendedCount: 0 })])
        render(<ArchiveView />)
        const card = screen.getByTestId('archive-card')
        expect(within(card).getByRole('link', { name: /Series/ })).toHaveAttribute('href', '/events/series/s1')
        expect(within(card).queryByText('Recording')).not.toBeInTheDocument()
        expect(card).not.toHaveTextContent('attended')
    })

    it('reads the filters from the address and passes them to the query', () => {
        search = 'category=workshop&from=2026-01-01&to=2026-06-30&q=web'
        render(<ArchiveView />)
        expect(state.calls.at(-1)![0]).toEqual({ category: 'workshop', from: '2026-01-01', to: '2026-06-30', q: 'web' })
        expect((screen.getByLabelText('Search past events') as HTMLInputElement).value).toBe('web')
    })

    it('drops broken values from the address', () => {
        search = 'category=party&from=2026-02-31&q=' + 'x'.repeat(300)
        render(<ArchiveView />)
        const filters = state.calls.at(-1)![0] as Record<string, string>
        expect(filters.category).toBeUndefined()
        expect(filters.from).toBeUndefined()
        expect(filters.q).toHaveLength(100)
    })

    it('writes the search to the address 300 ms after the last keystroke, not on every one', () => {
        render(<ArchiveView />)
        const box = screen.getByLabelText('Search past events')
        fireEvent.change(box, { target: { value: 'w' } })
        act(() => { vi.advanceTimersByTime(200) })
        fireEvent.change(box, { target: { value: 'web' } })
        act(() => { vi.advanceTimersByTime(299) })
        expect(replace).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(1) })
        expect(replace).toHaveBeenCalledTimes(1)
        expect(replace).toHaveBeenCalledWith('/events/archive?q=web', { scroll: false })
    })

    it('debounces the dates too, and the category at once', () => {
        search = 'q=web'
        render(<ArchiveView />)
        fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } })
        expect(replace).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(300) })
        expect(replace).toHaveBeenLastCalledWith('/events/archive?from=2026-03-01&q=web', { scroll: false })
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'ctf' } })
        expect(replace).toHaveBeenLastCalledWith('/events/archive?category=ctf&q=web', { scroll: false })
    })

    it('loads more with the page the API said exists', () => {
        const fetchNextPage = vi.fn()
        state.result = loaded([item()], { hasNextPage: true, fetchNextPage })
        render(<ArchiveView />)
        fireEvent.click(screen.getByRole('button', { name: /Load more/ }))
        expect(fetchNextPage).toHaveBeenCalled()
    })

    it('does not ask when the end date is before the start date, and says why', () => {
        search = 'from=2026-06-01&to=2026-01-01'
        render(<ArchiveView />)
        expect(screen.getByRole('alert')).toHaveTextContent('The end date is before the start date.')
        expect(state.calls.at(-1)![1]).toEqual({ enabled: false })
    })

    it('shows loading, error and empty states, and clears the filters', () => {
        state.result = { isLoading: true, isError: false, data: undefined }
        const { rerender } = render(<ArchiveView />)
        expect(screen.getByRole('status', { name: 'Loading past events' })).toBeInTheDocument()
        const refetch = vi.fn()
        state.result = { isLoading: false, isError: true, error: new Error('x'), refetch, data: undefined }
        rerender(<ArchiveView />)
        fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: /Try again/ }))
        expect(refetch).toHaveBeenCalled()
        search = 'category=ctf'
        state.result = loaded([])
        rerender(<ArchiveView />)
        expect(screen.getByText('No past events match these filters')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
        expect(replace).toHaveBeenLastCalledWith('/events/archive', { scroll: false })
    })
})
