import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { company, job } from '@/lib/jobs/__tests__/fixtures'
import type { AdminCompany, Job } from '@/types/job'
import { renderWithClient } from './utils'

const auth = vi.hoisted(() => ({ current: { user: { id: 'a1', role: 'moderator' } as { id: string; role: string } | null, loading: false, refreshUser: vi.fn() } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const toast = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => toast }))
const nav = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: nav.replace }), usePathname: () => '/admin/jobs' }))
const api = vi.hoisted(() => ({
    listAdminJobs: vi.fn(), getAdminStats: vi.fn(), listAdminCompanies: vi.fn(), approveJob: vi.fn(), rejectJob: vi.fn(), reviewReportedJob: vi.fn(), closeJob: vi.fn(),
    approveCompany: vi.fn(), rejectCompany: vi.fn(),
}))
vi.mock('@/lib/api/jobs', () => api)
const revalidate = vi.hoisted(() => ({ refreshPublicJobs: vi.fn() }))
vi.mock('@/lib/jobs/revalidate', () => revalidate)
vi.mock('@/components/internships/ViewerTime', () => ({ ViewerTime: ({ iso }: { iso: string }) => <time>{iso}</time> }))

import { AdminJobsView } from '../admin/AdminJobsView'

const queued = (id: string, over: Partial<Job> = {}): Job => job({
    _id: id, title: `Job ${id}`, slug: `job-${id}`, status: 'pending', updatedAt: `2030-01-0${id === 'b' ? 3 : 2}T10:00:00.000Z`,
    postedBy: { _id: 'p1', username: 'poster', name: 'Pat Poster', email: 'pat@acme.example', role: 'employer' }, ...over,
})
const list = (data: unknown[]) => ({ success: true, data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1, pages: 1, hasMore: false } })
const stats = { jobs: { pending: 2, approved: 1 }, live: 1, reported: 1, pendingCompanies: 1, moderationEnabled: true }

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'a1', role: 'moderator' }, loading: false, refreshUser: vi.fn() }
    api.getAdminStats.mockResolvedValue(stats)
    api.listAdminJobs.mockResolvedValue(list([queued('a'), queued('b')]))
    api.listAdminCompanies.mockResolvedValue(list([]))
})

describe('access', () => {
    it('lets moderators, administrators and owners review', async () => {
        for (const role of ['moderator', 'admin', 'owner']) {
            auth.current = { user: { id: 'x', role }, loading: false, refreshUser: vi.fn() }
            const { unmount } = renderWithClient(<AdminJobsView />)
            expect(await screen.findAllByTestId('admin-job')).toHaveLength(2)
            unmount()
        }
    })

    it('keeps members and employers out, and sends a visitor to sign in', () => {
        for (const role of ['user', 'employer']) {
            auth.current = { user: { id: 'x', role }, loading: false, refreshUser: vi.fn() }
            const { unmount } = renderWithClient(<AdminJobsView />)
            expect(screen.getByText(/Only moderators and administrators/)).toBeInTheDocument()
            unmount()
        }
        expect(api.listAdminJobs).not.toHaveBeenCalled()
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        renderWithClient(<AdminJobsView />)
        expect(nav.replace).toHaveBeenCalledWith('/auth?redirect=%2Fadmin%2Fjobs')
    })
})

