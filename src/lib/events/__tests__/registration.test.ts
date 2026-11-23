import { describe, it, expect } from 'vitest'
import { registrationView } from '../registration'
import { availability, plainExcerpt, safeHref } from '../display'
import { eventJsonLd } from '../server'
import { makeEvent, viewer } from './fixtures'

const BEFORE = new Date('2026-12-01T10:00:00Z')
const DURING = new Date('2026-12-05T17:30:00Z')
const AFTER = new Date('2026-12-06T10:00:00Z')
const view = (event = makeEvent(), over: Partial<{ signedIn: boolean; authLoading: boolean; now: Date }> = {}) =>
    registrationView(event, { signedIn: true, authLoading: false, now: BEFORE, ...over })

describe('registrationView', () => {
    it('offers to register when the server says so', () => {
        expect(view().kind).toBe('can-register')
    })
    it('offers the waiting list when the event is full', () => {
        expect(view(makeEvent({ isFull: true, viewer: viewer({ canRegister: false, canJoinWaitlist: true }) })).kind).toBe('can-waitlist')
    })
    it('never offers a plain register button on a full event, whatever the flags say', () => {
        const full = { isFull: true, spotsLeft: 0, waitlistEnabled: true }
        expect(view(makeEvent({ ...full, viewer: viewer({ canRegister: true, canJoinWaitlist: false }) })).kind).toBe('can-waitlist')
        expect(view(makeEvent({ ...full, viewer: viewer({ canRegister: false, canJoinWaitlist: true }) })).kind).toBe('can-waitlist')
        expect(view(makeEvent({ ...full, viewer: viewer({ canRegister: false, canJoinWaitlist: false }) })).kind).toBe('closed')
        expect(view(makeEvent({ ...full, waitlistEnabled: false, viewer: viewer({ canRegister: true, canJoinWaitlist: false }) })).kind).toBe('closed')
    })
    it('shows registered, attended and waitlisted from the viewer block', () => {
        expect(view(makeEvent({ viewer: viewer({ canRegister: false, registered: true }) }))).toEqual({ kind: 'registered', attended: false })
        expect(view(makeEvent({ viewer: viewer({ canRegister: false, waitlisted: true, position: 3 }) }))).toEqual({ kind: 'waitlisted', position: 3 })
    })
    it('explains why registration is closed', () => {
        const noSeats = view(makeEvent({ isFull: true, waitlistEnabled: false, viewer: viewer({ canRegister: false }) }))
        expect(noSeats).toMatchObject({ kind: 'closed', reason: expect.stringMatching(/full/) })
        const late = view(makeEvent({ rsvpDeadline: '2026-12-02T10:00:00.000Z', viewer: viewer({ canRegister: false }) }), { now: new Date('2026-12-03T00:00:00Z') })
        expect(late).toMatchObject({ kind: 'closed', reason: expect.stringMatching(/closed on/) })
        const live = view(makeEvent({ status: 'live', viewer: viewer({ canRegister: false }) }), { now: DURING })
        expect(live).toMatchObject({ kind: 'closed', reason: expect.stringMatching(/started/) })
    })
    it('waits for the viewer block of a signed-in member', () => {
        expect(view(makeEvent({ viewer: undefined })).kind).toBe('loading')
    })
    it('sends a guest to sign in, or says it is closed', () => {
        expect(view(makeEvent({ viewer: undefined }), { signedIn: false })).toEqual({ kind: 'guest', open: true, reason: null })
        expect(view(makeEvent({ viewer: undefined, isFull: true, waitlistEnabled: false }), { signedIn: false })).toMatchObject({ kind: 'guest', open: false })
        expect(view(makeEvent({ viewer: undefined }), { signedIn: false, authLoading: true }).kind).toBe('loading')
    })
    it('handles ended and cancelled events before anything else', () => {
        expect(view(makeEvent({ status: 'ended' }), { now: AFTER })).toEqual({ kind: 'ended', registered: false, attended: false })
        expect(view(makeEvent({ viewer: viewer({ registered: true, attended: true }) }), { now: AFTER })).toEqual({ kind: 'ended', registered: true, attended: true })
        expect(view(makeEvent({ status: 'cancelled', cancelReason: 'Speaker ill' }))).toEqual({ kind: 'cancelled', reason: 'Speaker ill' })
    })
})

describe('availability', () => {
    const base = { isFull: false, waitlistEnabled: true, waitlistCount: 0, maxParticipants: 60, spotsLeft: 18, registeredCount: 42 }
    it('counts spots, full and waitlist', () => {
        expect(availability(base)).toEqual({ kind: 'spots', label: '18 spots left' })
        expect(availability({ ...base, spotsLeft: 2 })).toEqual({ kind: 'few', label: '2 spots left' })
        expect(availability({ ...base, spotsLeft: 1 }).label).toBe('1 spot left')
        expect(availability({ ...base, isFull: true, spotsLeft: 0, waitlistCount: 4 })).toEqual({ kind: 'waitlist', label: 'Full · waitlist open (4 waiting)' })
        expect(availability({ ...base, isFull: true, waitlistEnabled: false })).toEqual({ kind: 'full', label: 'Full' })
        expect(availability({ ...base, maxParticipants: null, spotsLeft: null })).toEqual({ kind: 'going', label: '42 going' })
        expect(availability({ ...base, maxParticipants: null, spotsLeft: null, registeredCount: 0 }).kind).toBe('open')
    })
})

describe('display helpers', () => {
    it('shows only http and https links', () => {
        expect(safeHref('https://example.org/a')).toBe('https://example.org/a')
        expect(safeHref('javascript:alert(1)')).toBeNull()
        expect(safeHref('data:text/html,hi')).toBeNull()
        expect(safeHref(null)).toBeNull()
    })
    it('makes a plain excerpt', () => {
        expect(plainExcerpt('# Title\n\nSome **bold** text and a [link](https://x.org).')).toBe('Title Some bold text and a link.')
        expect(plainExcerpt('word '.repeat(100), 40).length).toBeLessThanOrEqual(40)
    })
})

describe('Event JSON-LD', () => {
    it('describes a public event without private facts', () => {
        const ld = eventJsonLd(makeEvent({ joinLink: 'https://meet.example.org/secret' }), BEFORE)
        expect(ld).toMatchObject({
            '@type': 'Event',
            name: 'Winter CTF Night',
            startDate: '2026-12-05T17:00:00.000Z',
            endDate: '2026-12-05T19:00:00.000Z',
            eventStatus: 'https://schema.org/EventScheduled',
            eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
            location: { '@type': 'VirtualLocation' },
            organizer: { '@type': 'Organization', name: 'Ada' },
        })
        expect(JSON.stringify(ld)).not.toContain('secret')
    })
    it('marks cancelled and in-person events', () => {
        const ld = eventJsonLd(makeEvent({ status: 'cancelled', locationType: 'in-person', location: 'Berlin', venue: 'Hall 1' }), BEFORE)
        expect(ld.eventStatus).toBe('https://schema.org/EventCancelled')
        expect(ld.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode')
        expect(ld.location).toMatchObject({ '@type': 'Place', name: 'Hall 1', address: 'Berlin' })
    })
})
