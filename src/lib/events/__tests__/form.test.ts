import { describe, it, expect } from 'vitest'
import {
    emptyEventForm, eventToFormValues, isHttpsUrl, lockedFieldsFor, parseTags, toCreatePayload, toFullPayload, toUpdatePayload,
    validateEventForm, type EventFormValues,
} from '../form'
import { makeEvent } from './fixtures'

const NOW = new Date('2026-11-23T10:00:00Z')

const valid = (over: Partial<EventFormValues> = {}): EventFormValues => ({
    ...emptyEventForm('Europe/Berlin'),
    title: 'Winter CTF Night',
    category: 'ctf',
    startDate: '2026-12-05',
    startTime: '18:00',
    description: 'Bring a laptop.',
    ...over,
})

const check = (values: EventFormValues, options = {}) => validateEventForm(values, { now: NOW, ...options })

describe('validation', () => {
    it('accepts a minimal event', () => {
        expect(check(valid(), { creating: true }).ok).toBe(true)
    })

    it('mirrors the API limits', () => {
        const r = check(valid({ title: 'abc', shortDescription: 'x'.repeat(151), description: '  ' }))
        expect(r.ok).toBe(false)
        if (!r.ok) {
            expect(r.errors.title).toMatch(/at least 5/)
            expect(r.errors.shortDescription).toMatch(/150/)
            expect(r.errors.description).toMatch(/Describe/)
        }
    })

    it('needs a category, a start date and a start time', () => {
        const r = check({ ...valid(), category: '', startDate: '', startTime: '' })
        expect(r.ok).toBe(false)
        if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(['category', 'startDate', 'startTime']))
    })

    it('allows https links only, without credentials', () => {
        expect(isHttpsUrl('https://example.org/x')).toBe(true)
        expect(isHttpsUrl('http://example.org')).toBe(false)
        expect(isHttpsUrl('javascript:alert(1)')).toBe(false)
        expect(isHttpsUrl('https://user:pw@example.org')).toBe(false)
        const r = check(valid({ eventLink: 'http://example.org', registrationLink: 'ftp://x', image: 'nope' }))
        expect(r.ok).toBe(false)
        if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(['eventLink', 'registrationLink', 'image']))
        expect(check(valid({ eventLink: 'https://meet.example.org/abc' })).ok).toBe(true)
    })

    it('limits tags to 10 of 30 characters', () => {
        expect(check(valid({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') })).ok).toBe(false)
        expect(check(valid({ tags: 'x'.repeat(31) })).ok).toBe(false)
        expect(parseTags(' web, Web ,, forensics ')).toEqual(['web', 'forensics'])
    })

    it('needs an end after the start, and a time with an end date', () => {
        const before = check(valid({ endTime: '17:00' }))
        expect(before.ok).toBe(false)
        if (!before.ok) expect(before.errors.endTime).toMatch(/after the start/)
        const noTime = check(valid({ endDate: '2026-12-06' }))
        expect(noTime.ok).toBe(false)
        if (!noTime.ok) expect(noTime.errors.endTime).toMatch(/end time/)
        expect(check(valid({ endTime: '20:00' })).ok).toBe(true)
        expect(check(valid({ endDate: '2026-12-06', endTime: '02:00' })).ok).toBe(true)
    })

    it('rejects a start in the past for a new member event, but not for an administrator', () => {
        const past = valid({ startDate: '2026-11-01' })
        expect(check(past, { creating: true }).ok).toBe(false)
        expect(check(past, { creating: true, admin: true }).ok).toBe(true)
        expect(check(past, { creating: false }).ok).toBe(true)
    })

    it('rejects a time skipped by a clock change', () => {
        const r = check(valid({ startDate: '2026-03-29', startTime: '02:30' }))
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.errors.startTime).toMatch(/does not exist/)
    })

    it('needs both parts of a registration deadline, before the start', () => {
        expect(check(valid({ rsvpDeadlineDate: '2026-12-01' })).ok).toBe(false)
        expect(check(valid({ rsvpDeadlineDate: '2026-12-06', rsvpDeadlineTime: '10:00' })).ok).toBe(false)
        expect(check(valid({ rsvpDeadlineDate: '2026-12-04', rsvpDeadlineTime: '10:00' })).ok).toBe(true)
    })

    it('asks for a place unless the event is online', () => {
        expect(check(valid({ locationType: 'in-person' })).ok).toBe(false)
        expect(check(valid({ locationType: 'in-person', location: 'Berlin' })).ok).toBe(true)
    })

    it('members need a capacity of at most 500; administrators may leave it open', () => {
        expect(check(valid({ maxParticipants: '' })).ok).toBe(false)
        expect(check(valid({ maxParticipants: '501' })).ok).toBe(false)
        expect(check(valid({ maxParticipants: '12.5' })).ok).toBe(false)
        expect(check(valid({ maxParticipants: '500' })).ok).toBe(true)
        expect(check(valid({ maxParticipants: '' }), { admin: true }).ok).toBe(true)
        expect(check(valid({ maxParticipants: '9000' }), { admin: true }).ok).toBe(true)
        expect(check(valid({ maxParticipants: '10001' }), { admin: true }).ok).toBe(false)
    })

    it('defaults a member to 500 seats and an administrator to no limit', () => {
        expect(emptyEventForm('UTC').maxParticipants).toBe('500')
        expect(emptyEventForm('UTC', true).maxParticipants).toBe('')
    })

    it('needs a name for every speaker', () => {
        const r = check(valid({ speakers: [{ name: '' }] }))
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.errors['speakers.0.name']).toBeDefined()
    })
})