describe('the queue', () => {
    it('shows the counters and asks for the oldest waiting jobs first', async () => {
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        expect(api.listAdminJobs).toHaveBeenCalledWith({ status: 'pending', sort: 'oldest', page: 1, limit: 20 })
        await waitFor(() => expect(screen.getByTestId('admin-stat-waiting-for-review')).toHaveTextContent('2'))
        expect(screen.getByTestId('admin-stat-reported')).toHaveTextContent('1')
        expect(screen.queryByTestId('moderation-off')).not.toBeInTheDocument()
    })

    it('says so when moderation is switched off', async () => {
        api.getAdminStats.mockResolvedValue({ ...stats, moderationEnabled: false })
        renderWithClient(<AdminJobsView />)
        expect(await screen.findByTestId('moderation-off')).toHaveTextContent(/queue is switched off/)
    })

    it('shows an empty queue kindly', async () => {
        api.listAdminJobs.mockResolvedValue(list([]))
        renderWithClient(<AdminJobsView />)
        expect(await screen.findByTestId('admin-empty')).toHaveTextContent(/queue is empty/)
    })

    it('approves one job, tells the reviewer and drops the cached public pages', async () => {
        api.approveJob.mockResolvedValue(queued('a', { status: 'approved' }))
        renderWithClient(<AdminJobsView />)
        const [first] = await screen.findAllByTestId('admin-job')
        await userEvent.click(within(first).getByTestId('approve-job'))
        // The decision is bound to what the row showed
        await waitFor(() => expect(api.approveJob).toHaveBeenCalledWith('a', { note: undefined, updatedAt: '2030-01-02T10:00:00.000Z' }))
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Approved: Job a' })
        await waitFor(() => expect(revalidate.refreshPublicJobs).toHaveBeenCalled())
    })

    it('lets the reviewer read the whole job, with the poster and where applicants go', async () => {
        api.listAdminJobs.mockResolvedValue(list([queued('a', { description: 'Hello <script>window.__x=1</script> world', applyUrl: 'https://careers.acme.example/a' })]))
        renderWithClient(<AdminJobsView />)
        const row = await screen.findByTestId('admin-job')
        const toggle = within(row).getByTestId('toggle-review')
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await userEvent.click(toggle)
        expect(toggle).toHaveAttribute('aria-expanded', 'true')
        const detail = within(row).getByTestId('review-detail')
        expect(detail).toHaveTextContent('Pat Poster')
        expect(detail).toHaveTextContent('pat@acme.example')
        expect(within(detail).getByRole('link', { name: /careers\.acme\.example/ })).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
        expect(detail.querySelector('script')).toBeNull()
    })
})

