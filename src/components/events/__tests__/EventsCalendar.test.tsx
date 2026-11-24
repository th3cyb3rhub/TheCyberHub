import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CalendarItem } from '@/types/event'

const push = vi.fn()
let search = ''
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: vi.fn() }),
    usePathname: () => '/events/calendar',
    useSearchParams: () => new URLSearchParams(search),
}))
const env = vi.hoisted(() => ({ zone: 'UTC' as string | null, phone: false as boolean | null }))
vi.mock('@/lib/events/clock', () => ({ useViewerZone: () => env.zone, useIsPhone: () => env.phone, useNow: () => null }))
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: auth.user, loading: false }) }))
const state = vi.hoisted(() => ({ result: {} as Record<string, unknown>, calls: [] as unknown[][] }))
vi.mock('@/hooks/queries/useEventCalendar', () => ({
    useEventsCalendar: (...args: unknown[]) => { state.calls.push(args); return state.result },
}))
vi.mock('../CalendarFeedPanel', () => ({ CalendarFeedPanel: () => <div data-testid="feed-panel" /> }))

import { EventsCalendar } from '../EventsCalendar'

const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({
    id: 'e1', slug: 'night', title: 'Winter CTF Night', category: 'ctf', startDate: '2026-12-09T19:00:00.000Z', endDate: '2026-12-09T21:00:00.000Z',
    timezone: 'Europe/Berlin', format: 'online', status: 'upcoming', isAllDay: false, ...over,
})
const loaded = (items: CalendarItem[], truncated = false) => ({
    isLoading: false, isError: false, refetch: vi.fn(),
    data: { items, meta: { from: '', to: '', count: items.length, truncated } },
})

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-09T12:00:00Z'))
    search = ''
    env.zone = 'UTC'
    env.phone = false
    auth.user = null
    state.calls = []
    state.result = loaded([item()])
})
afterEach(() => vi.useRealTimers())

describe('EventsCalendar', () => {
    it('waits for the zone and the screen size before it asks for anything', () => {
        env.zone = null
        render(<EventsCalendar />)
        expect(screen.getByRole('status', { name: 'Loading the calendar' })).toBeInTheDocument()
        expect(state.calls.at(-1)?.[0]).toBeNull()
        env.zone = 'UTC'
        env.phone = null
        render(<EventsCalendar />)
        expect(state.calls.at(-1)?.[0]).toBeNull()
    })

    it('asks for the whole month grid in one range of at most 62 days, in the viewer zone', () => {
        render(<EventsCalendar />)
        const [range, category] = state.calls.at(-1)! as [{ from: string; to: string }, string]
        expect(range).toEqual({ from: '2026-11-30T00:00:00.000Z', to: '2027-01-10T23:59:59.999Z' })
        expect((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000).toBeLessThan(62)
        expect(category).toBe('')
        expect(screen.getByRole('grid', { name: 'December 2026' })).toBeInTheDocument()
        expect(screen.getByTestId('zone-label')).toHaveTextContent('Times are in your time zone, UTC')
    })

    it('reads view, date and category from the address and passes them on', () => {
        search = 'view=week&date=2026-12-24&category=workshop'
        render(<EventsCalendar />)
        const [range, category] = state.calls.at(-1)! as [{ from: string; to: string }, string]
        expect(range.from).toBe('2026-12-21T00:00:00.000Z')
        expect(category).toBe('workshop')
        expect(screen.getByTestId('calendar-title')).toHaveTextContent('Dec 21 to 27, 2026')
        expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.queryByRole('grid')).not.toBeInTheDocument()
        expect(screen.getByTestId('week-grid')).toBeInTheDocument()
    })

    it('pushes the new address for next, previous, today, view and category (so back works)', () => {
        search = 'date=2026-12-24'
        render(<EventsCalendar />)
        fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
        expect(push).toHaveBeenLastCalledWith('/events/calendar?date=2027-01-24', { scroll: false })
        fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
        expect(push).toHaveBeenLastCalledWith('/events/calendar?date=2026-11-24', { scroll: false })
        fireEvent.click(screen.getByRole('button', { name: 'Today' }))
        expect(push).toHaveBeenLastCalledWith('/events/calendar', { scroll: false })
        fireEvent.click(screen.getByRole('tab', { name: 'Agenda' }))
        expect(push).toHaveBeenLastCalledWith('/events/calendar?view=agenda&date=2026-12-24', { scroll: false })
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'ctf' } })
        expect(push).toHaveBeenLastCalledWith('/events/calendar?date=2026-12-24&category=ctf', { scroll: false })
    })

    it('moves by a week in the week view', () => {
        search = 'view=week'
        render(<EventsCalendar />)
        fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
        expect(push).toHaveBeenLastCalledWith('/events/calendar?view=week&date=2026-12-16', { scroll: false })
    })

    it('gives a phone the agenda and offers no month view', () => {
        env.phone = true
        search = 'view=month'
        render(<EventsCalendar />)
        expect(screen.queryByRole('grid')).not.toBeInTheDocument()
        expect(screen.getByTestId('agenda-list')).toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Month' })).not.toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Week' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Agenda' })).toHaveAttribute('aria-selected', 'true')
    })

    it('shows a loading skeleton, an error with retry and an empty state', () => {
        state.result = { isLoading: true, isError: false, data: undefined }
        const { rerender } = render(<EventsCalendar />)
        expect(screen.getByRole('status', { name: 'Loading the calendar' })).toBeInTheDocument()
        const refetch = vi.fn()
        state.result = { isLoading: false, isError: true, error: new Error('x'), refetch, data: undefined }
        rerender(<EventsCalendar />)
        fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: /Try again/ }))
        expect(refetch).toHaveBeenCalled()
        state.result = loaded([])
        rerender(<EventsCalendar />)
        expect(screen.getByTestId('empty-range')).toHaveTextContent(/No events from/)
        search = 'view=agenda'
        rerender(<EventsCalendar />)
        expect(screen.getByText('Nothing scheduled in December 2026')).toBeInTheDocument()
    })

    it('says when the range holds more than can be shown', () => {
        state.result = loaded([item()], true)
        render(<EventsCalendar />)
        expect(screen.getByTestId('truncated-note')).toHaveTextContent(/more events than can be shown/)
    })

    it('links the API calendar file for exactly the range on screen, and a subscribe address', () => {
        search = 'category=ctf'
        render(<EventsCalendar />)
        const href = screen.getByTestId('download-ics').getAttribute('href')!
        const url = new URL(href)
        expect(url.pathname).toBe('/api/events/calendar.ics')
        expect(Object.fromEntries(url.searchParams)).toEqual({ from: '2026-11-30T00:00:00.000Z', to: '2027-01-10T23:59:59.999Z', category: 'ctf' })
        fireEvent.click(screen.getByRole('button', { name: /Subscribe/ }))
        const dialog = screen.getByRole('dialog', { name: 'Subscribe in your calendar app' })
        expect((within(dialog).getByLabelText('Calendar address') as HTMLInputElement).value).toMatch(/^webcal:\/\/.+\/api\/events\/calendar\.ics\?from=/)
        expect(within(dialog).getByRole('button', { name: /Copy/ })).toBeInTheDocument()
    })

    it('shows the personal feed panel only to a signed in member', () => {
        const { rerender } = render(<EventsCalendar />)
        expect(screen.queryByTestId('feed-panel')).not.toBeInTheDocument()
        auth.user = { id: 'u1' }
        rerender(<EventsCalendar />)
        expect(screen.getByTestId('feed-panel')).toBeInTheDocument()
    })
})
