import { describe, it, expect } from 'vitest'
import {
    countdownTo, effectiveStatus, formatClock, formatRange, formatStart, isValidTimeZone, localToInstant, monthRange,
    sameClock, serverClock, toLocalParts, zoneAbbreviation, zoneOffsetMinutes,
} from '../time'

describe('zones', () => {
    it('validates IANA zones', () => {
        expect(isValidTimeZone('Europe/Berlin')).toBe(true)
        expect(isValidTimeZone('Mars/Base')).toBe(false)
        expect(isValidTimeZone('')).toBe(false)
    })

    it('reads the offset in winter and summer', () => {
        expect(zoneOffsetMinutes(new Date('2026-12-05T12:00:00Z'), 'Europe/Berlin')).toBe(60)
        expect(zoneOffsetMinutes(new Date('2026-07-05T12:00:00Z'), 'Europe/Berlin')).toBe(120)
        expect(zoneOffsetMinutes(new Date('2026-12-05T12:00:00Z'), 'Asia/Kolkata')).toBe(330)
    })

    it('names the zone', () => {
        expect(zoneAbbreviation('2026-12-05T17:00:00Z', 'UTC')).toBe('UTC')
        expect(zoneAbbreviation('2026-12-05T17:00:00Z', 'Europe/Berlin')).toBe('GMT+1')
    })

    it('tells whether two zones show the same clock', () => {
        expect(sameClock('2026-12-05T17:00:00Z', 'Europe/London', 'UTC')).toBe(true)
        expect(sameClock('2026-12-05T17:00:00Z', 'Europe/Berlin', 'UTC')).toBe(false)
    })
})

describe('localToInstant', () => {
    it('converts the wall clock of the event zone to a UTC instant', () => {
        expect(localToInstant('2026-12-05', '18:00', 'Europe/Berlin')?.toISOString()).toBe('2026-12-05T17:00:00.000Z')
        expect(localToInstant('2026-07-05', '18:00', 'Europe/Berlin')?.toISOString()).toBe('2026-07-05T16:00:00.000Z')
        expect(localToInstant('2026-12-05', '18:00', 'Asia/Kolkata')?.toISOString()).toBe('2026-12-05T12:30:00.000Z')
        expect(localToInstant('2026-12-05', '18:00', 'America/Los_Angeles')?.toISOString()).toBe('2026-12-06T02:00:00.000Z')
        expect(localToInstant('2026-12-05', '18:00', 'UTC')?.toISOString()).toBe('2026-12-05T18:00:00.000Z')
    })

    it('round trips with toLocalParts', () => {
        const instant = localToInstant('2026-03-01', '23:30', 'Pacific/Auckland')!
        expect(toLocalParts(instant, 'Pacific/Auckland')).toEqual({ date: '2026-03-01', time: '23:30' })
    })

    it('rejects a time the clock change skips', () => {
        // Berlin jumps from 02:00 to 03:00 on 2026-03-29
        expect(localToInstant('2026-03-29', '02:30', 'Europe/Berlin')).toBeNull()
        expect(localToInstant('2026-03-29', '03:30', 'Europe/Berlin')?.toISOString()).toBe('2026-03-29T01:30:00.000Z')
    })

    it('takes the first occurrence of a repeated time', () => {
        // Berlin repeats 02:30 on 2026-10-25: first at +02:00 (00:30Z), then at +01:00 (01:30Z)
        expect(localToInstant('2026-10-25', '02:30', 'Europe/Berlin')?.toISOString()).toBe('2026-10-25T00:30:00.000Z')
    })

    it('rejects malformed input', () => {
        expect(localToInstant('2026-02-31', '10:00', 'UTC')).toBeNull()
        expect(localToInstant('2026-12-05', '25:00', 'UTC')).toBeNull()
        expect(localToInstant('05/12/2026', '10:00', 'UTC')).toBeNull()
        expect(localToInstant('2026-12-05', '10:00', 'Nope/Zone')).toBeNull()
    })
})

