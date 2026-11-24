import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ fetchApi, API_URL: 'https://api.example.test' }))

import * as api from '../events'

beforeEach(() => {
    fetchApi.mockReset()
    fetchApi.mockResolvedValue({ success: true, data: { ok: 1 } })
})

describe('eventListQuery', () => {
    it('is empty for the defaults', () => {
        expect(api.eventListQuery({})).toBe('')
        expect(api.eventListQuery({ scope: 'upcoming', page: 1, category: '', q: '  ' })).toBe('')
    })
    it('writes only what is set', () => {
        const qs = api.eventListQuery({ scope: 'past', category: 'ctf', format: 'online', q: ' web ', page: 3, limit: 12, featured: true })
        const p = new URLSearchParams(qs)
        expect(Object.fromEntries(p)).toEqual({ scope: 'past', category: 'ctf', format: 'online', q: 'web', page: '3', limit: '12', featured: 'true' })
    })
    it('passes date ranges and the staff status', () => {
        const p = new URLSearchParams(api.eventListQuery({ scope: 'all', from: '2026-12-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z', status: 'pending', sort: 'createdAt' }))
        expect(p.get('scope')).toBe('all')
        expect(p.get('from')).toBe('2026-12-01T00:00:00.000Z')
        expect(p.get('status')).toBe('pending')
        expect(p.get('sort')).toBe('createdAt')
    })
})

