import { describe, it, expect } from 'vitest'
import {
    describeRecurrence, emptySeriesForm, formatDuration, isSeriesId, seriesToEditValues, startsOnBounds, toSeriesPatch, toSeriesPayload,
    validateSeriesEdit, validateSeriesForm, type SeriesFormValues,
} from '../series'
import type { Series } from '@/types/event'

const NOW = new Date('2026-11-24T12:00:00Z')

const valid = (over: Partial<SeriesFormValues> = {}): SeriesFormValues => ({
    ...emptySeriesForm('Europe/London', false),
    title: 'Weekly CTF Night',
    description: 'Bring a laptop.',
    category: 'ctf',
    startsOn: '2026-12-03',
    ...over,
})
const errorsOf = (values: SeriesFormValues, admin = false) => {
    const r = validateSeriesForm(values, { admin, now: NOW })
    return r.ok ? {} : r.errors
}

describe('describeRecurrence', () => {
    const base = { interval: 1, weekday: 4, weekOfMonth: null, startTime: '19:00', timezone: 'Europe/London' }

    it('says weekly in plain words', () => {
        expect(describeRecurrence({ ...base, rule: 'weekly' })).toBe('Every Thursday at 19:00 Europe/London')
        expect(describeRecurrence({ ...base, rule: 'weekly', interval: 3 })).toBe('Every 3 weeks on Thursday at 19:00 Europe/London')
    })
    it('doubles the interval for every other week', () => {
        expect(describeRecurrence({ ...base, rule: 'biweekly' })).toBe('Every 2 weeks on Thursday at 19:00 Europe/London')
        expect(describeRecurrence({ ...base, rule: 'biweekly', interval: 2 })).toBe('Every 4 weeks on Thursday at 19:00 Europe/London')
    })
    it('names the nth weekday of a month', () => {
        expect(describeRecurrence({ ...base, rule: 'monthly-by-weekday', weekOfMonth: 1 })).toBe('On the first Thursday of every month at 19:00 Europe/London')
        expect(describeRecurrence({ ...base, rule: 'monthly-by-weekday', weekOfMonth: -1, weekday: 5, startTime: '18:30', timezone: 'UTC' })).toBe('On the last Friday of every month at 18:30 UTC')
        expect(describeRecurrence({ ...base, rule: 'monthly-by-weekday', weekOfMonth: 3, interval: 3, weekday: 0 })).toBe('On the third Sunday of every 3 months at 19:00 Europe/London')
    })
    it('adds how it ends', () => {
        expect(describeRecurrence({ ...base, rule: 'weekly', until: '2027-03-31' })).toBe('Every Thursday at 19:00 Europe/London, until March 31, 2027')
        expect(describeRecurrence({ ...base, rule: 'weekly', count: 10 })).toBe('Every Thursday at 19:00 Europe/London, 10 occurrences in all')
        expect(describeRecurrence({ ...base, rule: 'weekly', count: 1 })).toMatch(/1 occurrence in all$/)
    })
    it('formats a duration', () => {
        expect(formatDuration(120)).toBe('2 hours')
        expect(formatDuration(90)).toBe('1 hour 30 minutes')
        expect(formatDuration(15)).toBe('15 minutes')
    })
})

