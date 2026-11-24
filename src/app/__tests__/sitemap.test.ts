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

    it('lists public jobs dated by when they were posted, and each company page once', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    { _id: 'a', slug: 'pentester-a', createdAt: '2026-10-01T00:00:00Z', companyRef: { slug: 'acme' } },
                    { _id: 'b', slug: 'soc-b', createdAt: '2026-10-05T00:00:00Z', companyRef: { slug: 'acme' } },
                    { _id: 'c', slug: 'grc-c', companyRef: null },
                    { _id: 'd', createdAt: 'not a date', companyRef: { slug: 'zeta-co' } },
                ],
            }),
        }))
        const entries = await sitemap()
        const at = (url: string) => entries.find((e) => e.url === url)
        expect(at('https://thecyberhub.org/jobs/pentester-a')?.lastModified).toEqual(new Date('2026-10-01T00:00:00Z'))
        expect(at('https://thecyberhub.org/jobs/grc-c')).toBeDefined()
        // No date to give: none is invented
        expect(at('https://thecyberhub.org/jobs/grc-c')?.lastModified).toBeUndefined()
        expect(at('https://thecyberhub.org/jobs/d')?.lastModified).toBeUndefined()
        const companies = entries.filter((e) => e.url.startsWith('https://thecyberhub.org/company/') && e.url !== 'https://thecyberhub.org/company/')
        expect(companies.map((e) => e.url).filter((u) => u.endsWith('/acme'))).toHaveLength(1)
        expect(at('https://thecyberhub.org/company/acme')?.lastModified).toEqual(new Date('2026-10-05T00:00:00Z'))
        expect(at('https://thecyberhub.org/company/zeta-co')).toBeDefined()
        const urls = entries.map((e) => e.url)
        expect(new Set(urls).size).toBe(urls.length)
    })

    it('still lists the static pages when the jobs API is down', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
        const urls = (await sitemap()).map((e) => e.url)
        expect(urls).toContain('https://thecyberhub.org/jobs')
        expect(urls.some((u) => /\/company\/[^/]+$/.test(u) && !u.endsWith('/company/'))).toBe(false)
    })
})