describe('reads', () => {
    it('lists with the token (the viewer block needs it)', async () => {
        await api.listEvents({ scope: 'past' })
        expect(fetchApi).toHaveBeenCalledWith('/api/events?scope=past')
    })
    it('loads one event by slug or id, encoded', async () => {
        await expect(api.getEvent('winter ctf')).resolves.toEqual({ ok: 1 })
        expect(fetchApi).toHaveBeenCalledWith('/api/events/winter%20ctf')
    })
    it('reads my registrations and submissions', async () => {
        await api.listMyRegistrations({ status: 'waitlisted', scope: 'upcoming', page: 2, limit: 12 })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/my-registrations?status=waitlisted&scope=upcoming&page=2&limit=12')
        await api.listMySubmissions({})
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/mine/submitted')
    })
    it('reads feedback without a login and attendees with one', async () => {
        await api.getEventFeedback('e1', 2, 5)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/feedback?page=2&limit=5', { requireAuth: false })
        await api.listAttendees('e1', { status: 'registered' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/attendees?status=registered&page=1&limit=50')
    })
})

describe('writes', () => {
    it('registers, optionally keeping it off the activity feed', async () => {
        await api.registerForEvent('e1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/register', { method: 'POST' })
        await api.registerForEvent('e1', { shareActivity: false })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/register', { method: 'POST', body: JSON.stringify({ shareActivity: false }) })
    })
    it('leaves, joins and leaves the waiting list', async () => {
        await api.unregisterFromEvent('e1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/register', { method: 'DELETE' })
        await api.joinWaitlist('e1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/waitlist', { method: 'POST' })
        await api.leaveWaitlist('e1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/waitlist', { method: 'DELETE' })
    })
    it('sets and clears a reminder', async () => {
        await api.setReminder('e1', 60)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/remind', { method: 'POST', body: JSON.stringify({ offsetMinutes: 60 }) })
        await api.setReminder('e1', null)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/remind', { method: 'DELETE' })
    })
    it('sends feedback, trimming an empty comment away', async () => {
        await api.submitEventFeedback('e1', { rating: 5, comment: '  ' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/feedback', { method: 'POST', body: JSON.stringify({ rating: 5 }) })
    })
    it('creates, updates and deletes', async () => {
        await api.createEvent({ title: 'x' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events', { method: 'POST', body: JSON.stringify({ title: 'x' }) })
        await api.updateEvent('e1', { title: 'y' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1', { method: 'PUT', body: JSON.stringify({ title: 'y' }) })
        await api.deleteEvent('e1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1', { method: 'DELETE' })
    })
    it('reviews, cancels and marks attendance', async () => {
        await api.approveEvent('e1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/approve', { method: 'POST' })
        await api.rejectEvent('e1', 'Too vague')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/reject', { method: 'POST', body: JSON.stringify({ reason: 'Too vague' }) })
        await api.cancelEvent('e1', 'Speaker ill')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/cancel', { method: 'POST', body: JSON.stringify({ reason: 'Speaker ill' }) })
        await api.markAttendance('e1', ['u1', 'u2'])
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/e1/attendance', { method: 'POST', body: JSON.stringify({ userIds: ['u1', 'u2'] }) })
    })
})

describe('calendar and archive', () => {
    it('reads the calendar without a token and keeps the meta', async () => {
        fetchApi.mockResolvedValue({ success: true, data: [{ id: 'a' }], meta: { from: 'f', to: 't', count: 1, truncated: true } })
        const result = await api.getCalendar({ from: '2026-11-30T00:00:00.000Z', to: '2027-01-10T23:59:59.999Z', category: 'ctf' })
        expect(result.items).toEqual([{ id: 'a' }])
        expect(result.meta.truncated).toBe(true)
        const [url, options] = fetchApi.mock.calls[0]
        const params = new URL(`https://x${url}`).searchParams
        expect(url).toMatch(/^\/api\/events\/calendar\?/)
        expect(Object.fromEntries(params)).toEqual({ from: '2026-11-30T00:00:00.000Z', to: '2027-01-10T23:59:59.999Z', category: 'ctf' })
        expect(options).toEqual({ requireAuth: false })
    })

    it('builds plain links for the calendar files from the API address', () => {
        const url = api.calendarIcsUrl({ from: '2026-12-01', to: '2026-12-31', category: '' })
        expect(url).toBe('https://api.example.test/api/events/calendar.ics?from=2026-12-01&to=2026-12-31')
        expect(api.webcalUrl(url)).toBe('webcal://api.example.test/api/events/calendar.ics?from=2026-12-01&to=2026-12-31')
        expect(api.eventIcsUrl('winter ctf')).toBe('https://api.example.test/api/events/winter%20ctf/ics')
    })

    it('asks the archive for a page with the filters that are set', async () => {
        await api.listArchives({ category: 'workshop', from: '2026-01-01', q: ' web ', page: 2, limit: 12 })
        const [url, options] = fetchApi.mock.calls[0]
        expect(Object.fromEntries(new URL(`https://x${url}`).searchParams)).toEqual({ category: 'workshop', from: '2026-01-01', q: 'web', page: '2', limit: '12' })
        expect(options).toEqual({ requireAuth: false })
        await api.listArchives({})
        expect(fetchApi.mock.calls[1][0]).toBe('/api/events/archives')
    })
})

describe('calendar feed token', () => {
    it('creates with POST and returns the answer', async () => {
        fetchApi.mockResolvedValue({ success: true, data: { url: 'https://api/x?token=t', webcalUrl: 'webcal://api/x?token=t', createdAt: 'now', rotated: false } })
        await expect(api.createCalendarToken()).resolves.toMatchObject({ rotated: false })
        expect(fetchApi).toHaveBeenCalledWith('/api/events/me/calendar-token', { method: 'POST' })
    })
    it('reads the status and revokes', async () => {
        fetchApi.mockResolvedValue({ success: true, data: { active: true, createdAt: 'c', rotatedAt: null, lastUsedAt: null } })
        await expect(api.getCalendarTokenStatus()).resolves.toMatchObject({ active: true })
        await api.revokeCalendarToken()
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/me/calendar-token', { method: 'DELETE' })
    })
})

describe('series', () => {
    it('uses the series routes', async () => {
        await api.getSeries('64b000000000000000000009', 5)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/series/64b000000000000000000009?limit=5')
        await api.createSeries({ title: 'x' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/series', { method: 'POST', body: JSON.stringify({ title: 'x' }) })
        await api.patchSeries('s1', { scope: 'future', startTime: '20:00' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/series/s1', { method: 'PATCH', body: JSON.stringify({ scope: 'future', startTime: '20:00' }) })
        await api.pauseSeries('s1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/series/s1/pause', { method: 'POST' })
        await api.resumeSeries('s1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/series/s1/resume', { method: 'POST' })
        await api.endSeries('s1', 'Done for now')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/events/series/s1/end', { method: 'POST', body: JSON.stringify({ reason: 'Done for now' }) })
    })
})

describe('attendee export and undo', () => {
    const csv = (rows: number) => `\uFEFF"name","username","status","registeredAt","attended"\r\n${Array.from({ length: rows }, (_, i) => `"Ada ${i}","ada${i}","registered","2026-11-01","no"`).join('\r\n')}\r\n`
    const response = (body: string, truncated: string | null) => ({
        blob: async () => new Blob([body], { type: 'text/csv' }),
        headers: { get: (name: string) => (name === 'X-Export-Truncated' ? truncated : null) },
    })

    it('fetches the file with the token (raw response) and never builds a link with it', async () => {
        fetchApi.mockResolvedValue(response(csv(3), 'false'))
        const file = await api.exportAttendees('64b000000000000000000001', 'Winter CTF Night!')
        expect(fetchApi).toHaveBeenCalledWith('/api/events/64b000000000000000000001/attendees.csv', { raw: true, headers: { Accept: 'text/csv' } })
        expect(file).toMatchObject({ filename: 'winter-ctf-night-attendees.csv', rows: 3, truncated: false })
        expect(file.blob.type).toBe('text/csv')
    })

    it('reports a truncated export from the header', async () => {
        fetchApi.mockResolvedValue(response(csv(2), 'true'))
        expect((await api.exportAttendees('id', 'slug')).truncated).toBe(true)
    })

    it('treats a full file as truncated when the browser cannot read the header', async () => {
        fetchApi.mockResolvedValue(response(csv(api.EXPORT_ROW_LIMIT), null))
        expect((await api.exportAttendees('id', 'slug')).truncated).toBe(true)
        fetchApi.mockResolvedValue(response(csv(10), null))
        expect((await api.exportAttendees('id', 'slug')).truncated).toBe(false)
    })

    it('makes a safe file name', () => {
        expect(api.exportFilename('../../Etc Passwd')).toBe('etc-passwd-attendees.csv')
        expect(api.exportFilename('')).toBe('event-attendees.csv')
    })

    it('posts the ids to undo', async () => {
        fetchApi.mockResolvedValue({ success: true, data: { undone: ['u1'], notAttended: [], notRegistered: [], pointsReversed: 10 } })
        await expect(api.undoAttendance('e1', ['u1'])).resolves.toMatchObject({ pointsReversed: 10 })
        expect(fetchApi).toHaveBeenCalledWith('/api/events/e1/attendance/undo', { method: 'POST', body: JSON.stringify({ userIds: ['u1'] }) })
    })
})
