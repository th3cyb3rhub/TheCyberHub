import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { job } from '@/lib/jobs/__tests__/fixtures'
import { renderWithClient } from './utils'

const auth = vi.hoisted(() => ({ current: { user: null as { id: string; role: string } | null, loading: false, refreshUser: vi.fn() } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
const nav = vi.hoisted(() => ({ params: { slug: 'senior-pentester-abc123' } as Record<string, string> }))
vi.mock('next/navigation', () => ({ usePathname: () => '/jobs/senior-pentester-abc123', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useParams: () => nav.params }))
const api = vi.hoisted(() => ({ getJob: vi.fn(), applyToJob: vi.fn(), saveJob: vi.fn(), unsaveJob: vi.fn(), reportJob: vi.fn() }))
vi.mock('@/lib/api/jobs', () => api)
vi.mock('@/lib/jobs/revalidate', () => ({ refreshPublicJobs: vi.fn() }))
vi.mock('@/components/internships/ViewerTime', () => ({ ViewerTime: ({ iso }: { iso: string }) => <time>{iso}</time> }))

import { JobActions } from '../JobActions'
import { JobNotFound } from '../JobNotFound'
import { JobViewerBanner } from '../JobViewerBanner'

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: null, loading: false, refreshUser: vi.fn() }
    nav.params = { slug: 'senior-pentester-abc123' }
})

describe('JobActions', () => {
    it('shows a visitor apply, a sign-in link to save, and no report button', async () => {
        api.getJob.mockResolvedValue({ job: job(), meta: {} })
        renderWithClient(<JobActions jobRef="senior-pentester-abc123" initialJob={job()} initialUpdatedAt={Date.now()} />)
        expect(screen.getByTestId('apply')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Sign in to save/ })).toBeInTheDocument()
        expect(screen.queryByTestId('report-job')).not.toBeInTheDocument()
        // The page's view is counted from the browser: one read, even though the server already sent the job
        await waitFor(() => expect(api.getJob).toHaveBeenCalledTimes(1))
    })

    it('counts one view per page mount: the three readers of the page share one read', async () => {
        api.getJob.mockResolvedValue({ job: job(), meta: {} })
        const client = renderWithClient(
            <>
                <JobActions jobRef="senior-pentester-abc123" initialJob={job()} />
                <JobViewerBanner jobRef="senior-pentester-abc123" initialJob={job()} />
            </>,
        )
        await waitFor(() => expect(api.getJob).toHaveBeenCalledTimes(1))
        // A returning tab does not read it again
        window.dispatchEvent(new Event('focus'))
        document.dispatchEvent(new Event('visibilitychange'))
        await new Promise((r) => setTimeout(r, 30))
        expect(api.getJob).toHaveBeenCalledTimes(1)
        client.unmount()
    })

    it('shows a moderator who is not the poster no Edit link on the job page', async () => {
        auth.current = { user: { id: 'm1', role: 'moderator' }, loading: false, refreshUser: vi.fn() }
        api.getJob.mockResolvedValue({ job: job({ viewer: { saved: false, isOwner: false } }), meta: {} })
        renderWithClient(<JobActions jobRef="senior-pentester-abc123" initialJob={job()} />)
        await waitFor(() => expect(screen.getByTestId('save-job')).toBeEnabled())
        expect(screen.queryByRole('link', { name: /Edit/ })).not.toBeInTheDocument()
    })

    it('asks again with the member token and shows the saved state from that answer, not from the page', async () => {
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.getJob.mockResolvedValue({ job: job({ viewer: { saved: true, isOwner: false } }), meta: {} })
        renderWithClient(<JobActions jobRef="senior-pentester-abc123" initialJob={job()} initialUpdatedAt={Date.now()} />)
        // Until the member's own answer is here the button waits
        expect(screen.getByTestId('save-job')).toBeDisabled()
        await waitFor(() => expect(screen.getByTestId('save-job')).toBeEnabled())
        expect(screen.getByTestId('save-job')).toHaveAttribute('aria-pressed', 'true')
    })

    it('offers a member to report the job, but not the poster, who may edit it instead', async () => {
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.getJob.mockResolvedValue({ job: job({ viewer: { saved: false, isOwner: false } }), meta: {} })
        const { unmount } = renderWithClient(<JobActions jobRef="senior-pentester-abc123" initialJob={job()} />)
        await userEvent.click(await screen.findByTestId('report-job'))
        expect(await screen.findByRole('dialog')).toHaveTextContent('Report this job')
        unmount()

        auth.current = { user: { id: 'e1', role: 'employer' }, loading: false, refreshUser: vi.fn() }
        api.getJob.mockResolvedValue({ job: job({ viewer: { saved: false, isOwner: true } }), meta: {} })
        renderWithClient(<JobActions jobRef="senior-pentester-abc123" initialJob={job()} />)
        expect(await screen.findByRole('link', { name: /Edit/ })).toHaveAttribute('href', '/employer/edit/j1')
        expect(screen.queryByTestId('report-job')).not.toBeInTheDocument()
    })

    it('offers only the poster tools on a preview of a job that is not public', () => {
        auth.current = { user: { id: 'e1', role: 'employer' }, loading: false, refreshUser: vi.fn() }
        api.getJob.mockResolvedValue({ job: job({ status: 'draft', viewer: { saved: false, isOwner: true } }), meta: {} })
        renderWithClient(<JobActions jobRef="x-1" initialJob={job({ status: 'draft', viewer: { saved: false, isOwner: true } })} preview />)
        expect(screen.queryByTestId('apply')).not.toBeInTheDocument()
        expect(screen.queryByTestId('save-job')).not.toBeInTheDocument()
    })
})

