import { describe, it, expect } from 'vitest'
import { apiFilters, effectiveQuery, filtersFromParams, hasActiveFilters, isDefaultList, paramsWithChanges } from '../filters'

const parse = (qs: string) => filtersFromParams(new URLSearchParams(qs))

describe('filters in the address', () => {
    it('reads valid values and drops the rest', () => {
        expect(parse('category=osint&difficulty=hard&status=completed&sort=points&q=sql')).toEqual({
            category: 'osint', difficulty: 'hard', status: 'completed', q: 'sql', sort: 'points', tab: 'labs',
        })
        expect(parse('category=nope&difficulty=insane&status=x&sort=random')).toMatchObject({ category: '', difficulty: '', status: '', sort: 'newest' })
        expect(parse('tab=leaderboard').tab).toBe('leaderboard')
        expect(parse('tab=other').tab).toBe('labs')
    })

    it('sends a search only from two characters on', () => {
        expect(effectiveQuery('a')).toBe('')
        expect(effectiveQuery('  a ')).toBe('')
        expect(effectiveQuery(' sql   injection ')).toBe('sql injection')
        expect(apiFilters(parse('q=a'), false).q).toBe('')
    })

    it('sends the member status only when signed in', () => {
        expect(apiFilters(parse('status=completed'), false).status).toBe('')
        expect(apiFilters(parse('status=completed'), true).status).toBe('completed')
    })

    it('knows the plain list from a narrowed one', () => {
        expect(isDefaultList(parse(''), false)).toBe(true)
        expect(isDefaultList(parse('status=completed'), false)).toBe(true)
        expect(isDefaultList(parse('status=completed'), true)).toBe(false)
        expect(isDefaultList(parse('sort=points'), false)).toBe(false)
        expect(isDefaultList(parse('q=sql'), false)).toBe(false)
        expect(hasActiveFilters(parse('q=a'), false)).toBe(true)
    })

    it('builds the next query and leaves out empty values and defaults', () => {
        const current = new URLSearchParams('category=osint&sort=points')
        expect(paramsWithChanges(current, { difficulty: 'easy' })).toBe('category=osint&sort=points&difficulty=easy')
        expect(paramsWithChanges(current, { category: null })).toBe('sort=points')
        expect(paramsWithChanges(current, { sort: 'newest' })).toBe('category=osint')
        expect(paramsWithChanges(current, { q: '' })).toBe('category=osint&sort=points')
        expect(paramsWithChanges(new URLSearchParams('tab=leaderboard'), { tab: 'labs' })).toBe('')
    })
})