describe('create form validation', () => {
    it('accepts a complete weekly series', () => {
        expect(validateSeriesForm(valid(), { now: NOW }).ok).toBe(true)
    })

    it('mirrors the API limits', () => {
        expect(errorsOf(valid({ title: 'abcd' })).title).toMatch(/at least 5/)
        expect(errorsOf(valid({ title: 'x'.repeat(101) })).title).toMatch(/cannot exceed 100/)
        expect(errorsOf(valid({ interval: '0' })).interval).toMatch(/1 to 12/)
        expect(errorsOf(valid({ interval: '13' })).interval).toMatch(/1 to 12/)
        expect(errorsOf(valid({ durationMinutes: '14' })).durationMinutes).toMatch(/15 to 1440/)
        expect(errorsOf(valid({ durationMinutes: '1441' })).durationMinutes).toMatch(/15 to 1440/)
        expect(errorsOf(valid({ count: '521' })).count).toMatch(/1 to 520/)
        expect(errorsOf(valid({ count: '520' })).count).toBeUndefined()
        expect(errorsOf(valid({ generateAheadDays: '6' })).generateAheadDays).toMatch(/7 to 365/)
        expect(errorsOf(valid({ generateAheadDays: '366' })).generateAheadDays).toMatch(/7 to 365/)
        expect(errorsOf(valid({ startTime: '25:00' })).startTime).toBeDefined()
        expect(errorsOf(valid({ weekday: '7' })).weekday).toBeDefined()
        expect(errorsOf(valid({ timezone: 'Mars/Base' })).timezone).toBeDefined()
        expect(errorsOf(valid({ eventLink: 'http://insecure.example' })).eventLink).toMatch(/https/)
        expect(errorsOf(valid({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') })).tags).toMatch(/at most 10/)
    })

    it('limits the first date to 366 days back and 731 days ahead', () => {
        expect(startsOnBounds('Europe/London', NOW)).toEqual({ min: '2025-11-23', max: '2028-11-24' })
        expect(errorsOf(valid({ startsOn: '2025-11-23' })).startsOn).toBeUndefined()
        expect(errorsOf(valid({ startsOn: '2025-11-22' })).startsOn).toMatch(/366 days in the past/)
        expect(errorsOf(valid({ startsOn: '2028-11-24' })).startsOn).toBeUndefined()
        expect(errorsOf(valid({ startsOn: '2028-11-25' })).startsOn).toMatch(/731 days ahead/)
        expect(errorsOf(valid({ startsOn: '2026-02-30' })).startsOn).toBeDefined()
        expect(errorsOf(valid({ startsOn: '' })).startsOn).toMatch(/first date/)
    })

    it('rejects a time the clock skips on the first date', () => {
        // 29 March 2026, 01:30 does not exist in London
        const e = errorsOf(valid({ startsOn: '2027-03-28', startTime: '01:30' }))
        expect(e.startTime).toMatch(/does not exist/)
    })

    it('does not allow both a last date and a count, or an end before the start', () => {
        expect(errorsOf(valid({ until: '2027-03-01', count: '5' })).count).toMatch(/not both/)
        expect(errorsOf(valid({ until: '2026-12-01' })).until).toMatch(/before the first date/)
    })

    it('needs a capacity for a moderator, within 500, and lets an administrator leave it open', () => {
        expect(errorsOf(valid({ maxParticipants: '' }), false).maxParticipants).toBeDefined()
        expect(errorsOf(valid({ maxParticipants: '501' }), false).maxParticipants).toBeDefined()
        expect(errorsOf(valid({ maxParticipants: '' }), true).maxParticipants).toBeUndefined()
        expect(errorsOf(valid({ maxParticipants: '10000' }), true).maxParticipants).toBeUndefined()
        expect(errorsOf(valid({ maxParticipants: '10001' }), true).maxParticipants).toBeDefined()
    })

    it('asks where an in person series happens', () => {
        expect(errorsOf(valid({ locationType: 'in-person' })).location).toMatch(/where/)
        expect(errorsOf(valid({ locationType: 'in-person', venue: 'Hub' })).location).toBeUndefined()
    })
})

describe('create payload', () => {
    it('sends a weekly series without the month field and without blanks', () => {
        const body = toSeriesPayload(valid({ interval: '2', until: '' }))
        expect(body).toMatchObject({
            title: 'Weekly CTF Night', category: 'ctf', locationType: 'online', waitlistEnabled: true, rsvpEnabled: true, maxParticipants: 500, generateAheadDays: 60,
            recurrence: { rule: 'weekly', interval: 2, weekday: 4, startsOn: '2026-12-03', startTime: '19:00', timezone: 'Europe/London', durationMinutes: 120, until: null, count: null },
        })
        expect((body.recurrence as Record<string, unknown>).weekOfMonth).toBeUndefined()
        expect(body.venue).toBeUndefined()
        expect(body.tags).toBeUndefined()
    })

    it('sends the week of the month only for a monthly rule', () => {
        const body = toSeriesPayload(valid({ rule: 'monthly-by-weekday', weekOfMonth: '-1', count: '6' }))
        expect(body.recurrence).toMatchObject({ rule: 'monthly-by-weekday', weekOfMonth: -1, count: 6 })
    })

    it('lets an administrator send no limit', () => {
        expect(toSeriesPayload(valid({ maxParticipants: '' }), { admin: true }).maxParticipants).toBeNull()
        expect('maxParticipants' in toSeriesPayload(valid({ maxParticipants: '' }), { admin: false })).toBe(false)
    })
})

const series = (over: Partial<Series> = {}): Series => ({
    id: '64b000000000000000000009', title: 'Weekly CTF Night', description: 'Bring a laptop.', shortDescription: null, image: null, bannerImage: null, category: 'ctf',
    tags: [], format: 'online', location: 'Online', venue: null, registrationLink: null, organizer: 'TheCyberHub', organizerLogo: null, maxParticipants: 60,
    rsvpEnabled: true, waitlistEnabled: true, status: 'active', createdAt: '2026-11-01T00:00:00Z', nextOccurrences: [],
    recurrence: { rule: 'weekly', interval: 1, weekday: 4, weekOfMonth: null, startsOn: '2026-12-03', startTime: '19:00', timezone: 'Europe/London', durationMinutes: 120, until: null, count: null },
    eventLink: null, streamLink: null, generateAheadDays: 60, counts: { generated: 8, overridden: 1, pending: 2 },
    ...over,
})

describe('editing one date or all future ones', () => {
    const initial = seriesToEditValues(series())

    it('sends only what changed, with the scope', () => {
        const future = toSeriesPatch(initial, { ...initial, startTime: '20:00', title: 'Weekly CTF Night!' }, 'future')
        expect(future).toEqual({ scope: 'future', title: 'Weekly CTF Night!', startTime: '20:00' })
        const one = toSeriesPatch(initial, { ...initial, durationMinutes: '90' }, 'this', { eventId: 'e1' })
        expect(one).toEqual({ scope: 'this', eventId: 'e1', durationMinutes: 90 })
    })

    it('never sends the schedule rule, and returns nothing when nothing changed', () => {
        expect(toSeriesPatch(initial, initial, 'future')).toEqual({})
        const body = toSeriesPatch(initial, { ...initial, startTime: '20:00' }, 'future')
        for (const locked of ['rule', 'interval', 'weekday', 'weekOfMonth', 'startsOn']) expect(body).not.toHaveProperty(locked)
    })

    it('moves one date in the zone of that occurrence', () => {
        const body = toSeriesPatch(initial, { ...initial, moveDate: '2026-12-10', moveTime: '20:00' }, 'this', { eventId: 'e1', occurrenceZone: 'Europe/London' })
        expect(body).toEqual({ scope: 'this', eventId: 'e1', startDate: '2026-12-10T20:00:00.000Z' })
    })

    it('only allows future fields for the future scope', () => {
        expect(validateSeriesEdit({ ...initial, startTime: '99:99' }, 'future').ok).toBe(false)
        expect(validateSeriesEdit({ ...initial, startTime: '99:99' }, 'this').ok).toBe(true)
        expect(validateSeriesEdit({ ...initial, moveDate: '2026-12-10' }, 'this').ok).toBe(false)
        expect(validateSeriesEdit({ ...initial, until: '2027-01-01', count: '4' }, 'future').ok).toBe(false)
    })

    it('clears the end with null', () => {
        const withEnd = seriesToEditValues(series({ recurrence: { ...series().recurrence, until: '2027-01-01' } }))
        expect(toSeriesPatch(withEnd, { ...withEnd, until: '' }, 'future')).toEqual({ scope: 'future', until: null })
    })
})

describe('ids', () => {
    it('knows a series id', () => {
        expect(isSeriesId('64b000000000000000000009')).toBe(true)
        expect(isSeriesId('64b0000000000000000000')).toBe(false)
        expect(isSeriesId('../etc')).toBe(false)
    })
})
