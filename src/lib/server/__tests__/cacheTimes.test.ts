// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLIC_ITEM_REVALIDATE_SECONDS } from '../cacheTimes'

/**
 * A page that answers 200 from a cached public copy keeps answering 200 after the item is unpublished,
 * until the copy is replaced. The copies of single items stay at or under a minute.
 */
const LIB = join(__dirname, '..', '..')
const AREAS = ['events', 'internships', 'mentorship', 'learning', 'jobs', 'ctf', 'labs', 'codeReview']

describe('how long a public item may be served from the server cache', () => {
    it('is at most a minute', () => {
        expect(PUBLIC_ITEM_REVALIDATE_SECONDS).toBeLessThanOrEqual(60)
        expect(PUBLIC_ITEM_REVALIDATE_SECONDS).toBeGreaterThan(0)
    })

    it.each(AREAS)('the %s server fetches use it for the item they cache', (area) => {
        const source = readFileSync(join(LIB, area, 'server.ts'), 'utf8')
        expect(source).toMatch(/PUBLIC_ITEM_REVALIDATE_SECONDS/)
    })

    it.each(AREAS)('the %s server fetches never cache a single item for more than a minute', (area) => {
        const source = readFileSync(join(LIB, area, 'server.ts'), 'utf8')
        // A longer window is only for lists, the filters and the sitemap: never on a line that fetches `${encodeURIComponent(` an item by its reference
        const itemLines = source.split('\n').filter((l) => /encodeURIComponent\((slug|id|ref)/.test(l) && /fetch\(|get\(/.test(l))
        for (const line of itemLines) expect(line).not.toMatch(/revalidate: (6[1-9]|[7-9]\d|\d{3,})|, (6[1-9]|[7-9]\d|\d{3,})\)/)
    })
})