describe('conversion to the API payload', () => {
    it('turns date, time and zone into UTC instants', () => {
        const p = toFullPayload(valid({ endTime: '20:00', timezone: 'Europe/Berlin' }))
        expect(p.startDate).toBe('2026-12-05T17:00:00.000Z')
        expect(p.endDate).toBe('2026-12-05T19:00:00.000Z')
        expect(p.timezone).toBe('Europe/Berlin')
    })

    it('uses the end date when the event runs past midnight', () => {
        const p = toFullPayload(valid({ startTime: '22:00', endDate: '2026-12-06', endTime: '02:00' }))
        expect(p.endDate).toBe('2026-12-06T01:00:00.000Z')
    })

    it('leaves empty optional fields out of a new event', () => {
        const p = toCreatePayload(valid())
        expect(Object.keys(p).sort()).toEqual(['category', 'description', 'locationType', 'maxParticipants', 'startDate', 'timezone', 'title', 'waitlistEnabled'].sort())
        expect(p.maxParticipants).toBe(500)
        expect(JSON.stringify(p)).not.toContain('""')
    })

    it('sends staff fields only for administrators', () => {
        expect(toCreatePayload(valid({ eventType: 'official', isFeatured: true }))).not.toHaveProperty('eventType')
        const admin = toCreatePayload(valid({ eventType: 'official', isFeatured: true, maxParticipants: '' }), { admin: true })
        expect(admin).toMatchObject({ eventType: 'official', isFeatured: true })
        expect(admin).not.toHaveProperty('maxParticipants')
    })

    it('splits tags and cleans speakers', () => {
        const p = toFullPayload(valid({ tags: 'web, ctf', speakers: [{ name: ' Ada ', title: ' ' }, { name: '' }] }))
        expect(p.tags).toEqual(['web', 'ctf'])
        expect(p.speakers).toEqual([{ name: 'Ada' }])
    })
})

describe('editing', () => {
    const event = makeEvent({ endDate: '2026-12-05T19:00:00.000Z', location: 'Online', maxParticipants: 60, tags: ['beginner'], eventLink: 'https://meet.example.org/x' })

    it('loads the form in the organizer zone', () => {
        const v = eventToFormValues(event)
        expect(v).toMatchObject({ startDate: '2026-12-05', startTime: '18:00', endDate: '', endTime: '20:00', timezone: 'Europe/Berlin', location: '', maxParticipants: '60', tags: 'beginner' })
    })

    it('sends nothing when nothing changed', () => {
        const v = eventToFormValues(event)
        expect(toUpdatePayload(v, v)).toEqual({})
    })

    it('sends only what changed', () => {
        const v = eventToFormValues(event)
        expect(toUpdatePayload({ ...v, description: 'New text' }, v)).toEqual({ description: 'New text' })
    })

    it('can clear an optional field', () => {
        const v = eventToFormValues(event)
        expect(toUpdatePayload({ ...v, eventLink: '' }, v)).toEqual({ eventLink: '' })
        expect(toUpdatePayload({ ...v, endTime: '' }, v)).toMatchObject({ endDate: null })
    })

    it('keeps date, time and zone together when one changes', () => {
        const v = eventToFormValues(event)
        const p = toUpdatePayload({ ...v, timezone: 'UTC' }, v)
        expect(p).toMatchObject({ timezone: 'UTC', startDate: '2026-12-05T18:00:00.000Z' })
    })

    it('never sends locked fields', () => {
        const v = eventToFormValues(event)
        const p = toUpdatePayload({ ...v, title: 'Other title', description: 'x' }, v, { locked: ['title'] })
        expect(p).toEqual({ description: 'x' })
    })

    it('knows what a creator may not change', () => {
        expect(lockedFieldsFor(event, true, 'upcoming')).toEqual([])
        expect(lockedFieldsFor(makeEvent({ status: 'pending' }), false, 'pending')).toEqual([])
        expect(lockedFieldsFor(event, false, 'upcoming')).toEqual(expect.arrayContaining(['title', 'category', 'organizer']))
        expect(lockedFieldsFor(event, false, 'ended')).toContain('description')
        expect(lockedFieldsFor(event, false, 'ended')).not.toContain('recordingLink')
    })
})