describe('formatting', () => {
    const event = { startDate: '2026-12-05T17:00:00.000Z', endsAt: '2026-12-05T19:00:00.000Z', endDate: '2026-12-05T19:00:00.000Z' }

    it('renders a range in the event zone and names it', () => {
        expect(formatRange(event, 'Europe/Berlin')).toBe('Sat, Dec 5 · 6:00 PM – 8:00 PM GMT+1')
        expect(formatRange(event, 'America/New_York', { withYear: true })).toBe('Sat, Dec 5, 2026 · 12:00 PM – 2:00 PM EST')
    })

    it('stays on one day label when the range does not cross midnight, and names both when it does', () => {
        expect(formatRange(event, 'Asia/Tokyo')).toBe('Sun, Dec 6 · 2:00 AM – 4:00 AM GMT+9')
        const overnight = { startDate: '2026-12-05T22:00:00.000Z', endsAt: '2026-12-06T02:00:00.000Z' }
        expect(formatRange(overnight, 'UTC')).toBe('Sat, Dec 5, 10:00 PM – Sun, Dec 6, 2:00 AM UTC')
    })

    it('uses a two hour default when there is no end', () => {
        expect(formatRange({ startDate: '2026-12-05T17:00:00.000Z' }, 'UTC')).toBe('Sat, Dec 5 · 5:00 PM – 7:00 PM UTC')
    })

    it('formats the start and the clock', () => {
        expect(formatStart(event, 'Europe/Berlin')).toBe('Sat, Dec 5 · 6:00 PM GMT+1')
        expect(formatClock(event.startDate, 'UTC')).toBe('5:00 PM')
    })
})

describe('status by the clock', () => {
    const base = { startDate: '2026-12-05T17:00:00.000Z', endsAt: '2026-12-05T19:00:00.000Z' }
    it('moves from upcoming to live to ended', () => {
        expect(effectiveStatus({ ...base, status: 'upcoming' }, new Date('2026-12-05T16:59:00Z'))).toBe('upcoming')
        expect(effectiveStatus({ ...base, status: 'upcoming' }, new Date('2026-12-05T17:00:00Z'))).toBe('live')
        expect(effectiveStatus({ ...base, status: 'upcoming' }, new Date('2026-12-05T19:00:00Z'))).toBe('ended')
    })
    it('never overrides a decision', () => {
        for (const status of ['pending', 'rejected', 'cancelled'] as const) {
            expect(effectiveStatus({ ...base, status }, new Date('2030-01-01'))).toBe(status)
        }
    })
    it('serverClock agrees with the status the API sent', () => {
        for (const status of ['upcoming', 'live', 'ended'] as const) {
            expect(effectiveStatus({ ...base, status }, serverClock({ ...base, status }))).toBe(status)
        }
    })
})

describe('countdown', () => {
    const start = '2026-12-05T17:00:00.000Z'
    it('counts down in the largest sensible units', () => {
        expect(countdownTo(start, new Date('2026-12-03T14:00:00Z'))?.label).toBe('2 days 3 hours')
        expect(countdownTo(start, new Date('2026-12-05T14:30:00Z'))?.label).toBe('2 hours 30 minutes')
        expect(countdownTo(start, new Date('2026-12-05T16:48:00Z'))?.label).toBe('12 minutes')
        expect(countdownTo(start, new Date('2026-12-04T17:00:00Z'))?.label).toBe('1 day')
    })
    it('is null once started', () => {
        expect(countdownTo(start, new Date('2026-12-05T17:00:00Z'))).toBeNull()
    })
})

describe('monthRange', () => {
    it('spans the month in the given zone', () => {
        expect(monthRange(2026, 11, 'UTC')).toEqual({ from: '2026-12-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z' })
        expect(monthRange(2026, 11, 'Asia/Kolkata').from).toBe('2026-11-30T18:30:00.000Z')
    })
})
