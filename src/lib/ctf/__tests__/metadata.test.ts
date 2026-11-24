import { describe, expect, it } from 'vitest'
import { competitionMetadata, isUnlisted, resultsMetadata } from '../metadata'
import { ctfDetailSchema, ctfResultsSchema } from '../schemas'
import { makeCompetition, makeResults } from './fixtures'

describe('competition page metadata', () => {
    it('gives a listed competition a canonical address and a social preview', () => {
        const meta = competitionMetadata(makeCompetition({ isPublic: true }))
        expect(meta.alternates?.canonical).toMatch(/\/ctf\/competitions\/.+/)
        expect(meta.openGraph).toBeTruthy()
        expect(meta.robots).toBeUndefined()
    })

    it('treats a competition without the flag as listed (older API builds)', () => {
        const meta = competitionMetadata(makeCompetition())
        expect(meta.alternates?.canonical).toBeTruthy()
        expect(meta.robots).toBeUndefined()
    })

    it('keeps a link only competition out of search, with no canonical address and no preview url', () => {
        const meta = competitionMetadata(makeCompetition({ isPublic: false, title: 'Private Cup' }))
        expect(meta.robots).toEqual({ index: false, follow: false })
        expect(meta.alternates).toBeUndefined()
        expect(meta.openGraph).toBeUndefined()
        expect(meta.title).toBe('Private Cup')
    })

    it('keeps a missing competition (draft, unknown, failing API) out of search', () => {
        expect(competitionMetadata(null).robots).toEqual({ index: false, follow: false })
    })
})

describe('results page metadata', () => {
    it('is indexable for a listed competition', () => {
        const meta = resultsMetadata(makeResults(), false)
        expect(meta.alternates?.canonical).toMatch(/\/results$/)
        expect(meta.robots).toBeUndefined()
    })

    it('is not indexable, and has no canonical address, when the results say the competition is link only', () => {
        const results = makeResults()
        results.competition.isPublic = false
        const meta = resultsMetadata(results, false)
        expect(meta.robots).toEqual({ index: false, follow: false })
        expect(meta.alternates).toBeUndefined()
    })

    it('is not indexable when the detail said so, even if the results did not', () => {
        const meta = resultsMetadata(makeResults(), true)
        expect(meta.robots).toEqual({ index: false, follow: false })
        expect(meta.alternates).toBeUndefined()
    })

    it('has no results to show before the end', () => {
        expect(resultsMetadata(null, false).robots).toEqual({ index: false, follow: true })
    })
})

describe('isUnlisted and the schemas', () => {
    it('is true only for an explicit false', () => {
        expect(isUnlisted({ isPublic: false })).toBe(true)
        expect(isUnlisted({ isPublic: true })).toBe(false)
        expect(isUnlisted({})).toBe(false)
        expect(isUnlisted(null)).toBe(false)
    })

    it('keeps isPublic when the detail and the results carry it, and accepts them without it', () => {
        const detail = { ...makeCompetition(), isPublic: false }
        expect(ctfDetailSchema.parse(detail).isPublic).toBe(false)
        expect(ctfDetailSchema.parse(makeCompetition()).isPublic).toBeUndefined()
        const results = makeResults()
        expect(ctfResultsSchema.parse({ ...results, competition: { ...results.competition, isPublic: false } }).competition.isPublic).toBe(false)
        expect(ctfResultsSchema.parse(results).competition.isPublic).toBeUndefined()
    })
})
