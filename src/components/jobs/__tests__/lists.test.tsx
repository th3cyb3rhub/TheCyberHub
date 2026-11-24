import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { card, job } from '@/lib/jobs/__tests__/fixtures'
import type { JobCard, JobsPage } from '@/types/job'
import { renderWithClient } from './utils'

const auth = vi.hoisted(() => ({ current: { user: null as { id: string; role: string } | null, loading: false, refreshUser: vi.fn() } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
const nav = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/jobs', useRouter: () => ({ push: vi.fn(), replace: nav.replace }) }))
const api = vi.hoisted(() => ({ listJobs: vi.fn(), listSavedJobs: vi.fn(), saveJob: vi.fn(), unsaveJob: vi.fn() }))
vi.mock('@/lib/api/jobs', () => api)
vi.mock('@/lib/jobs/revalidate', () => ({ refreshPublicJobs: vi.fn() }))
vi.mock('@/components/internships/ViewerTime', () => ({ ViewerTime: ({ iso }: { iso: string }) => <time>{iso}</time> }))

import { JobDetailContent } from '../JobDetailContent'
import { JobsExplorer } from '../JobsExplorer'
import { SavedJobsView } from '../SavedJobsView'

const page = (data: JobCard[], extra: Partial<JobsPage<JobCard>> = {}): JobsPage<JobCard> =>
    ({ success: true, data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1, pages: 1, hasMore: false }, ...extra })

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: null, loading: false, refreshUser: vi.fn() }
})
afterEach(() => vi.useRealTimers())

describe('JobsExplorer', () => {
    it('shows the page the server rendered without asking the API again for a visitor', async () => {
        renderWithClient(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card(), card({ _id: 'j2', slug: 'soc-analyst-1', title: 'SOC Analyst' })]), fetchedAt: Date.now() }} />)
        expect(screen.getAllByTestId('job-card')).toHaveLength(2)
        expect(screen.getByTestId('jobs-count')).toHaveTextContent('2 jobs')
        expect(screen.getByRole('link', { name: 'Senior Pentester' })).toHaveAttribute('href', '/jobs/senior-pentester-abc123')
        await new Promise((r) => setTimeout(r, 20))
        expect(api.listJobs).not.toHaveBeenCalled()
        // A visitor has no save buttons, only the sign-in link on the page of a job
        expect(screen.queryByTestId('save-job')).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'Saved jobs' })).not.toBeInTheDocument()
    })

    it('asks the API with the filter and follows it in the address without a navigation', async () => {
        api.listJobs.mockResolvedValue(page([card({ _id: 'soc1', title: 'SOC Analyst', slug: 'soc-1' })]))
        const replaceState = vi.spyOn(window.history, 'replaceState')
        renderWithClient(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        await userEvent.selectOptions(screen.getByLabelText('Category'), 'soc')
        await waitFor(() => expect(api.listJobs).toHaveBeenCalledWith(expect.objectContaining({ category: 'soc', page: 1 })))
        await waitFor(() => expect(replaceState).toHaveBeenCalledWith(null, '', expect.stringContaining('category=soc')))
        expect(await screen.findByText('SOC Analyst')).toBeInTheDocument()
        replaceState.mockRestore()
    })

    it('marks the jobs a member saved and offers the saved list', async () => {
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.listJobs.mockResolvedValue(page([card(), card({ _id: 'j2', slug: 'b-2', title: 'Other' })], { viewer: { savedIds: ['j2'] } }))
        renderWithClient(<JobsExplorer initialFilters={{}} initialPage={null} />)
        const buttons = await screen.findAllByTestId('save-job')
        expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
        expect(screen.getByRole('link', { name: /Saved jobs/ })).toHaveAttribute('href', '/jobs/saved')
    })

    it('says so when nothing matches, and when the API fails, with a retry', async () => {
        api.listJobs.mockResolvedValueOnce(page([]))
        const { unmount } = renderWithClient(<JobsExplorer initialFilters={{}} initialPage={null} />)
        expect(await screen.findByText('No jobs found')).toBeInTheDocument()
        unmount()
        api.listJobs.mockRejectedValueOnce(new ApiError('down', 500))
        renderWithClient(<JobsExplorer initialFilters={{}} initialPage={null} />)
        expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load jobs/)
        api.listJobs.mockResolvedValueOnce(page([card()]))
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByText('Senior Pentester')).toBeInTheDocument()
    })

    it('starts from the filters of the address', () => {
        renderWithClient(<JobsExplorer initialFilters={{ category: 'grc', search: 'audit' }} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        expect(screen.getByLabelText('Category')).toHaveValue('grc')
        expect(screen.getByRole('searchbox')).toHaveValue('audit')
    })
})

