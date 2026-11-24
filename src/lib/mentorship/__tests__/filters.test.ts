import { describe, it, expect } from 'vitest'
import { filtersFromParams, filtersToParams, hasActiveFilters } from '../filters'
import { expertiseLabel, displayName, initials, requestBlockReason, safeMeetingUrl, spotsLabel, ratingLabel, formatBytes, daysLeftLabel } from '../display'

const p = (qs: string) => new URLSearchParams(qs)

describe('directory filters in the URL', () => {
    it('reads known values and ignores the rest', () => {
        expect(filtersFromParams(p('expertise=osint,hacking,osint&minRating=4&hasCapacity=false&sort=rating&search=%20bug%20'))).toEqual({
            expertise: ['osint'], minRating: 4, hasCapacity: false, sort: 'rating', search: 'bug',
        })
        expect(filtersFromParams(p('minRating=9&sort=oldest&hasCapacity=true'))).toEqual({})
    })
    it('writes only what differs from the defaults and round-trips', () => {
        expect(filtersToParams({})).toBe('')
        const filters = { expertise: ['web-security', 'osint'] as never, minRating: 4.5, hasCapacity: false as const, sort: 'experience' as const, search: 'xss' }
        expect(filtersFromParams(p(filtersToParams(filters)))).toEqual(filters)
    })
    it('knows when a filter is on', () => {
        expect(hasActiveFilters({})).toBe(false)
        expect(hasActiveFilters({ sort: 'relevance' })).toBe(false)
        expect(hasActiveFilters({ hasCapacity: false })).toBe(true)
    })
})

describe('display helpers', () => {
    it('never fails on a person without a name or an avatar', () => {
        expect(displayName({ username: 'ada' })).toBe('ada')
        expect(displayName({ name: ' Ada L ', username: 'ada' })).toBe('Ada L')
        expect(displayName(null)).toBe('Member')
        expect(displayName({ username: null })).toBe('Member')
        expect(initials({ name: 'Ada Lovelace' })).toBe('AL')
        expect(initials({ username: 'ada' })).toBe('AD')
    })
    it('labels capacity and rating', () => {
        expect(spotsLabel({ spotsLeft: 1, hasCapacity: true })).toBe('1 spot open')
        expect(spotsLabel({ spotsLeft: 3, hasCapacity: true })).toBe('3 spots open')
        expect(spotsLabel({ spotsLeft: 0, hasCapacity: false })).toBe('Full')
        expect(ratingLabel({ rating: 0, totalRatings: 0 })).toBe('New')
        expect(ratingLabel({ rating: 4.56, totalRatings: 3 })).toBe('4.6 (3)')
        expect(expertiseLabel('ctf-training')).toBe('CTF training')
        expect(expertiseLabel('new-thing')).toBe('new-thing')
    })
    it('explains why a mentor cannot be requested', () => {
        const mentor = { isPaused: false, hasCapacity: true, user: { _id: 'm' } }
        expect(requestBlockReason(mentor, 'me', false)).toBeNull()
        expect(requestBlockReason(mentor, 'm', false)).toMatch(/own profile/)
        expect(requestBlockReason({ ...mentor, isPaused: true }, 'me', false)).toMatch(/not taking/)
        expect(requestBlockReason({ ...mentor, hasCapacity: false }, 'me', false)).toMatch(/no free spot/)
        expect(requestBlockReason(mentor, 'me', true)).toMatch(/open request/)
        expect(requestBlockReason({ ...mentor, status: 'pending' as const }, 'me', false)).toMatch(/not listed/)
    })
    it('only shows https meeting links', () => {
        expect(safeMeetingUrl('https://meet.example.org/a')).toBe('https://meet.example.org/a')
        expect(safeMeetingUrl('http://meet.example.org/a')).toBeNull()
        expect(safeMeetingUrl('javascript:alert(1)')).toBeNull()
        expect(safeMeetingUrl(null)).toBeNull()
    })
    it('formats sizes and days', () => {
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(2048)).toBe('2 KB')
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
        const now = new Date('2026-12-01T10:00:00Z')
        expect(daysLeftLabel('2026-12-04T10:00:00Z', now)).toBe('3 days left')
        expect(daysLeftLabel('2026-12-02T09:00:00Z', now)).toBe('1 day left')
        expect(daysLeftLabel('2026-11-30T10:00:00Z', now)).toBe('expired')
    })
})
