import { describe, expect, it } from 'vitest'
import { companySchema, jobCardSchema, jobDetailSchema, paginationSchema } from '../schemas'
import { card, company, job } from './fixtures'

describe('server answers', () => {
    it('accepts a card and a detail and keeps keys it does not know', () => {
        expect(jobCardSchema.safeParse({ ...card(), futureField: 1 }).success).toBe(true)
        const parsed = jobDetailSchema.safeParse({ ...job(), futureField: 1 })
        expect(parsed.success).toBe(true)
        expect((parsed.data as Record<string, unknown>).futureField).toBe(1)
    })

    it('fills the lists a sparse answer leaves out', () => {
        const parsed = jobDetailSchema.parse({ _id: 'j', slug: 's', title: 'T' })
        expect(parsed.skills).toEqual([])
        expect(parsed.requirements).toEqual([])
        expect(parsed.description).toBe('')
    })

    it('refuses an answer without the fields a page cannot render without', () => {
        expect(jobCardSchema.safeParse({ title: 'x' }).success).toBe(false)
        expect(jobCardSchema.safeParse({ _id: 'j', slug: '', title: 'x' }).success).toBe(false)
        expect(companySchema.safeParse({ name: 'x' }).success).toBe(false)
        expect(companySchema.safeParse(company()).success).toBe(true)
        expect(paginationSchema.safeParse({ page: 1 }).success).toBe(false)
    })
})