describe('reject', () => {
    it('needs a reason of at least 3 characters and sends it', async () => {
        api.rejectJob.mockResolvedValue(queued('a', { status: 'rejected' }))
        renderWithClient(<AdminJobsView />)
        const [first] = await screen.findAllByTestId('admin-job')
        await userEvent.click(within(first).getByTestId('reject-job'))
        const dialog = await screen.findByRole('dialog')
        await userEvent.type(within(dialog).getByLabelText(/Reason/), 'no')
        await userEvent.click(within(dialog).getByTestId('confirm-reject'))
        expect(await within(dialog).findByTestId('reason-error')).toHaveTextContent(/at least 3/)
        expect(api.rejectJob).not.toHaveBeenCalled()
        await userEvent.type(within(dialog).getByLabelText(/Reason/), 't a real role')
        await userEvent.click(within(dialog).getByTestId('confirm-reject'))
        await waitFor(() => expect(api.rejectJob).toHaveBeenCalledWith('a', 'not a real role', { updatedAt: '2030-01-02T10:00:00.000Z' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Rejected: Job a' })
    })

    it('keeps the dialog and the text when another reviewer decided first (409)', async () => {
        api.rejectJob.mockRejectedValue(new ApiError('x', 409, 'JOB_INVALID_TRANSITION', undefined, { status: 'rejected', to: 'rejected' }))
        renderWithClient(<AdminJobsView />)
        const [first] = await screen.findAllByTestId('admin-job')
        await userEvent.click(within(first).getByTestId('reject-job'))
        const dialog = await screen.findByRole('dialog')
        await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Missing apply link')
        await userEvent.click(within(dialog).getByTestId('confirm-reject'))
        expect(await within(dialog).findByTestId('reason-error')).toHaveTextContent(/changed since you opened it: it is rejected now/)
        expect(within(dialog).getByLabelText(/Reason/)).toHaveValue('Missing apply link')
    })

    it('closes with Escape and returns focus to the button that opened it', async () => {
        renderWithClient(<AdminJobsView />)
        const [first] = await screen.findAllByTestId('admin-job')
        const opener = within(first).getByTestId('reject-job')
        opener.focus()
        await userEvent.keyboard('{Enter}')
        await screen.findByRole('dialog')
        await userEvent.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(opener).toHaveFocus())
    })
})

describe('bulk approve', () => {
    it('asks first, then approves one by one and lists the ones that failed', async () => {
        api.approveJob
            .mockResolvedValueOnce(queued('a', { status: 'approved' }))
            .mockRejectedValueOnce(new ApiError('x', 409, 'JOB_INVALID_TRANSITION', undefined, { status: 'rejected' }))
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        const bulk = screen.getByTestId('bulk-approve')
        expect(bulk).toBeDisabled()
        await userEvent.click(screen.getByLabelText('Select all on this page'))
        expect(bulk).toBeEnabled()
        await userEvent.click(bulk)
        expect(api.approveJob).not.toHaveBeenCalled()
        await userEvent.click(await screen.findByRole('button', { name: 'Approve all selected' }))
        const result = await screen.findByTestId('bulk-result')
        expect(result).toHaveTextContent('1 of 2 approved, 1 could not be')
        expect(result).toHaveTextContent('Job b')
        expect(api.approveJob.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
    })

    it('has a labelled checkbox per row', async () => {
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        expect(screen.getByRole('checkbox', { name: 'Select Job a' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('checkbox', { name: 'Select Job a' }))
        expect(screen.getByTestId('bulk-approve')).toHaveTextContent('Approve 1 selected job')
    })
})

describe('reported jobs and the other tabs', () => {
    it('asks for the reported jobs, most reported first, and can dismiss the reports', async () => {
        api.reviewReportedJob.mockResolvedValue(undefined)
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        api.listAdminJobs.mockResolvedValue(list([queued('r', { status: 'approved', reportCount: 3 })]))
        await userEvent.click(screen.getByRole('tab', { name: /Reported/ }))
        const row = await screen.findByTestId('admin-job')
        await waitFor(() => expect(api.listAdminJobs).toHaveBeenLastCalledWith({ reported: true, status: 'all', sort: 'reports', page: 1, limit: 20 }))
        expect(within(row).getByTestId('report-count')).toHaveTextContent('3 open reports')
        await userEvent.click(within(row).getByTestId('dismiss-reports'))
        await waitFor(() => expect(api.reviewReportedJob).toHaveBeenCalledWith('r', 'dismiss'))
    })

    it('moves between the tabs with the arrow keys', async () => {
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        const first = screen.getByRole('tab', { name: /Waiting for review/ })
        first.focus()
        await userEvent.keyboard('{ArrowRight}')
        expect(screen.getByRole('tab', { name: /Reported/ })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('tab', { name: /Reported/ })).toHaveFocus()
    })

    it('filters all jobs by status and by search text', async () => {
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        await userEvent.click(screen.getByRole('tab', { name: 'All jobs' }))
        await userEvent.selectOptions(await screen.findByLabelText('Status'), 'closed')
        await waitFor(() => expect(api.listAdminJobs).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'closed', sort: 'newest' })))
        fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'acme' } })
        await waitFor(() => expect(api.listAdminJobs).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'closed', q: 'acme' })))
    })

    it('verifies and rejects companies, with a reason for the rejection', async () => {
        const row: AdminCompany = { ...company({ status: 'pending', updatedAt: '2030-02-01T00:00:00.000Z' }), owner: { _id: 'o1', username: 'owner', email: 'o@acme.example' }, jobs: { pending: 2 } }
        api.listAdminCompanies.mockResolvedValue(list([row]))
        api.approveCompany.mockResolvedValue(company({ status: 'verified' }))
        api.rejectCompany.mockResolvedValue(company({ status: 'rejected' }))
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        await userEvent.click(screen.getByRole('tab', { name: /Companies/ }))
        const card = await screen.findByTestId('admin-company')
        expect(api.listAdminCompanies).toHaveBeenLastCalledWith({ status: 'pending', page: 1, limit: 20 })
        expect(card).toHaveTextContent('o@acme.example')
        await userEvent.click(within(card).getByTestId('approve-company'))
        await waitFor(() => expect(api.approveCompany).toHaveBeenCalledWith('c1', { updatedAt: '2030-02-01T00:00:00.000Z' }))
        await userEvent.click(within(card).getByTestId('reject-company'))
        const dialog = await screen.findByRole('dialog')
        await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Website is empty')
        await userEvent.click(within(dialog).getByTestId('confirm-reject'))
        await waitFor(() => expect(api.rejectCompany).toHaveBeenCalledWith('c1', 'Website is empty', { updatedAt: '2030-02-01T00:00:00.000Z' }))
    })

    it('shows an error with a retry when the list cannot be loaded', async () => {
        api.listAdminJobs.mockRejectedValueOnce(new ApiError('down', 500))
        renderWithClient(<AdminJobsView />)
        expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load this list/)
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findAllByTestId('admin-job')).toHaveLength(2)
    })
})

