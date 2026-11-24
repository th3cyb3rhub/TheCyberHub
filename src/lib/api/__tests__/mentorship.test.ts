import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchApi = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<typeof import('@/lib/api')>()), fetchApi }))

import { ApiError } from '@/lib/api'
import * as api from '../mentorship'

const body = (call = 0) => JSON.parse(fetchApi.mock.calls[call][1].body)

beforeEach(() => {
    fetchApi.mockReset()
    fetchApi.mockResolvedValue({ success: true, data: { ok: 1 } })
})

describe('directory', () => {
    it('is empty for the defaults and writes only what is set', () => {
        expect(api.mentorListQuery({})).toBe('')
        const p = new URLSearchParams(api.mentorListQuery({ expertise: ['web-security', 'osint'], minRating: 4, hasCapacity: false, sort: 'rating', search: ' bug ', page: 2, limit: 12 }))
        expect(Object.fromEntries(p)).toEqual({ expertise: 'web-security,osint', minRating: '4', hasCapacity: 'false', sort: 'rating', search: 'bug', page: '2', limit: '12' })
    })
    it('does not send what the API would refuse or already assumes', () => {
        const p = new URLSearchParams(api.mentorListQuery({ search: 'a', minRating: 0, sort: 'relevance', hasCapacity: true, page: 1 }))
        expect(Array.from(p.keys())).toEqual([])
    })
    it('calls the directory, one mentor, reviews and featured', async () => {
        await api.listMentors({ sort: 'experience' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentors?sort=experience')
        await api.getMentor('abc')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentors/abc')
        await api.listMentorReviews('abc', 2, 5)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentors/abc/reviews?page=2&limit=5')
        await api.listFeaturedMentors(3)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentors/featured?limit=3')
    })
})

describe('my mentor profile', () => {
    it('is null when there is no profile', async () => {
        fetchApi.mockRejectedValueOnce(new ApiError('none', 404))
        await expect(api.getMyMentorProfile()).resolves.toBeNull()
    })
    it('raises every other failure', async () => {
        fetchApi.mockRejectedValueOnce(new ApiError('down', 500))
        await expect(api.getMyMentorProfile()).rejects.toThrow('down')
    })
    it('registers, updates, pauses and resumes', async () => {
        const input = { expertiseAreas: ['osint' as const], bio: 'x'.repeat(60), availability: { hoursPerWeek: 2, timezone: 'UTC', preferredTimes: [] }, maxMentees: 3, conductAccepted: true as const }
        await api.registerMentor(input)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentors/register', { method: 'POST', body: JSON.stringify(input) })
        await api.updateMyMentorProfile({ maxMentees: 2 })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentors/me', { method: 'PATCH', body: JSON.stringify({ maxMentees: 2 }) })
        await api.pauseMentorProfile()
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/mentors/me/pause')
        await api.resumeMentorProfile()
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/mentors/me/resume')
        await api.getEligibility()
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/mentors/eligibility')
    })
})

describe('requests', () => {
    it('creates with the conduct flag and the optional mentor', async () => {
        await api.createRequest({ expertiseAreas: ['osint'], goals: 'g', skillLevel: 'beginner', mentorId: 'm1', conductAccepted: true })
        expect(fetchApi.mock.calls[0][0]).toBe('/api/mentorship-requests')
        expect(body()).toEqual({ expertiseAreas: ['osint'], goals: 'g', skillLevel: 'beginner', mentorId: 'm1', conductAccepted: true })
    })
    it('lists, cancels, renews and invites on the right paths', async () => {
        await api.listMyRequests({ page: 2, limit: 20 })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentorship-requests/me?page=2&limit=20')
        await api.cancelRequest('r1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentorship-requests/r1', { method: 'DELETE' })
        await api.renewRequest('r1')
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/mentorship-requests/r1/renew')
        await api.inviteMentor('r1', 'm9')
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/mentorship-requests/r1/select/m9')
    })
    it('answers incoming requests', async () => {
        await api.listIncomingRequests({ status: 'pending' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentors/me/requests?status=pending')
        await api.acceptRequest('r1')
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/mentors/me/requests/r1/accept')
        await api.declineRequest('r1', '  not now ')
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/mentors/me/requests/r1/decline')
        expect(body(fetchApi.mock.calls.length - 1)).toEqual({ reason: 'not now' })
    })
})

describe('mentorships', () => {
    it('lists with role and status and reads the summary', async () => {
        await api.listMentorships({ role: 'mentee', status: 'all' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentorships?role=mentee&status=all')
        await api.getSummary()
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentorships/summary')
    })
    it('pauses with a reason, resumes, extends, completes with feedback', async () => {
        await api.pauseMentorship('m1', ' exams ')
        expect(body()).toEqual({ reason: 'exams' })
        await api.resumeMentorship('m1')
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/mentorships/m1/resume')
        await api.extendMentorship('m1', 2)
        expect(body(fetchApi.mock.calls.length - 1)).toEqual({ months: 2 })
        await api.completeMentorship('m1', { rating: 5, comment: ' great ', shareName: true })
        expect(body(fetchApi.mock.calls.length - 1)).toEqual({ rating: 5, comment: 'great', shareName: true })
        await api.completeMentorship('m1')
        expect(body(fetchApi.mock.calls.length - 1)).toEqual({})
    })
    it('sends a report of a message with the message id, and drops it for other targets', async () => {
        await api.reportMentorship('m1', { target: 'message', reason: 'spam', details: ' ', messageId: 'x1' })
        expect(body()).toEqual({ target: 'message', reason: 'spam', messageId: 'x1' })
        await api.reportMentorship('m1', { target: 'mentor', reason: 'spam', messageId: 'x1' })
        expect(body(1)).toEqual({ target: 'mentor', reason: 'spam' })
    })
    it('submits final feedback', async () => {
        await api.submitFinalFeedback('m1', { rating: 4 })
        expect(fetchApi.mock.calls[0][0]).toBe('/api/mentorships/m1/feedback')
        await api.listMentorshipFeedback('m1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentorships/m1/feedback')
    })
})

describe('chat', () => {
    it('pages back with before and a limit', async () => {
        await api.listMessages('m1', { before: 'abc', limit: 50 })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentorships/m1/messages?before=abc&limit=50')
        await api.listMessages('m1', {})
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentorships/m1/messages')
    })
    it('sends text as it is', async () => {
        await api.sendMessage('m1', { content: 'hi <b>there</b>', contentType: 'text', codeLanguage: 'python' })
        expect(body()).toEqual({ content: 'hi <b>there</b>' , contentType: 'text' })
    })
    it('sends code inside a fence, with the language', async () => {
        await api.sendMessage('m1', { content: '<script>alert(1)</script>', contentType: 'code', codeLanguage: 'html' })
        expect(body()).toEqual({ content: '```html\n<script>alert(1)</script>\n```', contentType: 'code', codeLanguage: 'html' })
    })
    it('posts a file message and marks read', async () => {
        await api.sendFileMessage('m1', { filename: 'a.pdf', url: 'https://x/a.pdf', size: 10, mimeType: 'application/pdf' })
        expect(fetchApi.mock.calls[0][0]).toBe('/api/mentorships/m1/messages/file')
        await api.markMessagesRead('m1')
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/mentorships/m1/messages/read')
    })
    it('uploads to the mentorship folder before sending the address', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { url: 'https://s3/mentorship/u-1.pdf' } }) })
        vi.stubGlobal('fetch', fetchMock)
        const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
        await expect(api.uploadChatFile(file)).resolves.toEqual({ url: 'https://s3/mentorship/u-1.pdf' })
        const [url, init] = fetchMock.mock.calls[0]
        expect(String(url)).toMatch(/\/api\/upload\/media$/)
        expect((init.body as FormData).get('folder')).toBe('mentorship')
        vi.unstubAllGlobals()
    })
    it('raises an upload failure with the API message', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { code: 'ATTACHMENT_TOO_LARGE', message: 'big' } }) }))
        await expect(api.uploadChatFile(new File(['x'], 'a.pdf'))).rejects.toMatchObject({ status: 400, code: 'ATTACHMENT_TOO_LARGE' })
        vi.unstubAllGlobals()
    })
})

