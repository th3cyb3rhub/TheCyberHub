import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CalendarItem } from '@/types/event'
import { CalendarMonth } from '../CalendarMonth'
import { CalendarWeek } from '../CalendarWeek'
import { CalendarAgenda } from '../CalendarAgenda'
import { googleCalendarUrl } from '../AddToCalendarMenu'

const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({
    id: 'e1', slug: 'night', title: 'Night', category: 'ctf', startDate: '2026-12-09T19:00:00.000Z', endDate: '2026-12-09T21:00:00.000Z',
    timezone: 'UTC', format: 'online', status: 'upcoming', isAllDay: false, ...over,
})
const onNavigate = vi.fn()
const cell = (day: string) => document.querySelector<HTMLElement>(`[data-day="${day}"]`)!

beforeEach(() => vi.clearAllMocks())

describe('CalendarMonth', () => {
    const items = [
        item({ id: 'a', title: 'Alpha' }),
        item({ id: 'b', title: 'Beta', startDate: '2026-12-09T18:00:00.000Z', endDate: '2026-12-09T18:30:00.000Z' }),
        item({ id: 'c', title: 'Gamma', startDate: '2026-12-09T17:00:00.000Z', endDate: '2026-12-09T17:30:00.000Z' }),
        item({ id: 'd', title: 'Delta', startDate: '2026-12-09T16:00:00.000Z', endDate: '2026-12-09T16:30:00.000Z' }),
        item({ id: 'x', title: 'Cancelled one', status: 'cancelled', startDate: '2026-12-10T10:00:00.000Z', endDate: '2026-12-10T11:00:00.000Z' }),
        item({ id: 'l', title: 'Live one', status: 'live', seriesId: 's1', startDate: '2026-12-11T10:00:00.000Z', endDate: '2026-12-11T11:00:00.000Z' }),
    ]
    const renderMonth = () => render(<CalendarMonth date="2026-12-09" today="2026-12-09" items={items} zone="UTC" onNavigate={onNavigate} />)

    it('is a 7 by 6 grid with column headers and a label with date and count on every cell', () => {
        renderMonth()
        expect(screen.getByRole('grid', { name: 'December 2026' })).toBeInTheDocument()
        expect(screen.getAllByRole('columnheader')).toHaveLength(7)
        expect(screen.getAllByRole('gridcell')).toHaveLength(42)
        expect(cell('2026-12-09')).toHaveAttribute('aria-label', 'Wednesday, December 9, 2026, 4 events, today')
        expect(cell('2026-12-12')).toHaveAttribute('aria-label', 'Saturday, December 12, 2026, no events')
        expect(cell('2026-11-30')).toBeInTheDocument()
        expect(cell('2027-01-10')).toBeInTheDocument()
    })

    it('shows three items and a +1 more, in time order', () => {
        renderMonth()
        const day = cell('2026-12-09')
        const shown = within(day).getAllByTestId('month-item').map((e) => e.textContent)
        expect(shown).toHaveLength(3)
        expect(shown[0]).toContain('Delta')
        expect(within(day).getByText('+1 more')).toBeInTheDocument()
    })

    it('does not rely on colour: cancelled, live and recurring items carry text and icons', () => {
        renderMonth()
        expect(within(cell('2026-12-10')).getByText('(cancelled)')).toBeInTheDocument()
        expect(within(cell('2026-12-11')).getByText('(live now)')).toBeInTheDocument()
        expect(within(cell('2026-12-11')).getByText('(recurring)')).toBeInTheDocument()
    })

    it('has one tab stop: the day in the address, moving with the arrow keys', () => {
        renderMonth()
        const tabbable = () => screen.getAllByRole('gridcell').filter((c) => c.tabIndex === 0).map((c) => c.getAttribute('data-day'))
        expect(tabbable()).toEqual(['2026-12-09'])
        cell('2026-12-09').focus()
        fireEvent.keyDown(cell('2026-12-09'), { key: 'ArrowRight' })
        expect(document.activeElement).toBe(cell('2026-12-10'))
        expect(tabbable()).toEqual(['2026-12-10'])
        fireEvent.keyDown(cell('2026-12-10'), { key: 'ArrowDown' })
        expect(document.activeElement).toBe(cell('2026-12-17'))
        fireEvent.keyDown(cell('2026-12-17'), { key: 'ArrowLeft' })
        fireEvent.keyDown(cell('2026-12-16'), { key: 'ArrowUp' })
        expect(document.activeElement).toBe(cell('2026-12-09'))
    })

    it('goes to the start and end of the week with Home and End (Monday to Sunday)', () => {
        renderMonth()
        cell('2026-12-09').focus()
        fireEvent.keyDown(cell('2026-12-09'), { key: 'Home' })
        expect(document.activeElement).toBe(cell('2026-12-07'))
        fireEvent.keyDown(cell('2026-12-07'), { key: 'End' })
        expect(document.activeElement).toBe(cell('2026-12-13'))
    })

    it('asks the page to change month when the arrow leaves the grid, and with Page Up and Page Down', () => {
        renderMonth()
        cell('2027-01-10').focus()
        fireEvent.keyDown(cell('2027-01-10'), { key: 'ArrowRight' })
        expect(onNavigate).toHaveBeenLastCalledWith('2027-01-11')
        fireEvent.keyDown(cell('2026-12-09'), { key: 'PageDown' })
        expect(onNavigate).toHaveBeenLastCalledWith('2027-01-09')
        fireEvent.keyDown(cell('2026-12-09'), { key: 'PageUp' })
        expect(onNavigate).toHaveBeenLastCalledWith('2026-11-09')
    })

    it('opens the day with Enter and Space, listing every event, and closes with Escape', () => {
        renderMonth()
        fireEvent.keyDown(cell('2026-12-09'), { key: 'Enter' })
        const dialog = screen.getByRole('dialog', { name: 'Wednesday, December 9, 2026' })
        expect(within(dialog).getAllByTestId('calendar-item')).toHaveLength(4)
        expect(within(dialog).getByRole('link', { name: /Alpha/ })).toHaveAttribute('href', '/events/night')
        fireEvent.keyDown(dialog, { key: 'Escape' })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        fireEvent.keyDown(cell('2026-12-12'), { key: ' ' })
        expect(screen.getByText('Nothing is scheduled on this day.')).toBeInTheDocument()
    })

    it('opens the day from "+N more" with the mouse', () => {
        renderMonth()
        fireEvent.click(within(cell('2026-12-09')).getByText('+1 more'))
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('puts an event on the viewer day, not the event day', () => {
        render(<CalendarMonth date="2026-12-09" today="2026-12-09" items={[item({ startDate: '2026-12-09T23:30:00.000Z', endDate: '2026-12-10T00:30:00.000Z', timezone: 'America/Los_Angeles' })]} zone="Asia/Tokyo" onNavigate={onNavigate} />)
        expect(within(cell('2026-12-10')).getAllByTestId('month-item')).toHaveLength(1)
        expect(within(cell('2026-12-09')).queryAllByTestId('month-item')).toHaveLength(0)
    })
})

describe('CalendarWeek', () => {
    it('shows seven days from Monday with their events as a list', () => {
        render(<CalendarWeek date="2026-12-09" today="2026-12-09" zone="UTC" items={[item(), item({ id: 'z', title: 'Later', startDate: '2026-12-13T10:00:00.000Z', endDate: '2026-12-13T11:00:00.000Z' })]} />)
        const days = within(screen.getByTestId('week-grid')).getAllByRole('heading', { level: 3 })
        expect(days.map((h) => h.firstChild?.textContent)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
        expect(document.querySelector('[data-day="2026-12-09"]')).toHaveAttribute('aria-label', 'Wednesday, December 9, 2026, 1 event, today')
        expect(within(document.querySelector<HTMLElement>('[data-day="2026-12-13"]')!).getByText('Later')).toBeInTheDocument()
        expect(screen.getAllByText('No events')).toHaveLength(5)
    })

    it('has no seven column layout below the large breakpoint', () => {
        render(<CalendarWeek date="2026-12-09" today="2026-12-09" zone="UTC" items={[]} />)
        const cls = screen.getByTestId('week-grid').className
        expect(cls).toContain('grid-cols-1')
        expect(cls).toContain('lg:grid-cols-7')
    })
})

describe('CalendarAgenda', () => {
    it('groups by day, with the time in the viewer zone and the event zone when it differs', () => {
        render(<CalendarAgenda date="2026-12-09" today="2026-12-09" zone="Asia/Kolkata" items={[
            item({ id: 'b', title: 'Berlin Night', timezone: 'Europe/Berlin', startDate: '2026-12-09T17:00:00.000Z', endDate: '2026-12-09T19:00:00.000Z' }),
            item({ id: 'o', title: 'Other month', startDate: '2027-01-02T10:00:00.000Z', endDate: '2027-01-02T11:00:00.000Z' }),
        ]} />)
        const list = screen.getByTestId('agenda-list')
        expect(within(list).getByText('Wed, December 9')).toBeInTheDocument()
        expect(within(list).getByText('10:30 PM – 12:30 AM')).toBeInTheDocument()
        // 22:30 to 00:30 in Kolkata runs past midnight, so the next day lists it again as a continuation
        expect(within(list).getAllByText('6:00 PM GMT+1 where it is hosted')).toHaveLength(2)
        expect(within(list).getByText('Continues')).toBeInTheDocument()
        expect(within(list).queryByText('Other month')).not.toBeInTheDocument()
    })

    it('says "All day" and "Cancelled" in words', () => {
        render(<CalendarAgenda date="2026-12-09" today="2026-12-01" zone="UTC" items={[item({ isAllDay: true, status: 'cancelled', startDate: '2026-12-09T00:00:00.000Z', endDate: '2026-12-10T00:00:00.000Z' })]} />)
        expect(screen.getByText('All day')).toBeInTheDocument()
        expect(screen.getByText('Cancelled')).toBeInTheDocument()
    })
})

describe('google calendar link', () => {
    it('fills in the title, the times in UTC and only a link to the page as details', () => {
        const url = new URL(googleCalendarUrl({ slug: 'winter-ctf', title: 'Winter CTF', startDate: '2026-12-05T17:00:00.000Z', endDate: '2026-12-05T19:00:00.000Z', location: 'Online' }))
        expect(url.origin).toBe('https://calendar.google.com')
        expect(url.searchParams.get('text')).toBe('Winter CTF')
        expect(url.searchParams.get('dates')).toBe('20261205T170000Z/20261205T190000Z')
        expect(url.searchParams.get('details')).toMatch(/\/events\/winter-ctf$/)
    })
})
