import { describe, it, expect } from 'vitest'
import { formatPercent, percentOf, totalWeeks } from '../activationFunnel'

describe('percentOf', () => {
    it('rounds to a whole percent of sign-ups', () => {
        expect(percentOf(1, 3)).toBe(33)
        expect(percentOf(2, 3)).toBe(67)
        expect(percentOf(3, 3)).toBe(100)
    })
    it('is null without sign-ups', () => {
        expect(percentOf(0, 0)).toBeNull()
        expect(formatPercent(5, 0)).toBe('-')
        expect(formatPercent(1, 4)).toBe('25%')
    })
})

describe('totalWeeks', () => {
    it('adds every step up', () => {
        const w = (n: number) => ({ week: `w${n}`, signups: n, verified: n, onboarded: 1, skipped: 0, firstSolve: 0, firstPost: 0, firstComment: 0, firstForum: 0, firstFollow: 0, returnedD7: 2, returnedD30: 0 })
        const total = totalWeeks([w(10), w(5)])
        expect(total).toMatchObject({ signups: 15, verified: 15, onboarded: 2, returnedD7: 4 })
        expect(totalWeeks([]).signups).toBe(0)
    })
})
