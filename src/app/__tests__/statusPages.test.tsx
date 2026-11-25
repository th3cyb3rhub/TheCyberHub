import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What each detail page does with the three answers the server can get from the API: found (the page,
 * with its content), missing or malformed (a real 404 through `notFound()`), and an API that failed
 * (the page still renders, so a hiccup never tells a search engine the page is gone).
 */
const nav = vi.hoisted(() => ({
    notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
    permanentRedirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT:${to}`) }),
    useParams: vi.fn(() => ({})),
}))
vi.mock('next/navigation', () => nav)

const labs = vi.hoisted(() => ({ fetchPublicLab: vi.fn() }))
vi.mock('@/lib/labs/server', async (orig) => ({ ...(await orig<typeof import('@/lib/labs/server')>()), ...labs }))
const cr = vi.hoisted(() => ({ fetchPublicSnippet: vi.fn() }))
vi.mock('@/lib/codeReview/server', async (orig) => ({ ...(await orig<typeof import('@/lib/codeReview/server')>()), ...cr }))
const ctf = vi.hoisted(() => ({ fetchPublicCompetition: vi.fn(), fetchPublicResults: vi.fn() }))
vi.mock('@/lib/ctf/server', async (orig) => ({ ...(await orig<typeof import('@/lib/ctf/server')>()), ...ctf }))
const internships = vi.hoisted(() => ({ fetchPublicCohort: vi.fn() }))
vi.mock('@/lib/internships/server', async (orig) => ({ ...(await orig<typeof import('@/lib/internships/server')>()), ...internships }))

// The views need the app's providers and query client; a page only has to hand them what it fetched
vi.mock('@/components/labs/LabDetailView', () => ({ LabDetailView: (p: { slug: string; initialLab: unknown }) => <div data-testid="view" data-slug={p.slug} data-initial={p.initialLab ? 'yes' : 'no'} />, LabMissing: () => <div data-testid="missing" /> }))
vi.mock('@/components/code-review/ExerciseView', () => ({ ExerciseView: (p: { slug: string; initialSnippet: unknown }) => <div data-testid="view" data-slug={p.slug} data-initial={p.initialSnippet ? 'yes' : 'no'} />, ExerciseMissing: () => <div data-testid="missing" /> }))
vi.mock('@/components/ctf/CompetitionView', () => ({ CompetitionView: (p: { slug: string; initialCompetition: unknown }) => <div data-testid="view" data-slug={p.slug} data-initial={p.initialCompetition ? 'yes' : 'no'} />, CompetitionMissing: () => <div data-testid="missing" /> }))
vi.mock('@/components/ctf/ResultsView', () => ({ ResultsView: (p: { slug: string; initialResults: unknown }) => <div data-testid="view" data-slug={p.slug} data-initial={p.initialResults ? 'yes' : 'no'} />, ResultsMissing: () => <div data-testid="missing" /> }))
vi.mock('@/components/internships/CohortDetailView', () => ({ CohortDetailView: (p: { id: string; initialCohort: unknown }) => <div data-testid="view" data-slug={p.id} data-initial={p.initialCohort ? 'yes' : 'no'} />, CohortMissing: () => <div data-testid="missing" /> }))

import CodeReviewExercisePage from '@/app/code-review/[ref]/page'
import CodeReviewNotFound from '@/app/code-review/[ref]/not-found'
import CompetitionPage from '@/app/ctf/competitions/[slug]/page'
import CompetitionNotFound from '@/app/ctf/competitions/[slug]/not-found'
import ResultsPage from '@/app/ctf/competitions/[slug]/results/page'
import ResultsNotFound from '@/app/ctf/competitions/[slug]/results/not-found'
import InternshipPage from '@/app/internships/[id]/page'
import InternshipNotFound from '@/app/internships/[id]/not-found'
import LabPage from '@/app/labs/[slug]/page'
import LabNotFound from '@/app/labs/[slug]/not-found'

const COHORT_ID = 'a'.repeat(24)
const attempt = async (fn: () => Promise<unknown>) => { try { return await fn() } catch (e) { return e as Error } }
const html = async (page: Promise<unknown>) => renderToStaticMarkup((await page) as React.ReactElement)

interface Case {
    name: string
    page: (params: Record<string, string>) => Promise<unknown>
    key: string
    ok: string
    mock: ReturnType<typeof vi.fn>
    okResult: unknown
    notFoundView: () => React.ReactElement | null
    slug: string
    badSlug: string
    params?: () => Record<string, unknown>
}

const CASES: Case[] = [
    { name: 'lab', page: (p) => LabPage({ params: Promise.resolve(p) } as never), key: 'slug', ok: 'sql-injection-basics', mock: labs.fetchPublicLab, okResult: { state: 'ok', lab: { slug: 'sql-injection-basics' } }, notFoundView: LabNotFound, slug: 'slug', badSlug: 'BAD_slug' },
    { name: 'code review exercise', page: (p) => CodeReviewExercisePage({ params: Promise.resolve(p) } as never), key: 'ref', ok: 'login-check', mock: cr.fetchPublicSnippet, okResult: { state: 'ok', snippet: { slug: 'login-check' } }, notFoundView: CodeReviewNotFound, slug: 'ref', badSlug: 'BAD_ref' },
    { name: 'competition', page: (p) => CompetitionPage({ params: Promise.resolve(p), searchParams: Promise.resolve({}) } as never), key: 'slug', ok: 'frozen-cup', mock: ctf.fetchPublicCompetition, okResult: { state: 'ok', competition: { slug: 'frozen-cup' }, fetchedAt: 1 }, notFoundView: CompetitionNotFound, slug: 'slug', badSlug: 'BAD_slug' },
    { name: 'competition results', page: (p) => ResultsPage({ params: Promise.resolve(p) } as never), key: 'slug', ok: 'frozen-cup', mock: ctf.fetchPublicResults, okResult: { state: 'ok', results: { competition: {} }, fetchedAt: 1 }, notFoundView: ResultsNotFound, slug: 'slug', badSlug: 'BAD_slug' },
    { name: 'internship', page: (p) => InternshipPage({ params: Promise.resolve(p) } as never), key: 'id', ok: COHORT_ID, mock: internships.fetchPublicCohort, okResult: { state: 'ok', cohort: { _id: COHORT_ID } }, notFoundView: InternshipNotFound, slug: 'id', badSlug: 'not-an-id' },
]

beforeEach(() => vi.clearAllMocks())

describe.each(CASES)('$name page', (c) => {
    it('renders its view with what the server fetched', async () => {
        c.mock.mockResolvedValue(c.okResult)
        const out = await html(c.page({ [c.key]: c.ok }))
        expect(out).toContain('data-testid="view"')
        expect(out).toContain('data-initial="yes"')
        expect(nav.notFound).not.toHaveBeenCalled()
    })

    it.each(['missing', 'invalid'])('is a real 404 when the server answer is "%s"', async (state) => {
        c.mock.mockResolvedValue({ state })
        const error = await attempt(() => c.page({ [c.key]: c.badSlug }))
        expect((error as Error).message).toBe('NEXT_NOT_FOUND')
        expect(nav.notFound).toHaveBeenCalledTimes(1)
    })

    it('is not a 404 when the API failed: the view asks again in the browser', async () => {
        c.mock.mockResolvedValue({ state: 'error' })
        const out = await html(c.page({ [c.key]: c.ok }))
        expect(out).toContain('data-initial="no"')
        expect(nav.notFound).not.toHaveBeenCalled()
    })

    it('has a 404 view that asks again with the viewer\'s token for a well formed address', () => {
        nav.useParams.mockReturnValue({ [c.slug]: c.ok })
        const out = renderToStaticMarkup(c.notFoundView() as React.ReactElement)
        expect(out).toContain('data-testid="view"')
        expect(out).toContain('data-initial="no"')
    })

    it('has a 404 view that never asks the API about an address that cannot be one', () => {
        nav.useParams.mockReturnValue({ [c.slug]: c.badSlug })
        expect(renderToStaticMarkup(c.notFoundView() as React.ReactElement)).toContain('data-testid="missing"')
        nav.useParams.mockReturnValue({})
        expect(renderToStaticMarkup(c.notFoundView() as React.ReactElement)).toContain('data-testid="missing"')
    })
})

describe('the 404 view reads the address the way the pages do', () => {
    it('lower cases a slug, as the API does', () => {
        nav.useParams.mockReturnValue({ slug: 'SQL-Injection-Basics' })
        expect(renderToStaticMarkup(LabNotFound() as React.ReactElement)).toContain('data-slug="sql-injection-basics"')
    })
})
