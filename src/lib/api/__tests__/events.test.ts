import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ fetchApi }))

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
