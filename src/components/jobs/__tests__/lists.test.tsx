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
const nav = vi.hoisted(() => ({ replace: vi.fn(), search: new URLSearchParams() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/jobs', useRouter: () => ({ push: vi.fn(), replace: nav.replace }), useSearchParams: () => nav.search }))
const api = vi.hoisted(() => ({ listJobs: vi.fn(), listSavedJobs: vi.fn(), saveJob: vi.fn(), unsaveJob: vi.fn() }))
vi.mock('@/lib/api/jobs', () => api)
vi.mock('@/lib/jobs/revalidate', () => ({ refreshPublicJobs: vi.fn() }))
vi.mock('@/components/internships/ViewerTime', () => ({ ViewerTime: ({ iso }: { iso: string }) => <time>{iso}</time> }))

import { JobDetailContent } from '../JobDetailContent'
import { JobsExplorer } from '../JobsExplorer'
import { PostJobLink } from '../PostJobLink'
import { SavedJobsView } from '../SavedJobsView'

const page = (data: JobCard[], extra: Partial<JobsPage<JobCard>> = {}): JobsPage<JobCard> =>
    ({ success: true, data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1, pages: 1, hasMore: false }, ...extra })

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: null, loading: false, refreshUser: vi.fn() }
    nav.search = new URLSearchParams()
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

    it('writes the address with a fresh state, never the state it found, so the router follows and Back shows this list', async () => {
        api.listJobs.mockResolvedValue(page([card({ _id: 'soc1', title: 'SOC Analyst', slug: 'soc-1' })]))
        window.history.replaceState({ __NA: true, tree: 'of-the-first-render' }, '')
        const replaceState = vi.spyOn(window.history, 'replaceState')
        renderWithClient(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        await userEvent.selectOptions(screen.getByLabelText('Category'), 'soc')
        await waitFor(() => expect(replaceState).toHaveBeenCalled())
        for (const call of replaceState.mock.calls) expect(call[0]).toBeNull()
        replaceState.mockRestore()
        window.history.replaceState(null, '')
    })

    it('starts from the address, not from the page the server rendered earlier (coming back with Back)', async () => {
        // The server tree was rendered for the plain list; the address holds the filter the member set before opening a job
        nav.search = new URLSearchParams('category=grc&search=audit')
        api.listJobs.mockResolvedValue(page([card({ _id: 'grc1', title: 'GRC Lead', slug: 'grc-1' })]))
        renderWithClient(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        expect(screen.getByLabelText('Category')).toHaveValue('grc')
        expect(screen.getByRole('searchbox')).toHaveValue('audit')
        await waitFor(() => expect(api.listJobs).toHaveBeenCalledWith(expect.objectContaining({ category: 'grc', search: 'audit' })))
        expect(await screen.findByText('GRC Lead')).toBeInTheDocument()
        expect(screen.queryByText('Senior Pentester')).not.toBeInTheDocument()
    })

    it('uses the server page only while the address still has the filters it was rendered for', async () => {
        nav.search = new URLSearchParams('category=soc')
        renderWithClient(<JobsExplorer initialFilters={{ category: 'soc' }} initialPage={{ ...page([card({ title: 'Rendered on the server' })]), fetchedAt: Date.now() }} />)
        expect(screen.getByText('Rendered on the server')).toBeInTheDocument()
        await new Promise((r) => setTimeout(r, 20))
        expect(api.listJobs).not.toHaveBeenCalled()
    })

    it('follows an address change it did not make, and ignores the ones it made itself', async () => {
        api.listJobs.mockImplementation(async (f: { category?: string }) => page([card({ _id: f.category ?? 'none', title: `List for ${f.category ?? 'nothing'}`, slug: `s-${f.category ?? 'none'}` })]))
        const { rerender } = renderWithClient(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        await userEvent.selectOptions(screen.getByLabelText('Category'), 'soc')
        // Next reports the address the list just wrote: the list keeps going, nothing restarts
        nav.search = new URLSearchParams('category=soc')
        rerender(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        expect(await screen.findByText('List for soc')).toBeInTheDocument()
        expect(screen.getByLabelText('Category')).toHaveValue('soc')
        // Back or a link brings another address
        nav.search = new URLSearchParams('category=grc')
        rerender(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('grc'))
        expect(await screen.findByText('List for grc')).toBeInTheDocument()
        nav.search = new URLSearchParams()
        rerender(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        await waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue(''))
    })

    it('does not offer a moderator a way to post a job, but offers an employer one', () => {
        auth.current = { user: { id: 'm1', role: 'moderator' }, loading: false, refreshUser: vi.fn() }
        const { unmount } = renderWithClient(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        expect(screen.queryByRole('link', { name: /Post a job/ })).not.toBeInTheDocument()
        unmount()
        auth.current = { user: { id: 'e1', role: 'employer' }, loading: false, refreshUser: vi.fn() }
        renderWithClient(<JobsExplorer initialFilters={{}} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        expect(screen.getByRole('link', { name: /Post a job/ })).toHaveAttribute('href', '/employer/post')
    })

    it('disables the save buttons while the rows are only the previous filter\'s rows', async () => {
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.listJobs.mockResolvedValueOnce(page([card()], { viewer: { savedIds: [] } }))
        renderWithClient(<JobsExplorer initialFilters={{}} initialPage={null} />)
        expect(await screen.findByTestId('save-job')).toBeEnabled()
        let release: (p: JobsPage<JobCard>) => void = () => undefined
        api.listJobs.mockReturnValueOnce(new Promise((resolve) => { release = resolve }))
        await userEvent.selectOptions(screen.getByLabelText('Category'), 'soc')
        await waitFor(() => expect(screen.getByTestId('save-job')).toBeDisabled())
        release(page([card()], { viewer: { savedIds: [] } }))
        await waitFor(() => expect(screen.getByTestId('save-job')).toBeEnabled())
    })

    it('says so when a sort that the API holds in memory stops at its last page, instead of a load more that would fail', async () => {
        api.listJobs.mockResolvedValue({ ...page([card()]), pagination: { page: 50, limit: 20, total: 5000, totalPages: 250, pages: 250, hasMore: true } })
        nav.search = new URLSearchParams('sort=viewCount')
        renderWithClient(<JobsExplorer initialFilters={{}} initialPage={null} />)
        expect(await screen.findByTestId('sort-cap')).toHaveTextContent(/Narrow the filters or sort by newest/)
        expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Sort by newest' }))
        await waitFor(() => expect(api.listJobs).toHaveBeenLastCalledWith(expect.not.objectContaining({ sortBy: 'viewCount' })))
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
        nav.search = new URLSearchParams('category=grc&search=audit')
        renderWithClient(<JobsExplorer initialFilters={{ category: 'grc', search: 'audit' }} initialPage={{ ...page([card()]), fetchedAt: Date.now() }} />)
        expect(screen.getByLabelText('Category')).toHaveValue('grc')
        expect(screen.getByRole('searchbox')).toHaveValue('audit')
    })
})

describe('PostJobLink', () => {
    it.each([['moderator', false], ['employer', true], ['admin', true], ['user', true]])('for a %s: shown is %s', (role, shown) => {
        auth.current = { user: { id: 'x', role }, loading: false, refreshUser: vi.fn() }
        renderWithClient(<PostJobLink href="/employer">Hiring? Post a job</PostJobLink>)
        expect(screen.queryByRole('link', { name: 'Hiring? Post a job' }) !== null).toBe(shown)
    })

    it('is shown to a visitor', () => {
        renderWithClient(<PostJobLink href="/employer">Hiring? Post a job</PostJobLink>)
        expect(screen.getByRole('link', { name: 'Hiring? Post a job' })).toHaveAttribute('href', '/employer')
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