describe('sessions', () => {
    it('lists, schedules and moves', async () => {
        await api.listSessions('m1', { scope: 'upcoming', limit: 50 })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentorships/m1/sessions?scope=upcoming&limit=50')
        await api.listSessions('m1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/mentorships/m1/sessions')
        await api.createSession('m1', { title: ' First call ', scheduledAt: '2026-12-07T09:00:00.000Z', timezone: 'Asia/Kolkata', duration: 60, meetingUrl: '', description: '' })
        expect(body(fetchApi.mock.calls.length - 1)).toMatchObject({ title: 'First call', scheduledAt: '2026-12-07T09:00:00.000Z', timezone: 'Asia/Kolkata', duration: 60 })
        await api.updateSession('s1', { duration: 30 })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/sessions/s1', expect.objectContaining({ method: 'PATCH' }))
    })
    it('cancels with a reason, completes, saves notes and rates', async () => {
        await api.cancelSession('s1', ' sick ')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/sessions/s1', { method: 'DELETE', body: JSON.stringify({ reason: 'sick' }) })
        await api.completeSession('s1')
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/sessions/s1/complete')
        await api.saveSessionNotes('s1', ' hi ')
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/sessions/s1/notes')
        await api.submitSessionFeedback('s1', { rating: 5 })
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/sessions/s1/feedback')
    })
    it('reads upcoming and pending feedback from the sessions family', async () => {
        await api.listUpcomingSessions(5)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/sessions/upcoming?limit=5')
        await api.listPendingFeedback(20)
        expect(fetchApi).toHaveBeenLastCalledWith('/api/sessions/feedback/pending?limit=20')
    })
})

describe('staff', () => {
    it('lists applications and reviews with a note', async () => {
        await api.listMentorApplications({ status: 'pending', page: 2, limit: 20 })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/admin/mentors?status=pending&page=2&limit=20')
        await api.reviewMentor('a1', { decision: 'suspend', note: ' misuse ', endMentorships: true })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/admin/mentors/a1/review', { method: 'PATCH', body: JSON.stringify({ decision: 'suspend', note: 'misuse', endMentorships: true }) })
    })
    it('lists and terminates mentorships and opens a report context', async () => {
        await api.listAdminMentorships({ status: 'open' })
        expect(fetchApi).toHaveBeenLastCalledWith('/api/admin/mentorships?status=open')
        await api.terminateMentorship('m1', ' abuse ')
        expect(fetchApi.mock.calls.at(-1)?.[0]).toBe('/api/admin/mentorships/m1/terminate')
        await api.getReportContext('f1')
        expect(fetchApi).toHaveBeenLastCalledWith('/api/admin/mentorships/reports/f1/context')
    })
    it('reads reported messages from the moderation queue', async () => {
        fetchApi.mockResolvedValueOnce({ data: [{ contentId: 'x', flagIds: ['f1'] }], pagination: { total: 1, totalPages: 1 } })
        const res = await api.listReportedMessages()
        expect(fetchApi).toHaveBeenLastCalledWith('/api/moderation/queue/items?status=pending&contentType=mentorMessage&limit=20')
        expect(res.items[0].flagIds).toEqual(['f1'])
    })
})
