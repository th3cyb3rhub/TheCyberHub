import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeEvent } from '@/lib/events/__tests__/fixtures'

const replace = vi.fn()
let search = 'month=2026-12'
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace }),
    usePathname: () => '/events/calendar',
    useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('@/lib/events/clock', () => ({ useViewerZone: () => 'UTC' }))

const state = vi.hoisted(() => ({ list: {} as Record<string, unknown>, filters: undefined as Record<string, unknown> | undefined }))
vi.mock('@/hooks/queries/useEvents', () => ({
    useEventList: (filters: Record<string, unknown>) => { state.filters = filters; return state.list },
}))

import { EventsCalendar, groupByDay, LOOKBACK_DAYS } from '../EventsCalendar'

const page = (data: unknown[], over: Record<string, unknown> = {}) => ({
    isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    data: { pages: [{ data, pagination: { page: 1, limit: 50, total: data.length, hasMore: false } }] },
    ...over,
})

beforeEach(() => {
    vi.clearAllMocks()
    search = 'month=2026-12'
})

describe('groupByDay', () => {
    const multi = makeEvent({ _id: 'm', slug: 'hack', title: 'Hackathon', startDate: '2026-11-29T10:00:00Z', endDate: '2026-12-02T10:00:00Z', endsAt: '2026-12-02T10:00:00Z' })

    it('lists a multi-day event on every day it covers inside the month', () => {
        const days = groupByDay([multi], 'UTC', '2026-12-01', '2026-12-31')
        expect(days.map((d) => d.day)).toEqual(['2026-12-01', '2026-12-02'])
        expect(days.every((d) => d.items[0].continued)).toBe(true)
    })

    it('does not put an event that ends at midnight on the next day', () => {
        const e = makeEvent({ startDate: '2026-12-05T22:00:00Z', endDate: '2026-12-06T00:00:00Z', endsAt: '2026-12-06T00:00:00Z' })
        expect(groupByDay([e], 'UTC').map((d) => d.day)).toEqual(['2026-12-05'])
    })
})

describe('EventsCalendar', () => {
    it('asks for the month from a lookback before it, and shows a long event that began earlier', () => {
        state.list = page([
            makeEvent({ _id: 'm', slug: 'hack', title: 'Hackathon', startDate: '2026-11-29T10:00:00Z', endDate: '2026-12-02T10:00:00Z', endsAt: '2026-12-02T10:00:00Z' }),
            makeEvent(),
        ])
        render(<EventsCalendar />)
        const first = new Date('2026-12-01T00:00:00.000Z').getTime() - LOOKBACK_DAYS * 86400000
        expect(state.filters).toMatchObject({ scope: 'all', from: new Date(first).toISOString(), to: '2026-12-31T23:59:59.999Z' })
        expect(within(screen.getByRole('list', { name: /Events in December 2026/ })).getAllByText('Hackathon')).toHaveLength(2)
        expect(screen.getAllByText('Continues')).toHaveLength(2)
        expect(screen.getByText('Winter CTF Night')).toBeInTheDocument()
    })

    it('follows the next page of the month', () => {
        const fetchNextPage = vi.fn()
        state.list = page([makeEvent()], { hasNextPage: true, fetchNextPage })
        render(<EventsCalendar />)
        fireEvent.click(screen.getByRole('button', { name: /Load more/ }))
        expect(fetchNextPage).toHaveBeenCalled()
    })

    it('shows the empty and error states', () => {
        state.list = page([])
        const { rerender } = render(<EventsCalendar />)
        expect(screen.getByText('Nothing scheduled in December')).toBeInTheDocument()
        state.list = { isLoading: false, isError: true, error: new Error('x'), refetch: vi.fn(), data: undefined }
        rerender(<EventsCalendar />)
        expect(within(screen.getByRole('alert')).getByText(/Could not load the calendar/)).toBeInTheDocument()
    })

    it('moves between months through the URL', () => {
        state.list = page([])
        render(<EventsCalendar />)
        fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
        expect(replace).toHaveBeenCalledWith(expect.stringContaining('month=2027-01'), { scroll: false })
    })
})