describe('JobViewerBanner', () => {
    it('shows nothing to the public: the API sends no status', () => {
        const { container } = renderWithClient(<JobViewerBanner jobRef="x-1" initialJob={job()} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('tells the poster a rejected job was not approved, with the reason and a fix link', async () => {
        auth.current = { user: { id: 'e1', role: 'employer' }, loading: false, refreshUser: vi.fn() }
        const rejected = job({ status: 'rejected', moderation: { reason: 'Add a real apply link' }, applicationCount: 4, viewer: { saved: false, isOwner: true } })
        api.getJob.mockResolvedValue({ job: rejected, meta: {} })
        renderWithClient(<JobViewerBanner jobRef="x-1" initialJob={rejected} />)
        const banner = await screen.findByTestId('viewer-banner')
        await waitFor(() => expect(banner).toHaveTextContent('Rejected'))
        expect(screen.getByTestId('moderation-reason')).toHaveTextContent('Add a real apply link')
        expect(screen.getByRole('link', { name: /Fix and resubmit/ })).toHaveAttribute('href', '/employer/edit/j1')
        expect(banner).toHaveTextContent('4 apply clicks')
    })

    it('shows a reviewer the reports and the poster', async () => {
        auth.current = { user: { id: 'm1', role: 'moderator' }, loading: false, refreshUser: vi.fn() }
        const held = job({ status: 'pending', heldForReports: true, reportCount: 3, postedBy: { _id: 'p', name: 'Pat Poster' }, viewer: { saved: false, isOwner: false } })
        api.getJob.mockResolvedValue({ job: held, meta: {} })
        renderWithClient(<JobViewerBanner jobRef="x-1" initialJob={held} />)
        const banner = await screen.findByTestId('viewer-banner')
        await waitFor(() => expect(banner).toHaveTextContent('Held after reports'))
        expect(banner).toHaveTextContent('3 open reports')
        expect(banner).toHaveTextContent('Posted by Pat Poster')
    })
})

describe('JobNotFound (the preview a poster gets of a job the public cannot see)', () => {
    const missing = <p>This job is not available</p>
    afterEach(() => window.localStorage.removeItem('token'))

    it('keeps the server notice for a visitor and asks nothing', () => {
        renderWithClient(<JobNotFound missing={missing} />)
        expect(screen.getByText(/not available/i)).toBeInTheDocument()
        expect(api.getJob).not.toHaveBeenCalled()
    })

    it('asks again with the token of a signed-in member and shows their own draft', async () => {
        window.localStorage.setItem('token', 't')
        auth.current = { user: { id: 'e1', role: 'employer' }, loading: false, refreshUser: vi.fn() }
        api.getJob.mockResolvedValue({ job: job({ status: 'draft', title: 'My secret draft', viewer: { saved: false, isOwner: true } }), meta: {} })
        renderWithClient(<JobNotFound missing={missing} />)
        expect((await screen.findAllByText('My secret draft')).length).toBeGreaterThan(0)
        expect(api.getJob).toHaveBeenCalledWith('senior-pentester-abc123')
    })

    it('still says not available when the API answers 404 for a signed-in member too', async () => {
        window.localStorage.setItem('token', 't')
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        api.getJob.mockRejectedValue(new ApiError('nope', 404, 'JOB_NOT_FOUND'))
        renderWithClient(<JobNotFound missing={missing} />)
        expect(await screen.findByText(/not available/i)).toBeInTheDocument()
    })

    it('does not ask for a reference that cannot be a job', () => {
        window.localStorage.setItem('token', 't')
        auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
        nav.params = { slug: '../etc' }
        renderWithClient(<JobNotFound missing={missing} />)
        expect(screen.getByText(/not available/i)).toBeInTheDocument()
        expect(api.getJob).not.toHaveBeenCalled()
    })
})
