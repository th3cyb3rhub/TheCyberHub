import { describe, it, expect } from 'vitest'
import {
    addDays, addMonths, bucketByDay, calendarSearch, dayLong, daysBetween, gridWeekdays, itemDays, lastOfMonth, MAX_RANGE_DAYS, monthGrid,
    parseCalendarParams, parseDay, rangeLengthDays, shiftDay, startOfWeek, visibleRange, weekOf, weekTitle,
} from '../calendar'
import type { CalendarItem } from '@/types/event'

const item = (over: Partial<CalendarItem> = {}): CalendarItem => ({
    id: 'e1', slug: 'night', title: 'Night', category: 'ctf', startDate: '2026-12-05T17:00:00.000Z', endDate: '2026-12-05T19:00:00.000Z',
    timezone: 'Europe/Berlin', format: 'online', status: 'upcoming', isAllDay: false, ...over,
})

describe('days', () => {
    it('accepts only real calendar days', () => {
        expect(parseDay('2026-12-05')).toBe('2026-12-05')
        expect(parseDay('2026-02-31')).toBeNull()
        expect(parseDay('2026-13-01')).toBeNull()
        expect(parseDay('12/05/2026')).toBeNull()
        expect(parseDay(null)).toBeNull()
    })

    it('moves by days and months without drifting', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
        expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
        expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
        expect(addMonths('2026-01-15', -2)).toBe('2025-11-15')
        expect(lastOfMonth('2028-02-10')).toBe('2028-02-29')
    })
})

describe('month grid', () => {
    it('is always six rows of seven, starting on Monday', () => {
        const grid = monthGrid('2026-12-15')
        expect(grid.rows).toHaveLength(6)
        expect(grid.rows.every((r) => r.length === 7)).toBe(true)
        // 1 December 2026 is a Tuesday: the grid starts on Monday 30 November
        expect(grid.first).toBe('2026-11-30')
        expect(grid.last).toBe('2027-01-10')
        expect(gridWeekdays()[0]).toBe('Monday')
    })

    it('holds the whole month, whichever weekday it starts on', () => {
        for (const day of ['2026-02-01', '2026-03-01', '2026-11-01', '2027-08-01', '2026-02-28']) {
            const grid = monthGrid(day)
            const flat = grid.rows.flat()
            expect(flat).toContain(`${day.slice(0, 7)}-01`)
            expect(flat).toContain(lastOfMonth(day))
            expect(new Set(flat).size).toBe(42)
        }
    })

    it('handles a month that starts on the first day of the week', () => {
        // 1 June 2026 is a Monday
        expect(monthGrid('2026-06-10').first).toBe('2026-06-01')
    })
})

describe('weeks', () => {
    it('starts the week on Monday and has seven days', () => {
        expect(startOfWeek('2026-12-06')).toBe('2026-11-30') // a Sunday belongs to the week before
        expect(startOfWeek('2026-12-07')).toBe('2026-12-07')
        expect(weekOf('2026-12-09')).toEqual(daysBetween('2026-12-07', '2026-12-13'))
        expect(startOfWeek('2026-12-06', 0)).toBe('2026-12-06')
    })

    it('titles a week across a month and a year', () => {
        expect(weekTitle(weekOf('2026-12-09'))).toBe('Dec 7 to 13, 2026')
        expect(weekTitle(weekOf('2026-12-30'))).toBe('Dec 28, 2026 to Jan 3, 2027')
        expect(weekTitle(weekOf('2026-11-02'))).toBe('Nov 2 to 8, 2026')
    })

    it('shifts a month or a week', () => {
        expect(shiftDay('week', '2026-12-09', 1)).toBe('2026-12-16')
        expect(shiftDay('month', '2026-12-09', -1)).toBe('2026-11-09')
        expect(shiftDay('agenda', '2026-01-31', 1)).toBe('2026-02-28')
    })
})

describe('ranges for the API', () => {
    it('covers the first grid day to the end of the last, in the viewer zone', () => {
        const r = visibleRange('month', '2026-12-15', 'Europe/Berlin')
        expect(r.first).toBe('2026-11-30')
        expect(r.from).toBe('2026-11-29T23:00:00.000Z')
        expect(r.to).toBe('2027-01-10T22:59:59.999Z')
    })

    it('stays within 62 days for every month of several years in many zones', () => {
        const zones = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland', 'Australia/Lord_Howe', 'America/Sao_Paulo', 'Pacific/Kiritimati']
        for (const zone of zones) {
            for (let year = 2025; year <= 2028; year++) {
                for (let m = 1; m <= 12; m++) {
                    const day = `${year}-${String(m).padStart(2, '0')}-15`
                    for (const view of ['month', 'week', 'agenda'] as const) {
                        const r = visibleRange(view, day, zone)
                        expect(rangeLengthDays(r)).toBeLessThanOrEqual(MAX_RANGE_DAYS)
                        expect(new Date(r.to).getTime()).toBeGreaterThan(new Date(r.from).getTime())
                    }
                }
            }
        }
    })

    it('is a week of seven local days through a spring clock change (23 hour day)', () => {
        // Europe/Berlin moved forward on Sunday 29 March 2026
        const r = visibleRange('week', '2026-03-25', 'Europe/Berlin')
        expect(weekOf('2026-03-25')).toHaveLength(7)
        expect(r.first).toBe('2026-03-23')
        expect(r.last).toBe('2026-03-29')
        expect(r.from).toBe('2026-03-22T23:00:00.000Z')
        // The last day ends at 23:59:59.999 local, which is 21:59:59.999 UTC after the change
        expect(r.to).toBe('2026-03-29T21:59:59.999Z')
        expect(rangeLengthDays(r)).toBeCloseTo(7 - 1 / 24 - 0.001 / 86400, 3)
    })

    it('is a week of seven local days through an autumn clock change (25 hour day)', () => {
        const r = visibleRange('week', '2026-10-28', 'Europe/Berlin')
        expect(r.last).toBe('2026-11-01')
        expect(r.to).toBe('2026-11-01T22:59:59.999Z')
        expect(rangeLengthDays(r)).toBeGreaterThan(6.99)
    })

    it('agenda covers the calendar month', () => {
        const r = visibleRange('agenda', '2026-02-10', 'UTC')
        expect([r.first, r.last]).toEqual(['2026-02-01', '2026-02-28'])
    })
})