describe('decisions are bound to what the reviewer saw', () => {
    it('sends each row\'s own updatedAt in a bulk approve', async () => {
        api.approveJob.mockResolvedValue(queued('a', { status: 'approved' }))
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        await userEvent.click(screen.getByLabelText('Select all on this page'))
        await userEvent.click(screen.getByTestId('bulk-approve'))
        await userEvent.click(await screen.findByRole('button', { name: 'Approve all selected' }))
        await screen.findByTestId('bulk-result')
        expect(api.approveJob.mock.calls).toEqual([
            ['a', { updatedAt: '2030-01-02T10:00:00.000Z' }],
            ['b', { updatedAt: '2030-01-03T10:00:00.000Z' }],
        ])
    })

    it('says the job changed since it was opened and shows the current copy in its row (JOB_STALE)', async () => {
        api.listAdminJobs.mockReset()
        api.listAdminJobs.mockResolvedValueOnce(list([queued('a')])).mockReturnValue(new Promise(() => {}))
        api.approveJob.mockRejectedValue(new ApiError('x', 409, 'JOB_STALE', undefined, { current: { _id: 'a', title: 'Job a, edited by the poster', updatedAt: '2030-01-09T10:00:00.000Z' } }))
        renderWithClient(<AdminJobsView />)
        const row = await screen.findByTestId('admin-job')
        await userEvent.click(within(row).getByTestId('approve-job'))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ variant: 'error', message: expect.stringMatching(/changed since you opened it/) }))
        expect(await screen.findByText('Job a, edited by the poster')).toBeInTheDocument()
    })

    it('reads a decision that lost to another reviewer (JOB_INVALID_TRANSITION) as a changed row', async () => {
        api.approveJob.mockRejectedValue(new ApiError('x', 409, 'JOB_INVALID_TRANSITION', undefined, { status: 'approved', to: 'approved' }))
        renderWithClient(<AdminJobsView />)
        const [first] = await screen.findAllByTestId('admin-job')
        await userEvent.click(within(first).getByTestId('approve-job'))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ variant: 'error', message: expect.stringMatching(/changed since you opened it: it is live now/) }))
        // The queue is read again afterwards
        await waitFor(() => expect(api.listAdminJobs.mock.calls.length).toBeGreaterThan(1))
    })

    it('gives a refusal for deciding on your own job its own message (SELF_REVIEW)', async () => {
        api.approveJob.mockRejectedValue(new ApiError('x', 403, 'SELF_REVIEW'))
        renderWithClient(<AdminJobsView />)
        const [first] = await screen.findAllByTestId('admin-job')
        await userEvent.click(within(first).getByTestId('approve-job'))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ variant: 'info', message: expect.stringMatching(/own job or company/) }))
    })

    it('does not offer approve or reject on a job the reviewer posted, nor a place in a bulk approve', async () => {
        auth.current = { user: { id: 'p1', role: 'admin' }, loading: false, refreshUser: vi.fn() }
        api.listAdminJobs.mockResolvedValue(list([queued('a'), queued('b', { postedBy: { _id: 'other', username: 'other' } })]))
        renderWithClient(<AdminJobsView />)
        const [mine, theirs] = await screen.findAllByTestId('admin-job')
        expect(within(mine).queryByTestId('approve-job')).not.toBeInTheDocument()
        expect(within(mine).queryByTestId('reject-job')).not.toBeInTheDocument()
        expect(within(mine).getByTestId('own-note')).toHaveTextContent(/Another reviewer has to decide/)
        expect(within(theirs).getByTestId('approve-job')).toBeInTheDocument()
        await userEvent.click(screen.getByLabelText('Select all on this page'))
        expect(screen.getByTestId('bulk-approve')).toHaveTextContent('Approve 1 selected job')
    })

    it('says the company changed since it was opened and puts its current copy in the row (COMPANY_STALE)', async () => {
        const row: AdminCompany = { ...company({ status: 'pending', updatedAt: '2030-02-01T00:00:00.000Z' }), owner: { _id: 'o1', username: 'owner' }, jobs: {} }
        api.listAdminCompanies.mockReset()
        api.listAdminCompanies.mockResolvedValueOnce(list([row])).mockReturnValue(new Promise(() => {}))
        api.approveCompany.mockRejectedValue(new ApiError('x', 409, 'COMPANY_STALE', undefined, { current: { _id: 'c1', name: 'Acme Renamed', status: 'pending', updatedAt: '2030-02-05T00:00:00.000Z' } }))
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        await userEvent.click(screen.getByRole('tab', { name: /Companies/ }))
        const card = await screen.findByTestId('admin-company')
        await userEvent.click(within(card).getByTestId('approve-company'))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ variant: 'error', message: expect.stringMatching(/company changed since you opened it/i) }))
        expect(await screen.findByText('Acme Renamed')).toBeInTheDocument()
        // The row kept what the list knows and the answer did not carry
        expect(screen.getByTestId('admin-company')).toHaveTextContent('owner')
    })
})

