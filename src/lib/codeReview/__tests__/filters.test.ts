import { describe, expect, it } from 'vitest'
import { apiFilters, effectiveQuery, emptyFilters, filtersFromParams, hasActiveFilters, isDefaultList, paramsWithChanges } from '../filters'

const parse = (q: string) => filtersFromParams(new URLSearchParams(q))

describe('filters in the address', () => {
    it('reads known values and drops everything else', () => {
        expect(parse('category=sqli&difficulty=hard&language=python&status=passed&q=login&sort=easiest')).toEqual({
            category: 'sqli', difficulty: 'hard', language: 'python', status: 'passed', q: 'login', sort: 'easiest',
        })
        expect(parse('difficulty=nope&status=x&sort=zzz&category=SQL%20Injection&language=<script>')).toEqual(emptyFilters())
    })

    it('limits the search text', () => {
        expect(parse(`q=${'a'.repeat(300)}`).q).toHaveLength(100)
    })

    it('builds the address query and leaves out empty values and the default sort', () => {
        const start = new URLSearchParams('category=sqli&sort=title')
        expect(paramsWithChanges(start, { difficulty: 'easy' })).toBe('category=sqli&sort=title&difficulty=easy')
        expect(paramsWithChanges(start, { category: null, sort: 'newest' })).toBe('')
        expect(paramsWithChanges(start, { q: '' })).toBe('category=sqli&sort=title')
    })
})

describe('filters sent to the API', () => {
    it('sends the sort as the API names it, and nothing for an empty filter', () => {
        expect(apiFilters(emptyFilters(), false)).toEqual({ category: undefined, difficulty: undefined, language: undefined, status: '', search: undefined, sortBy: 'createdAt', sortOrder: 'desc' })
        const f = apiFilters({ ...emptyFilters(), sort: 'hardest', category: 'xss', q: ' login  form ' }, false)
        expect(f).toMatchObject({ sortBy: 'difficulty', sortOrder: 'desc', category: 'xss', search: 'login form' })
    })

    it('sends the status only when signed in: it is the member\'s own state', () => {
        const url = { ...emptyFilters(), status: 'passed' as const }
        expect(apiFilters(url, false).status).toBe('')
        expect(apiFilters(url, true).status).toBe('passed')
        expect(isDefaultList(url, false)).toBe(true)
        expect(isDefaultList(url, true)).toBe(false)
    })

    it('does not send a one letter search', () => {
        expect(effectiveQuery('a')).toBe('')
        expect(effectiveQuery('  ab ')).toBe('ab')
        expect(isDefaultList({ ...emptyFilters(), q: 'a' }, false)).toBe(true)
        expect(hasActiveFilters({ ...emptyFilters(), q: 'a' }, false)).toBe(true)
    })

    it('knows the plain list the server renders', () => {
        expect(isDefaultList(emptyFilters(), true)).toBe(true)
        expect(isDefaultList({ ...emptyFilters(), sort: 'title' }, false)).toBe(false)
        expect(hasActiveFilters(emptyFilters(), true)).toBe(false)
    })
})