describe('events on days', () => {
    it('puts an event on the day of the viewer zone, not the event zone', () => {
        const late = item({ startDate: '2026-12-05T23:30:00.000Z', endDate: '2026-12-06T00:30:00.000Z' })
        expect(itemDays(late, 'UTC')).toEqual({ first: '2026-12-05', last: '2026-12-06' })
        expect(itemDays(late, 'Asia/Tokyo')).toEqual({ first: '2026-12-06', last: '2026-12-06' })
        expect(itemDays(late, 'America/Los_Angeles')).toEqual({ first: '2026-12-05', last: '2026-12-05' })
    })

    it('does not put an event that ends at midnight on the next day', () => {
        const e = item({ startDate: '2026-12-05T22:00:00.000Z', endDate: '2026-12-06T00:00:00.000Z' })
        expect(itemDays(e, 'UTC')).toEqual({ first: '2026-12-05', last: '2026-12-05' })
    })

    it('counts a day long event in its own zone', () => {
        const e = item({ isAllDay: true, timezone: 'Asia/Tokyo', startDate: '2026-12-05T15:00:00.000Z', endDate: '2026-12-06T15:00:00.000Z' })
        expect(itemDays(e, 'America/Los_Angeles')).toEqual({ first: '2026-12-06', last: '2026-12-06' })
    })

    it('lists a multi day event on each day inside the window, in time order with day long ones first', () => {
        const multi = item({ id: 'm', title: 'Hackathon', startDate: '2026-11-29T10:00:00.000Z', endDate: '2026-12-02T10:00:00.000Z' })
        const early = item({ id: 'a', title: 'A', startDate: '2026-12-01T08:00:00.000Z', endDate: '2026-12-01T09:00:00.000Z' })
        const allDay = item({ id: 'd', title: 'Day', isAllDay: true, timezone: 'UTC', startDate: '2026-12-01T00:00:00.000Z', endDate: '2026-12-02T00:00:00.000Z' })
        const map = bucketByDay([early, multi, allDay], 'UTC', '2026-12-01', '2026-12-31')
        expect(Array.from(map.keys())).toEqual(['2026-12-01', '2026-12-02'])
        expect(map.get('2026-12-01')!.map((e) => e.item.id)).toEqual(['d', 'm', 'a'])
        expect(map.get('2026-12-01')!.find((e) => e.item.id === 'm')!.continued).toBe(true)
    })

    it('names a day for screen readers', () => {
        expect(dayLong('2026-12-07')).toBe('Monday, December 7, 2026')
    })
})

describe('address bar', () => {
    const base = { today: '2026-12-09', phone: false }

    it('falls back to month view, today and all categories', () => {
        expect(parseCalendarParams(new URLSearchParams(''), base)).toEqual({ view: 'month', date: '2026-12-09', category: '' })
    })

    it('reads view, date and category and drops bad values', () => {
        expect(parseCalendarParams(new URLSearchParams('view=week&date=2026-12-24&category=ctf'), base)).toEqual({ view: 'week', date: '2026-12-24', category: 'ctf' })
        expect(parseCalendarParams(new URLSearchParams('view=year&date=nope&category=party'), base)).toEqual({ view: 'month', date: '2026-12-09', category: '' })
    })

    it('defaults a phone to the agenda and never gives it the month grid', () => {
        const phone = { today: '2026-12-09', phone: true }
        expect(parseCalendarParams(new URLSearchParams(''), phone).view).toBe('agenda')
        expect(parseCalendarParams(new URLSearchParams('view=month'), phone).view).toBe('agenda')
        expect(parseCalendarParams(new URLSearchParams('view=week'), phone).view).toBe('week')
    })

    it('still understands the old ?month= link', () => {
        expect(parseCalendarParams(new URLSearchParams('month=2027-02'), base)).toEqual({ view: 'agenda', date: '2027-02-01', category: '' })
    })

    it('writes only what differs from the defaults and round trips', () => {
        expect(calendarSearch({ view: 'month', date: '2026-12-09', category: '' }, base)).toBe('')
        expect(calendarSearch({ view: 'agenda', date: '2026-12-09', category: '' }, base)).toBe('view=agenda')
        expect(calendarSearch({ view: 'agenda', date: '2026-12-09', category: '' }, { today: '2026-12-09', phone: true })).toBe('')
        const state = { view: 'week' as const, date: '2027-01-04', category: 'workshop' as const }
        const qs = calendarSearch(state, base)
        expect(qs).toBe('view=week&date=2027-01-04&category=workshop')
        expect(parseCalendarParams(new URLSearchParams(qs), base)).toEqual(state)
    })
})
