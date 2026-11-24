import { describe, expect, it } from 'vitest'
import { hasJobFilters, jobFiltersToSearch, jobsApiQuery, parseJobFilters } from '../query'

describe('job list filters in the address', () => {
    it('reads what the API accepts and drops the rest', () => {
        const f = parseJobFilters({ search: '  soc ', category: 'soc', experienceLevel: 'wizard', locationType: 'remote', salaryMin: '1000', salaryMax: 'abc', sort: 'title', featured: '1' })
        expect(f).toEqual({ search: 'soc', category: 'soc', locationType: 'remote', salaryMin: 1000, featured: true, sortBy: 'title', sortOrder: 'asc' })
    })

    it('still reads the old `experience` name and ignores a repeated value', () => {
        expect(parseJobFilters({ experience: 'senior' }).experienceLevel).toBe('senior')
        expect(parseJobFilters({ category: ['grc', 'soc'] }).category).toBe('grc')
        expect(parseJobFilters(new URLSearchParams('category=appsec&sort=bogus'))).toEqual({ category: 'appsec' })
    })

    it('writes the same names back and nothing for a default', () => {
        const filters = parseJobFilters({ category: 'soc', employmentType: 'contract', sort: 'viewCount' })
        expect(parseJobFilters(jobFiltersToSearch(filters))).toEqual(filters)
        expect(jobFiltersToSearch({}).toString()).toBe('')
        expect(hasJobFilters({})).toBe(false)
        expect(hasJobFilters({ category: 'soc' })).toBe(true)
    })

    it('builds the API query', () => {
        const q = jobsApiQuery({ category: 'soc', page: 2, limit: 20, search: 'a b' })
        expect(q.startsWith('?')).toBe(true)
        expect(q).toContain('category=soc')
        expect(q).toContain('page=2')
        expect(q).toContain('search=a+b')
    })
})
