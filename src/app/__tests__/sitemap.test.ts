import { describe, it, expect, vi, beforeEach } from 'vitest'

const rows = vi.hoisted(() => ({ fetchSitemapRows: vi.fn() }))
vi.mock('@/lib/learning/server', () => rows)
vi.mock('@/lib/mentorship/server', () => ({ fetchMentorIdsForSitemap: vi.fn().mockResolvedValue([]) }))

import sitemap from '../sitemap'

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    rows.fetchSitemapRows.mockImplementation(async (path: string) => {
        if (path.includes('kind=roadmap')) return [{ slug: 'web-hacking', updatedAt: '2026-11-01T00:00:00Z' }]
        if (path.includes('kind=path')) return [{ slug: 'linux-basics' }]
        return [{ slug: 'owasp-top-10' }]
    })
})

describe('sitemap', () => {
    it('lists published roadmaps, paths and resources', async () => {
        const urls = (await sitemap()).map((e) => e.url)
        expect(urls).toContain('https://thecyberhub.org/roadmaps')
        expect(urls).toContain('https://thecyberhub.org/resources')
        expect(urls).toContain('https://thecyberhub.org/roadmaps/web-hacking')
        expect(urls).toContain('https://thecyberhub.org/learning-paths/linux-basics')
        expect(urls).toContain('https://thecyberhub.org/resources/owasp-top-10')
    })
    it('lists the event archive but no series page (there is no public list of series)', async () => {
        const urls = (await sitemap()).map((e) => e.url)
        expect(urls).toContain('https://thecyberhub.org/events/archive')
        expect(urls).toContain('https://thecyberhub.org/events/calendar')
        expect(urls.some((u) => u.includes('/events/series'))).toBe(false)
    })
    it('lists no page that needs a login and no address twice', async () => {
        const urls = (await sitemap()).map((e) => e.url)
        for (const gone of ['/dashboard', '/profile', '/bookmarks', '/blog/write', '/employer/dashboard', '/employer/post-job', '/auth']) {
            expect(urls).not.toContain(`https://thecyberhub.org${gone}`)
        }
        expect(new Set(urls).size).toBe(urls.length)
    })
})
