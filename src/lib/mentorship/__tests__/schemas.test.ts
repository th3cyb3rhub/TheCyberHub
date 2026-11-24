import { describe, it, expect } from 'vitest'
import {
    chatFileProblem, feedbackSchema, isHttpsLink, issuesByField, mentorApplicationSchema, mentorshipRequestSchema, messageProblem,
    reasonSchema, reportSchema, sessionFormSchema,
} from '../schemas'

const bio = (n: number) => 'b'.repeat(n)
const application = (over: Record<string, unknown> = {}) => ({
    expertiseAreas: ['web-security'], bio: bio(60), hoursPerWeek: 3, timezone: 'Europe/Berlin', preferredTimes: [], maxMentees: 3, conductAccepted: true, ...over,
})

describe('mentor application schema (API limits)', () => {
    it('accepts a valid application', () => expect(mentorApplicationSchema.safeParse(application()).success).toBe(true))
    it.each([
        ['bio of 49', { bio: bio(49) }, false], ['bio of 50', { bio: bio(50) }, true], ['bio of 1000', { bio: bio(1000) }, true], ['bio of 1001', { bio: bio(1001) }, false],
        ['no areas', { expertiseAreas: [] }, false], ['5 areas', { expertiseAreas: ['osint', 'forensics', 'cryptography', 'pentesting', 'web-security'] }, true],
        ['6 areas', { expertiseAreas: ['osint', 'forensics', 'cryptography', 'pentesting', 'web-security', 'cloud-security'] }, false],
        ['unknown area', { expertiseAreas: ['hacking'] }, false],
        ['0 hours', { hoursPerWeek: 0 }, false], ['20 hours', { hoursPerWeek: 20 }, true], ['21 hours', { hoursPerWeek: 21 }, false], ['1.5 hours', { hoursPerWeek: 1.5 }, false],
        ['0 mentees', { maxMentees: 0 }, false], ['5 mentees', { maxMentees: 5 }, true], ['6 mentees', { maxMentees: 6 }, false],
        ['bad time zone', { timezone: 'Mars/Base' }, false],
        ['22 slots', { preferredTimes: Array.from({ length: 22 }, () => ({ dayOfWeek: 1, startHour: 1, endHour: 2 })) }, false],
        ['slot ending at 24', { preferredTimes: [{ dayOfWeek: 6, startHour: 22, endHour: 24 }] }, true],
        ['slot ending before it starts', { preferredTimes: [{ dayOfWeek: 1, startHour: 10, endHour: 9 }] }, false],
        ['slot on day 7', { preferredTimes: [{ dayOfWeek: 7, startHour: 1, endHour: 2 }] }, false],
        ['conduct not accepted', { conductAccepted: false }, false],
    ])('%s', (_name, over, ok) => expect(mentorApplicationSchema.safeParse(application(over)).success).toBe(ok))

    it('trims the bio before counting', () => expect(mentorApplicationSchema.safeParse(application({ bio: `   ${bio(49)}   ` })).success).toBe(false))
    it('names the conduct problem', () => {
        const r = mentorApplicationSchema.safeParse(application({ conductAccepted: false }))
        expect(!r.success && issuesByField(r.error).conductAccepted).toBe('You must accept the code of conduct')
    })
})

describe('request schema', () => {
    const request = (over: Record<string, unknown> = {}) => ({ expertiseAreas: ['osint'], goals: 'g'.repeat(100), skillLevel: 'beginner', conductAccepted: true, ...over })
    it.each([
        ['goals of 99', { goals: 'g'.repeat(99) }, false], ['goals of 100', {}, true], ['goals of 500', { goals: 'g'.repeat(500) }, true], ['goals of 501', { goals: 'g'.repeat(501) }, false],
        ['no area', { expertiseAreas: [] }, false], ['3 areas', { expertiseAreas: ['osint', 'forensics', 'cryptography'] }, true], ['4 areas', { expertiseAreas: ['osint', 'forensics', 'cryptography', 'pentesting'] }, false],
        ['no level', { skillLevel: undefined }, false], ['expert level', { skillLevel: 'expert' }, false], ['no conduct', { conductAccepted: false }, false],
    ])('%s', (_n, over, ok) => expect(mentorshipRequestSchema.safeParse(request(over)).success).toBe(ok))
})

