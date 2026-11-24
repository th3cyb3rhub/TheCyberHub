import { describe, expect, it } from 'vitest'
import { decayPercent, participantsText, placeLabel, pointsFor, pointsView, prizeSummary } from '../display'
import { DECAY_TABLE } from '../constants'

describe('dynamic points', () => {
    it('follow the decay table by solves before', () => {
        const expected: [number, number][] = [[0, 100], [1, 90], [2, 90], [3, 80], [5, 80], [6, 70], [10, 70], [11, 60], [20, 60], [21, 50], [40, 50], [41, 40], [80, 40], [81, 30], [150, 30], [151, 25], [999, 25]]
        for (const [solves, percent] of expected) expect(decayPercent(solves), `${solves} solves`).toBe(percent)
        expect(DECAY_TABLE).toHaveLength(9)
    })

    it('round, never below 1 and never below a quarter of the base points', () => {
        expect(pointsFor(100, 'dynamic', 0)).toBe(100)
        expect(pointsFor(100, 'dynamic', 4)).toBe(80)
        expect(pointsFor(250, 'dynamic', 1)).toBe(225)
        expect(pointsFor(3, 'dynamic', 500)).toBe(1)
        expect(pointsFor(10, 'dynamic', 500)).toBe(3)
        expect(pointsFor(100, 'static', 500)).toBe(100)
    })
})

describe('pointsView', () => {
    it('shows the base next to the current value only when a dynamic challenge fell below it', () => {
        expect(pointsView({ basePoints: 100, currentPoints: 80 }, 'dynamic')).toEqual({ now: '80 pts', base: 'of 100', decayed: true })
        expect(pointsView({ basePoints: 100, currentPoints: 100 }, 'dynamic')).toEqual({ now: '100 pts', base: null, decayed: false })
        expect(pointsView({ basePoints: 100, currentPoints: 100 }, 'static').base).toBeNull()
        // A static competition never shows a "decayed" value even if the API sent a lower number
        expect(pointsView({ basePoints: 100, currentPoints: 60 }, 'static').decayed).toBe(false)
    })
})

describe('summaries', () => {
    it('names places and the first prize, then how many more', () => {
        expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(placeLabel)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
        expect(prizeSummary({ prizes: [{ place: 2, reward: 'Mug' }, { place: 1, reward: 'Key' }], prizesNote: null })).toBe('1st: Key and 1 more')
        expect(prizeSummary({ prizes: [], prizesNote: 'Swag for everyone' })).toBe('Swag for everyone')
        expect(prizeSummary({ prizes: [], prizesNote: ' ' })).toBeNull()
    })

    it('counts players with and without a cap', () => {
        expect(participantsText({ participantCount: 1, maxParticipants: 0, teamsEnabled: false })).toBe('1 player')
        expect(participantsText({ participantCount: 12, maxParticipants: 0, teamsEnabled: false })).toBe('12 players')
        expect(participantsText({ participantCount: 12, maxParticipants: 50, teamsEnabled: false })).toBe('12 of 50 players')
    })
})
