import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPublicLab, isLabSlug } from '../server'

describe('isLabSlug (what may be read)', () => {
    it('accepts any reference the API reads: short, doubled or trailing hyphens, a 24 character id', () => {
        for (const ok of ['ab', 'a', 'web--101', 'intro-', '-lead', 'sql-injection-basics', 'SQL-Injection', '507f1f77bcf86cd799439011', 'a'.repeat(80)]) {
            expect(isLabSlug(ok), ok).toBe(true)
        }
    })

    it('rejects what can never be a lab: other characters, too long, empty, and names of fixed routes', () => {
        for (const bad of ['', 'a'.repeat(81), 'has space', 'under_score', 'dot.dot', '../etc', 'a/b', 'caf%C3%A9', 'progress', 'Stats', 'categories', 'leaderboard', 'manage']) {
            expect(isLabSlug(bad), bad).toBe(false)
        }
    })
})

describe('fetchPublicLab', () => {
    afterEach(() => vi.unstubAllGlobals())

    it.each(['ab', 'web--101', 'intro-', '507f1f77bcf86cd799439011'])('asks the API for %s instead of answering invalid', async (ref) => {
        const fetchMock = vi.fn().mockResolvedValue({ status: 404, ok: false })
        vi.stubGlobal('fetch', fetchMock)
        const result = await fetchPublicLab(ref)
        expect(result.state).toBe('missing')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(String(fetchMock.mock.calls[0][0])).toContain(`/api/labs/${ref}`)
    })

    it('is invalid, without a request, for a segment that cannot be a lab', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        expect((await fetchPublicLab('has space')).state).toBe('invalid')
        expect((await fetchPublicLab('stats')).state).toBe('invalid')
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