describe('feedback, report and reason schemas', () => {
    it('needs a rating of 1 to 5 and a comment of 500 at most', () => {
        expect(feedbackSchema.safeParse({ rating: 5, comment: '', shareName: false }).success).toBe(true)
        expect(feedbackSchema.safeParse({ rating: 0, comment: '', shareName: false }).success).toBe(false)
        expect(feedbackSchema.safeParse({ rating: 6, comment: '', shareName: false }).success).toBe(false)
        expect(feedbackSchema.safeParse({ rating: 3, comment: 'c'.repeat(501), shareName: false }).success).toBe(false)
        expect(feedbackSchema.safeParse({ comment: '', shareName: false }).success).toBe(false)
    })
    it('needs a known report reason', () => {
        expect(reportSchema.safeParse({ reason: 'spam', details: '' }).success).toBe(true)
        expect(reportSchema.safeParse({ reason: 'rude', details: '' }).success).toBe(false)
        expect(reportSchema.safeParse({ reason: 'spam', details: 'd'.repeat(501) }).success).toBe(false)
    })
    it('needs a reason of 3 to 500 characters', () => {
        expect(reasonSchema.safeParse('ab').success).toBe(false)
        expect(reasonSchema.safeParse('abc').success).toBe(true)
        expect(reasonSchema.safeParse('a'.repeat(501)).success).toBe(false)
    })
})

describe('session schema', () => {
    const NOW = new Date('2026-12-01T10:00:00Z')
    const session = (over: Record<string, unknown> = {}) => ({ title: 'First call', date: '2026-12-07', time: '10:00', timezone: 'Europe/Berlin', duration: 60, meetingUrl: '', description: '', ...over })
    const ok = (over: Record<string, unknown> = {}) => sessionFormSchema(NOW).safeParse(session(over)).success
    it('accepts a valid session', () => expect(ok()).toBe(true))
    it.each([
        ['title of 2', { title: 'ab' }, false], ['duration 14', { duration: 14 }, false], ['duration 15', { duration: 15 }, true], ['duration 120', { duration: 120 }, true], ['duration 121', { duration: 121 }, false],
        ['http link', { meetingUrl: 'http://meet.example.org/a' }, false], ['https link', { meetingUrl: 'https://meet.example.org/a' }, true],
        ['link with a password', { meetingUrl: 'https://user:pw@meet.example.org/a' }, false], ['javascript link', { meetingUrl: 'javascript:alert(1)' }, false],
        ['link of 301 characters', { meetingUrl: `https://a.org/${'x'.repeat(290)}` }, false], ['agenda of 1001', { description: 'd'.repeat(1001) }, false],
        ['bad zone', { timezone: 'Nope/Zone' }, false],
    ])('%s', (_n, over, expected) => expect(ok(over)).toBe(expected))

    it('refuses a time less than 5 minutes ahead and one more than 90 days ahead', () => {
        expect(ok({ date: '2026-12-01', time: '11:02' })).toBe(false) // 10:02 UTC, 2 minutes ahead
        expect(ok({ date: '2026-12-01', time: '11:06' })).toBe(true)
        expect(ok({ date: '2027-03-02', time: '10:00' })).toBe(false)
        expect(ok({ date: '2027-02-28', time: '10:00' })).toBe(true)
    })
    it('refuses a time a clock change skipped', () => {
        const r = sessionFormSchema(new Date('2026-03-01T00:00:00Z')).safeParse(session({ date: '2026-03-29', time: '02:30' }))
        expect(!r.success && issuesByField(r.error).time).toMatch(/does not exist/)
    })
    it('compares in the chosen zone, not the browser zone', () => {
        // 09:00 in Los Angeles on 1 Dec is 17:00 UTC: ahead of NOW. 01:00 there is 09:00 UTC: already past.
        expect(ok({ date: '2026-12-01', time: '09:00', timezone: 'America/Los_Angeles' })).toBe(true)
        expect(ok({ date: '2026-12-01', time: '01:00', timezone: 'America/Los_Angeles' })).toBe(false)
    })
})

describe('links and chat input', () => {
    it('only https links without credentials', () => {
        expect(isHttpsLink('https://a.org')).toBe(true)
        expect(isHttpsLink('http://a.org')).toBe(false)
        expect(isHttpsLink('https://u:p@a.org')).toBe(false)
        expect(isHttpsLink('not a url')).toBe(false)
    })
    it('checks a chat file against the same type and size limits as the API', () => {
        expect(chatFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeNull()
        expect(chatFileProblem({ name: 'a.png', type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull()
        expect(chatFileProblem({ name: 'a.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
        expect(chatFileProblem({ name: 'a.exe', type: 'application/x-msdownload', size: 10 })).toMatch(/not allowed/)
        expect(chatFileProblem({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toMatch(/not allowed/)
    })
    it('checks a message', () => {
        expect(messageProblem('  ')).toBeTruthy()
        expect(messageProblem('hi')).toBeNull()
        expect(messageProblem('x'.repeat(5001))).toMatch(/5000/)
    })
})