describe('SavedJobsView', () => {
    it('sends a visitor to sign in', () => {
        renderWithClient(<SavedJobsView />)
        expect(nav.replace).toHaveBeenCalledWith('/auth?redirect=%2Fjobs%2Fsaved')
    })

    it('lists the saved jobs, says how many are gone, and removes one at once', async () => {
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.listSavedJobs.mockResolvedValueOnce(page([card(), card({ _id: 'j2', slug: 'b-2', title: 'Other' })], { unavailable: 2 })).mockResolvedValue(page([card({ _id: 'j2', slug: 'b-2', title: 'Other' })]))
        api.unsaveJob.mockResolvedValue(undefined)
        renderWithClient(<SavedJobsView />)
        const list = await screen.findByTestId('saved-list')
        expect(within(list).getAllByTestId('job-card')).toHaveLength(2)
        expect(screen.getByTestId('unavailable-note')).toHaveTextContent('2 saved jobs are no longer available')
        fireEvent.click(screen.getByRole('button', { name: 'Remove Senior Pentester from saved jobs' }))
        await waitFor(() => expect(api.unsaveJob).toHaveBeenCalledWith('j1'))
        await waitFor(() => expect(within(screen.getByTestId('saved-list')).getAllByTestId('job-card')).toHaveLength(1))
    })

    it('shows an empty state with a way back to the list', async () => {
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.listSavedJobs.mockResolvedValue(page([]))
        renderWithClient(<SavedJobsView />)
        expect(await screen.findByText('No saved jobs')).toBeInTheDocument()
        expect(screen.getAllByRole('link', { name: /Browse/ }).length).toBeGreaterThan(0)
    })
})

describe('JobDetailContent', () => {
    const evil = job({
        title: '<img src=x onerror=alert(1)>Pentester',
        description: 'Hello <script>window.__pwn = 1</script> <b onclick="x()">bold</b> [click](javascript:alert(1)) ![p](http://evil.example/p.png)',
        requirements: ['<script>alert(2)</script>'],
        benefits: ['<iframe src="https://evil.example"></iframe>'],
        companyDescription: '<style>*{display:none}</style>About us',
        applyUrl: 'javascript:alert(3)',
        companyWebsite: 'javascript:alert(4)',
        companyRef: null,
    })

    it('renders every poster text as text, never as markup, and no script link', () => {
        const { container } = renderWithClient(<JobDetailContent job={evil} actions={<div />} />)
        expect(container.querySelector('script')).toBeNull()
        expect(container.querySelector('iframe')).toBeNull()
        expect(container.querySelector('style')).toBeNull()
        expect(container.querySelector('[onerror], [onclick]')).toBeNull()
        expect(container.querySelector('img[src*="evil.example"]')).toBeNull()
        for (const a of Array.from(container.querySelectorAll('a'))) expect(a.getAttribute('href') ?? '').not.toMatch(/^\s*javascript:/i)
        expect(container.textContent).toContain('<img src=x onerror=alert(1)>Pentester')
    })

    it('opens outbound links safely', () => {
        const { container } = renderWithClient(<JobDetailContent job={job({ companyWebsite: 'https://acme.example', companyRef: null })} actions={<div />} />)
        const outbound = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]'))
        expect(outbound.length).toBeGreaterThan(0)
        for (const a of outbound) {
            expect(a.rel).toContain('noopener')
            expect(a.rel).toContain('noreferrer')
        }
    })

    it('places the interactive islands it is given', () => {
        renderWithClient(<JobDetailContent job={job()} actions={<div data-testid="island" />} sidebarAction={<div data-testid="side" />} />)
        expect(screen.getByTestId('island')).toBeInTheDocument()
        expect(screen.getByTestId('side')).toBeInTheDocument()
    })
})
