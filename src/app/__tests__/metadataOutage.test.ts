import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the metadata of each detail page says about indexing for the three answers the API can give.
 * A page that is missing or not public stays out of search results. An API that did not answer says
 * nothing: no robots rule at all, so an outage cannot drop a good page from the index.
 */
vi.mock('next/navigation', () => ({ notFound: vi.fn(), permanentRedirect: vi.fn(), redirect: vi.fn() }))

const labs = vi.hoisted(() => ({ fetchPublicLab: vi.fn() }))
vi.mock('@/lib/labs/server', async (orig) => ({ ...(await orig<typeof import('@/lib/labs/server')>()), ...labs }))
const cr = vi.hoisted(() => ({ fetchPublicSnippet: vi.fn() }))
vi.mock('@/lib/codeReview/server', async (orig) => ({ ...(await orig<typeof import('@/lib/codeReview/server')>()), ...cr }))
const ctf = vi.hoisted(() => ({ fetchPublicCompetition: vi.fn(), fetchPublicResults: vi.fn() }))
vi.mock('@/lib/ctf/server', async (orig) => ({ ...(await orig<typeof import('@/lib/ctf/server')>()), ...ctf }))
const internships = vi.hoisted(() => ({ fetchPublicCohort: vi.fn() }))
vi.mock('@/lib/internships/server', async (orig) => ({ ...(await orig<typeof import('@/lib/internships/server')>()), ...internships }))
const jobs = vi.hoisted(() => ({ fetchPublicJob: vi.fn(), fetchCompany: vi.fn() }))
vi.mock('@/lib/jobs/server', async (orig) => ({ ...(await orig<typeof import('@/lib/jobs/server')>()), ...jobs }))
const events = vi.hoisted(() => ({ fetchPublicEvent: vi.fn(), fetchPublicSeries: vi.fn() }))
vi.mock('@/lib/events/server', async (orig) => ({ ...(await orig<typeof import('@/lib/events/server')>()), ...events }))
const learning = vi.hoisted(() => ({ fetchPublicPath: vi.fn(), fetchPublicResource: vi.fn() }))
vi.mock('@/lib/learning/server', async (orig) => ({ ...(await orig<typeof import('@/lib/learning/server')>()), ...learning }))

// The pages are only asked for their metadata
vi.mock('@/components/labs/LabDetailView', () => ({ LabDetailView: () => null }))
vi.mock('@/components/code-review/ExerciseView', () => ({ ExerciseView: () => null }))
vi.mock('@/components/ctf/CompetitionView', () => ({ CompetitionView: () => null }))
vi.mock('@/components/ctf/ResultsView', () => ({ ResultsView: () => null }))
vi.mock('@/components/internships/CohortDetailView', () => ({ CohortDetailView: () => null }))
vi.mock('@/components/jobs/JobClientView', () => ({ JobClientView: () => null }))
vi.mock('@/components/jobs/JobActions', () => ({ JobActions: () => null, SidebarApply: () => null }))
vi.mock('@/components/jobs/JobViewerBanner', () => ({ JobViewerBanner: () => null }))
vi.mock('@/components/learning/LearningPathView', () => ({ LearningPathView: () => null }))
vi.mock('@/components/events/EventDetailView', () => ({ EventDetailView: () => null }))
vi.mock('@/components/events/SeriesView', () => ({ SeriesView: () => null }))
vi.mock('@/components/resources/ResourceDetailView', () => ({ ResourceDetailView: () => null }))

import { generateMetadata as companyMeta } from '@/app/company/[slug]/page'
import { generateMetadata as codeReviewMeta } from '@/app/code-review/[ref]/page'
import { generateMetadata as competitionMeta } from '@/app/ctf/competitions/[slug]/page'
import { generateMetadata as resultsMeta } from '@/app/ctf/competitions/[slug]/results/page'
import { generateMetadata as internshipMeta } from '@/app/internships/[id]/page'
import { generateMetadata as jobMeta } from '@/app/jobs/[slug]/page'
import { generateMetadata as labMeta } from '@/app/labs/[slug]/page'
import { generateMetadata as eventMeta } from '@/app/events/[slug]/page'
import { generateMetadata as seriesMeta } from '@/app/events/series/[id]/page'
import { generateMetadata as resourceMeta } from '@/app/resources/[slug]/page'
import { pathMetadata } from '@/components/learning/PathPage'

const NOINDEX = { index: false, follow: false }
const params = (key: string, value = 'some-slug') => ({ params: Promise.resolve({ [key]: value }) }) as never

interface Case { name: string; mock: ReturnType<typeof vi.fn>; meta: () => Promise<{ robots?: unknown; title?: unknown }> }
const CASES: Case[] = [
    { name: 'lab', mock: labs.fetchPublicLab, meta: () => labMeta(params('slug')) },
    { name: 'job', mock: jobs.fetchPublicJob, meta: () => jobMeta(params('slug')) },
    { name: 'company', mock: jobs.fetchCompany, meta: () => companyMeta(params('slug')) },
    { name: 'competition', mock: ctf.fetchPublicCompetition, meta: () => competitionMeta(params('slug')) },
    { name: 'competition results', mock: ctf.fetchPublicResults, meta: () => resultsMeta(params('slug')) },
    { name: 'code review exercise', mock: cr.fetchPublicSnippet, meta: () => codeReviewMeta(params('ref')) },
    { name: 'internship', mock: internships.fetchPublicCohort, meta: () => internshipMeta(params('id', '0123456789abcdef01234567')) },
    { name: 'event', mock: events.fetchPublicEvent, meta: () => eventMeta(params('slug')) },
    { name: 'event series', mock: events.fetchPublicSeries, meta: () => seriesMeta(params('id', '0123456789abcdef01234567')) },
    { name: 'resource', mock: learning.fetchPublicResource, meta: () => resourceMeta(params('slug')) },
    { name: 'roadmap', mock: learning.fetchPublicPath, meta: () => pathMetadata('roadmap', 'some-slug') },
    { name: 'learning path', mock: learning.fetchPublicPath, meta: () => pathMetadata('path', 'some-slug') },
]

beforeEach(() => vi.clearAllMocks())

describe.each(CASES)('$name metadata', (c) => {
    it('keeps a missing page out of search results', async () => {
        c.mock.mockResolvedValue({ state: 'missing' })
        expect((await c.meta()).robots).toEqual(c.name === 'competition results' ? { index: false, follow: true } : NOINDEX)
    })

    it('says nothing about indexing when the API did not answer, and still has a title', async () => {
        c.mock.mockResolvedValue({ state: 'error' })
        const meta = await c.meta()
        expect(meta.robots).toBeUndefined()
        expect(meta.title).toBeTruthy()
    })
})
