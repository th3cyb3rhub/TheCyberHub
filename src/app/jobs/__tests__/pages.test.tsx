import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { card, company, job } from '@/lib/jobs/__tests__/fixtures'

const nav = vi.hoisted(() => ({
    notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
    permanentRedirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT:${to}`) }),
}))
vi.mock('next/navigation', () => nav)

const server = vi.hoisted(() => ({
    fetchPublicJob: vi.fn(),
    fetchJobsPage: vi.fn(),
    fetchCompany: vi.fn(),
    fetchCompanyJobs: vi.fn(),
}))
vi.mock('@/lib/jobs/server', async (orig) => ({ ...(await orig<typeof import('@/lib/jobs/server')>()), ...server }))

// The interactive islands need the app's providers; the page only has to place them
vi.mock('@/components/jobs/JobActions', () => ({
    JobActions: ({ jobRef }: { jobRef: string }) => <div data-testid="actions" data-ref={jobRef} />,
    SidebarApply: () => <div data-testid="sidebar-apply" />,
}))
vi.mock('@/components/jobs/JobViewerBanner', () => ({ JobViewerBanner: () => <div data-testid="banner" /> }))
vi.mock('@/components/jobs/JobClientView', () => ({ JobClientView: ({ slug }: { slug: string }) => <div data-testid="client-view">{slug}</div> }))
vi.mock('@/components/jobs/JobsExplorer', () => ({ JobsExplorer: ({ initialPage }: { initialPage: { data: unknown[] } | null }) => <div data-testid="explorer">{initialPage ? initialPage.data.length : 'none'}</div> }))
vi.mock('@/components/jobs/PostJobLink', () => ({ PostJobLink: ({ href, children }: { href?: string; children: React.ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('@/components/jobs/RefreshButton', () => ({ RefreshButton: () => <button type="button">Try again</button> }))

import CompanyPage, { generateMetadata as companyMetadata } from '@/app/company/[slug]/page'
import JobsPage from '@/app/jobs/page'
import JobPage, { generateMetadata as jobMetadata } from '@/app/jobs/[slug]/page'

const ok = (j = job(), meta = {}) => ({ state: 'ok', job: j, meta, fetchedAt: 1 })
const params = (slug: string) => ({ params: Promise.resolve({ slug }) })
const attempt = async (fn: () => Promise<unknown>) => { try { return await fn() } catch (e) { return e as Error } }

beforeEach(() => vi.clearAllMocks())

describe('job page', () => {
    it('renders the job with its JobPosting data, once, with the slug as the address', async () => {
        server.fetchPublicJob.mockResolvedValue(ok())
        const html = renderToStaticMarkup(await JobPage(params('senior-pentester-abc123')) as React.ReactElement)
        expect(html).toContain('Senior Pentester')
        expect(html).toContain('application/ld+json')
        expect(html).toContain('"@type":"JobPosting"')
        expect(html).toContain('data-ref="senior-pentester-abc123"')
        expect(nav.permanentRedirect).not.toHaveBeenCalled()
    })

    it('shares one server fetch between the page and its metadata (same reference)', async () => {
        server.fetchPublicJob.mockResolvedValue(ok())
        await jobMetadata(params('senior-pentester-abc123'))
        await JobPage(params('senior-pentester-abc123'))
        expect(server.fetchPublicJob.mock.calls.every((c) => c[0] === 'senior-pentester-abc123')).toBe(true)
    })

    it('redirects an old slug to the canonical one', async () => {
        server.fetchPublicJob.mockResolvedValue(ok(job({ slug: 'new-slug-abc123' }), { redirectedFromSlug: 'old-slug', canonicalSlug: 'new-slug-abc123' }))
        const error = await attempt(() => JobPage(params('old-slug')))
        expect((error as Error).message).toBe('NEXT_REDIRECT:/jobs/new-slug-abc123')
        expect(nav.permanentRedirect).toHaveBeenCalledWith('/jobs/new-slug-abc123')
    })

    it('redirects an id to the slug address', async () => {
        server.fetchPublicJob.mockResolvedValue(ok(job({ _id: '65f1c0ffee00', slug: 'senior-pentester-abc123' }), {}))
        const error = await attempt(() => JobPage(params('65f1c0ffee00')))
        expect((error as Error).message).toBe('NEXT_REDIRECT:/jobs/senior-pentester-abc123')
    })

    it.each([
        ['a canonical slug with a path in it', '../admin'],
        ['a canonical slug with a scheme', 'https://evil.example/x'],
        ['a canonical slug with spaces', 'a b'],
        ['an empty canonical slug', ''],
    ])('does not follow %s: it renders the page where it is (no redirect)', async (_name, bad) => {
        server.fetchPublicJob.mockResolvedValue(ok(job({ slug: 'senior-pentester-abc123' }), { canonicalSlug: bad }))
        const html = renderToStaticMarkup(await JobPage(params('old-slug')) as React.ReactElement)
        expect(nav.permanentRedirect).not.toHaveBeenCalled()
        expect(html).toContain('Senior Pentester')
    })

    it('never redirects to the address that was asked for', async () => {
        server.fetchPublicJob.mockResolvedValue(ok(job({ slug: 'senior-pentester-abc123' }), { canonicalSlug: 'senior-pentester-abc123' }))
        await JobPage(params('senior-pentester-abc123'))
        expect(nav.permanentRedirect).not.toHaveBeenCalled()
    })

    it('is a real 404 for a missing job and for a reference that cannot be one', async () => {
        server.fetchPublicJob.mockResolvedValue({ state: 'missing' })
        expect(((await attempt(() => JobPage(params('gone-1')))) as Error).message).toBe('NEXT_NOT_FOUND')
        server.fetchPublicJob.mockResolvedValue({ state: 'invalid' })
        expect(((await attempt(() => JobPage(params('a b')))) as Error).message).toBe('NEXT_NOT_FOUND')
    })

    it('hands a failing API to the browser instead of a 404', async () => {
        server.fetchPublicJob.mockResolvedValue({ state: 'error' })
        const html = renderToStaticMarkup(await JobPage(params('a-job-1')) as React.ReactElement)
        expect(html).toContain('data-testid="client-view"')
        expect(nav.notFound).not.toHaveBeenCalled()
    })

    it('keeps a job that is not public out of search results', async () => {
        server.fetchPublicJob.mockResolvedValue({ state: 'missing' })
        expect((await jobMetadata(params('gone-1'))).robots).toEqual({ index: false, follow: false })
        server.fetchPublicJob.mockResolvedValue(ok())
        expect((await jobMetadata(params('senior-pentester-abc123'))).robots).toBeUndefined()
    })

    it('shows a script in a description as text, never as markup', async () => {
        server.fetchPublicJob.mockResolvedValue(ok(job({ description: 'Hello <script>window.__pwn=1</script> <img src=x onerror="window.__pwn=2"> world' })))
        const html = renderToStaticMarkup(await JobPage(params('senior-pentester-abc123')) as React.ReactElement)
        const outside = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
        expect(outside).not.toMatch(/<script/i)
        expect(outside).not.toMatch(/<img[^>]*onerror/i)
    })
})

describe('job list page', () => {
    it('renders the first page from the server and passes the filters from the address', async () => {
        server.fetchJobsPage.mockResolvedValue({ success: true, data: [card()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1, pages: 1, hasMore: false }, fetchedAt: 1 })
        const html = renderToStaticMarkup(await JobsPage({ searchParams: Promise.resolve({ category: 'soc', bogus: 'x' }) }) as React.ReactElement)
        expect(server.fetchJobsPage).toHaveBeenCalledWith({ category: 'soc' }, expect.anything())
        expect(html).toContain('data-testid="explorer"')
    })

    it('still renders when the API is down', async () => {
        server.fetchJobsPage.mockResolvedValue(null)
        const html = renderToStaticMarkup(await JobsPage({ searchParams: Promise.resolve({}) }) as React.ReactElement)
        expect(html).toContain('none')
    })
})

describe('company page', () => {
    it('renders the company and its open roles, with plain text for the description', async () => {
        server.fetchCompany.mockResolvedValue({ state: 'ok', company: company({ description: '<b>bold</b> <script>x</script>' }) })
        server.fetchCompanyJobs.mockResolvedValue({ success: true, data: [card()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1, pages: 1, hasMore: false }, fetchedAt: 1 })
        const html = renderToStaticMarkup(await CompanyPage({ ...params('acme-security'), searchParams: Promise.resolve({}) }) as React.ReactElement)
        expect(html).toContain('Acme Security')
        expect(html).toContain('Senior Pentester')
        expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
        expect(html).not.toContain('<script>x')
        expect(server.fetchCompanyJobs).toHaveBeenCalledWith('acme-security', 1)
    })

    it('reads the page number and ignores nonsense', async () => {
        server.fetchCompany.mockResolvedValue({ state: 'ok', company: company() })
        server.fetchCompanyJobs.mockResolvedValue(null)
        const html = renderToStaticMarkup(await CompanyPage({ ...params('acme-security'), searchParams: Promise.resolve({ page: '3' }) }) as React.ReactElement)
        expect(server.fetchCompanyJobs).toHaveBeenCalledWith('acme-security', 3)
        expect(html).toContain('could not load the jobs')
        await CompanyPage({ ...params('acme-security'), searchParams: Promise.resolve({ page: '-4' }) })
        expect(server.fetchCompanyJobs).toHaveBeenLastCalledWith('acme-security', 1)
    })

    it('is a 404 when missing and offers a retry when the API fails', async () => {
        server.fetchCompany.mockResolvedValue({ state: 'missing' })
        expect(((await attempt(() => CompanyPage({ ...params('gone'), searchParams: Promise.resolve({}) }))) as Error).message).toBe('NEXT_NOT_FOUND')
        server.fetchCompany.mockResolvedValue({ state: 'error' })
        const html = renderToStaticMarkup(await CompanyPage({ ...params('acme-security'), searchParams: Promise.resolve({}) }) as React.ReactElement)
        expect(html).toContain('Try again')
        // The API did not answer: nothing is known about the company, so no robots rule
        expect((await companyMetadata(params('acme-security'))).robots).toBeUndefined()
        server.fetchCompany.mockResolvedValue({ state: 'missing' })
        expect((await companyMetadata(params('gone'))).robots).toEqual({ index: false, follow: false })
    })
})