describe('closing a job as an administrator', () => {
    it('offers the reason field and sends it', async () => {
        auth.current = { user: { id: 'a1', role: 'admin' }, loading: false, refreshUser: vi.fn() }
        api.closeJob.mockResolvedValue(queued('a', { status: 'closed' }))
        renderWithClient(<AdminJobsView />)
        const [first] = await screen.findAllByTestId('admin-job')
        await userEvent.click(within(first).getByTestId('close-job'))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('(optional)')).toBeInTheDocument()
        await userEvent.type(within(dialog).getByLabelText(/Reason/), 'Duplicate of another posting')
        await userEvent.click(within(dialog).getByTestId('confirm-reject'))
        await waitFor(() => expect(api.closeJob).toHaveBeenCalledWith('a', 'Duplicate of another posting'))
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Closed: Job a. The poster was told.' })
    })

    it('closes without a reason, and moderators have no Close button', async () => {
        auth.current = { user: { id: 'a1', role: 'owner' }, loading: false, refreshUser: vi.fn() }
        api.closeJob.mockResolvedValue(queued('a', { status: 'closed' }))
        const { unmount } = renderWithClient(<AdminJobsView />)
        const [first] = await screen.findAllByTestId('admin-job')
        await userEvent.click(within(first).getByTestId('close-job'))
        await userEvent.click(within(await screen.findByRole('dialog')).getByTestId('confirm-reject'))
        await waitFor(() => expect(api.closeJob).toHaveBeenCalledWith('a', undefined))
        unmount()
        auth.current = { user: { id: 'a1', role: 'moderator' }, loading: false, refreshUser: vi.fn() }
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        expect(screen.queryByTestId('close-job')).not.toBeInTheDocument()
    })
})

describe('a company\'s saved change against what the public sees', () => {
    it('shows the reviewed name and each field that differs, to the reviewer', async () => {
        const row: AdminCompany = {
            ...company({ name: 'Acme New Name', website: 'https://new.example', logo: null, status: 'pending', reviewed: { name: 'Acme Security', website: 'https://acme.example', logo: null } }),
            owner: { _id: 'o1', username: 'owner' }, jobs: { approved: 3 },
        }
        api.listAdminCompanies.mockResolvedValue(list([row]))
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        await userEvent.click(screen.getByRole('tab', { name: /Companies/ }))
        const reviewed = await screen.findByTestId('company-reviewed')
        expect(reviewed).toHaveTextContent('The public page shows (last approved): Acme Security')
        const changes = screen.getByTestId('company-changes')
        expect(changes).toHaveTextContent('Name saved as Acme New Name, approved as Acme Security')
        expect(changes).toHaveTextContent('Website saved as https://new.example, approved as https://acme.example')
        expect(changes).not.toHaveTextContent('Logo')
    })

    it('hides Verify and Reject on the reviewer\'s own company', async () => {
        auth.current = { user: { id: 'o1', role: 'admin' }, loading: false, refreshUser: vi.fn() }
        const row: AdminCompany = { ...company({ status: 'pending' }), owner: { _id: 'o1', username: 'owner' }, jobs: {} }
        api.listAdminCompanies.mockResolvedValue(list([row]))
        renderWithClient(<AdminJobsView />)
        await screen.findAllByTestId('admin-job')
        await userEvent.click(screen.getByRole('tab', { name: /Companies/ }))
        const card = await screen.findByTestId('admin-company')
        expect(within(card).queryByTestId('approve-company')).not.toBeInTheDocument()
        expect(within(card).queryByTestId('reject-company')).not.toBeInTheDocument()
        expect(within(card).getByTestId('own-note')).toBeInTheDocument()
    })
})

describe('a locked job', () => {
    it('is marked for the reviewer', async () => {
        api.listAdminJobs.mockResolvedValue(list([queued('a', { moderation: { reason: 'No', locked: true } })]))
        renderWithClient(<AdminJobsView />)
        expect(await screen.findByTestId('job-locked')).toHaveTextContent('Locked')
    })
})
