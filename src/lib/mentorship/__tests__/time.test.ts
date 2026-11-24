import { describe, it, expect } from 'vitest'
import { clockRange, formatMoment, sessionInstant, sessionTimes, sessionWindow, slotView, sortSlots } from '../time'

describe('session times', () => {
    const AT = '2026-12-07T09:00:00.000Z'

    it('shows the time in the viewer zone and adds the planner zone when the clock differs', () => {
        const t = sessionTimes(AT, 'Asia/Kolkata', 'Europe/Berlin')
        expect(t.primary).toBe('Mon, Dec 7 · 10:00 AM GMT+1')
        expect(t.secondary).toBe('Mon, Dec 7 · 2:30 PM GMT+5:30')
    })
    it('adds nothing when both zones read the same', () => {
        expect(sessionTimes(AT, 'Europe/Paris', 'Europe/Berlin').secondary).toBeNull()
        expect(sessionTimes(AT, 'Europe/Berlin', 'Europe/Berlin').secondary).toBeNull()
    })
    it('falls back to UTC until the viewer zone is known, without a second line', () => {
        const t = sessionTimes(AT, 'Asia/Kolkata', null)
        expect(t.primary).toBe('Mon, Dec 7 · 9:00 AM UTC')
        expect(t.secondary).toBeNull()
    })
    it('survives an unknown zone from old data', () => {
        expect(sessionTimes(AT, 'Not/AZone', 'UTC').primary).toBe('Mon, Dec 7 · 9:00 AM UTC')
    })
    it('writes the range with the zone', () => {
        expect(clockRange(AT, 90, 'Asia/Kolkata')).toBe('2:30 PM – 4:00 PM GMT+5:30')
    })
    it('formats a moment in any zone, showing the next day when the date differs', () => {
        expect(formatMoment('2026-12-07T23:30:00Z', 'Asia/Tokyo')).toBe('Tue, Dec 8 · 8:30 AM GMT+9')
    })
})

describe('session instants (time zone conversion)', () => {
    it('reads the wall clock in the chosen zone', () => {
        expect(sessionInstant('2026-12-07', '10:00', 'Europe/Berlin')?.toISOString()).toBe('2026-12-07T09:00:00.000Z')
        expect(sessionInstant('2026-12-07', '10:00', 'Asia/Kolkata')?.toISOString()).toBe('2026-12-07T04:30:00.000Z')
        expect(sessionInstant('2026-12-07', '10:00', 'America/New_York')?.toISOString()).toBe('2026-12-07T15:00:00.000Z')
    })
    it('follows the daylight saving rules of that date', () => {
        expect(sessionInstant('2026-07-07', '10:00', 'Europe/Berlin')?.toISOString()).toBe('2026-07-07T08:00:00.000Z')
    })
    it('is null for a skipped time, a missing value or an impossible date', () => {
        expect(sessionInstant('2026-03-29', '02:30', 'Europe/Berlin')).toBeNull()
        expect(sessionInstant('', '10:00', 'UTC')).toBeNull()
        expect(sessionInstant('2026-02-31', '10:00', 'UTC')).toBeNull()
    })
    it('takes the first of two equal wall clock times when the clocks go back', () => {
        expect(sessionInstant('2026-10-25', '02:30', 'Europe/Berlin')?.toISOString()).toBe('2026-10-25T00:30:00.000Z')
    })
    it('judges the lead time', () => {
        const now = new Date('2026-12-01T10:00:00Z')
        expect(sessionWindow(null, now)).toBe('invalid')
        expect(sessionWindow(new Date('2026-12-01T10:04:00Z'), now)).toBe('too-soon')
        expect(sessionWindow(new Date('2026-12-01T10:05:00Z'), now)).toBe('ok')
        expect(sessionWindow(new Date('2027-03-01T10:00:00Z'), now)).toBe('ok')
        expect(sessionWindow(new Date('2027-03-02T10:00:01Z'), now)).toBe('too-far')
    })
})

describe('weekly availability in two zones', () => {
    const REF = new Date('2026-12-01T12:00:00Z') // a Tuesday

    it('shows the slot as written, and in the viewer zone with the weekday it falls on there', () => {
        const v = slotView({ dayOfWeek: 1, startHour: 18, endHour: 20 }, 'Europe/Berlin', 'Asia/Kolkata', REF)
        expect(v.mentor).toBe('Mon 18:00 – 20:00 GMT+1')
        expect(v.viewer).toBe('Mon 10:30 PM – Tue 12:30 AM GMT+5:30')
    })
    it('has no second line when the viewer zone is unknown or shows the same clock', () => {
        expect(slotView({ dayOfWeek: 1, startHour: 18, endHour: 20 }, 'Europe/Berlin', null, REF).viewer).toBeNull()
        expect(slotView({ dayOfWeek: 1, startHour: 18, endHour: 20 }, 'Europe/Berlin', 'Europe/Paris', REF).viewer).toBeNull()
    })
    it('handles a slot that ends at 24:00', () => {
        const v = slotView({ dayOfWeek: 0, startHour: 22, endHour: 24 }, 'UTC', 'Asia/Tokyo', REF)
        expect(v.mentor).toBe('Sun 22:00 – 24:00 UTC')
        expect(v.viewer).toBe('Mon 7:00 AM – 9:00 AM GMT+9')
    })
    it('applies the clock change of that week', () => {
        // Berlin is on GMT+2 in July; 18:00 there is 12:00 in New York (GMT-4)
        const v = slotView({ dayOfWeek: 1, startHour: 18, endHour: 19 }, 'Europe/Berlin', 'America/New_York', new Date('2026-07-01T12:00:00Z'))
        expect(v.viewer).toBe('Mon 12:00 PM – 1:00 PM EDT')
    })
    it('sorts Monday first and Sunday last', () => {
        const sorted = sortSlots([{ dayOfWeek: 0, startHour: 9, endHour: 10 }, { dayOfWeek: 3, startHour: 9, endHour: 10 }, { dayOfWeek: 1, startHour: 12, endHour: 13 }, { dayOfWeek: 1, startHour: 8, endHour: 9 }])
        expect(sorted.map((s) => `${s.dayOfWeek}-${s.startHour}`)).toEqual(['1-8', '1-12', '3-9', '0-9'])
    })
})
