import { describe, expect, it } from 'vitest'
import { CR_CATEGORIES, CR_FINDING_TYPES } from '@/types/codeReview'
import { CR_RULES, categoryLabel, findingTypeLabel, markLimits } from '../constants'

describe('the limits of an attempt', () => {
    it('is the findings plus two marks, over at most 40% of the lines and never fewer than 6', () => {
        expect(markLimits(2, 7)).toEqual({ maxMarks: 4, maxLines: 6 })
        expect(markLimits(1, 100)).toEqual({ maxMarks: 3, maxLines: 40 })
        expect(markLimits(5, 30)).toEqual({ maxMarks: 7, maxLines: 12 })
        expect(markLimits(3, 14)).toEqual({ maxMarks: 5, maxLines: 6 })
    })

    it('never allows more lines than the code has, nor more than the 50 marks of the API', () => {
        expect(markLimits(2, 3)).toEqual({ maxMarks: 4, maxLines: 3 })
        expect(markLimits(60, 500).maxMarks).toBe(50)
        expect(markLimits(0, 0)).toEqual({ maxMarks: 2, maxLines: 1 })
    })

    it('rounds the share of the lines down, like the API', () => {
        expect(markLimits(1, 29).maxLines).toBe(11)
        expect(markLimits(1, 30).maxLines).toBe(12)
    })
})

describe('the rules in words', () => {
    it('decays 25% for every earlier graded attempt, up to 75%', () => {
        expect(CR_RULES.attemptDecayPercent).toBe(25)
        expect(CR_RULES.attemptDecayMaxPercent).toBe(75)
    })
})

describe('categories and finding types are two lists', () => {
    it('has six broad categories and fifteen finding types, each with a name', () => {
        expect(CR_CATEGORIES).toEqual(['injection', 'web', 'access-control', 'crypto', 'server-side', 'other'])
        expect(CR_FINDING_TYPES).toHaveLength(15)
        for (const c of CR_CATEGORIES) expect(categoryLabel(c)).not.toMatch(/-/)
        for (const t of CR_FINDING_TYPES) expect(findingTypeLabel(t)).toBeTruthy()
        expect(findingTypeLabel('sqli')).toBe('SQL injection')
        expect(categoryLabel('server-side')).toBe('Server side')
    })

    it('has no finding type that is a category name only, and the names that are in both mean the same', () => {
        expect(CR_FINDING_TYPES).not.toContain('server-side')
        expect(CR_FINDING_TYPES).not.toContain('access-control')
        expect(CR_FINDING_TYPES).not.toContain('web')
        for (const shared of ['injection', 'crypto', 'other']) {
            expect(CR_CATEGORIES).toContain(shared)
            expect(CR_FINDING_TYPES).toContain(shared)
        }
    })
})
