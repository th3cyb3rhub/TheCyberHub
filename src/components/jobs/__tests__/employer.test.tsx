import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { company, job } from '@/lib/jobs/__tests__/fixtures'
import type { EmployerJob, JobStatus } from '@/types/job'
import { renderWithClient } from './utils'

const auth = vi.hoisted(() => ({
    current: { user: { id: 'e1', role: 'employer', email: 'me@acme.example', isVerified: true } as Record<string, unknown> | null, loading: false, refreshUser: vi.fn() },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const toast = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => toast }))
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: { id: 'j1' } as Record<string, string> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push, replace: nav.replace }), usePathname: () => '/employer', useParams: () => nav.params }))
const api = vi.hoisted(() => ({
    listMyJobs: vi.fn(), getMyStats: vi.fn(), getMyCompany: vi.fn(), createJob: vi.fn(), updateJob: vi.fn(), submitJob: vi.fn(), closeJob: vi.fn(),
    reopenJob: vi.fn(), deleteJob: vi.fn(), saveMyCompany: vi.fn(), becomeEmployer: vi.fn(), getJob: vi.fn(), resubmitMyCompany: vi.fn(),
}))
vi.mock('@/lib/api/jobs', () => api)
vi.mock('@/lib/jobs/revalidate', () => ({ refreshPublicJobs: vi.fn() }))
vi.mock('@/components/internships/ViewerTime', () => ({ ViewerTime: ({ iso }: { iso: string }) => <time>{iso}</time> }))

import { CompanyView } from '../employer/CompanyView'
import { EditJobView } from '../employer/EditJobView'
import { EmployerDashboard } from '../employer/EmployerDashboard'
import { EmployerGate } from '../employer/EmployerGate'
import { JobForm } from '../employer/JobForm'
import { SetupView } from '../employer/SetupView'

const row = (status: JobStatus, over: Partial<EmployerJob> = {}): EmployerJob => ({
    ...(job() as unknown as EmployerJob), _id: `id-${status}`, title: `A ${status} job`, status, applicationCount: 3, ...over,
})
const rows = (...list: EmployerJob[]) => ({ success: true, data: list, pagination: { page: 1, limit: 20, total: list.length, totalPages: 1, pages: 1, hasMore: false } })
const stats = { totalJobs: 6, activeJobs: 1, totalViews: 1234, totalApplications: 7, byStatus: { draft: 1, pending: 1, approved: 1, rejected: 1, closed: 1, expired: 1 } }

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'e1', role: 'employer', email: 'me@acme.example', isVerified: true }, loading: false, refreshUser: vi.fn() }
    api.getMyStats.mockResolvedValue(stats)
    api.getMyCompany.mockResolvedValue(company({ status: 'pending' }))
})

describe('EmployerGate', () => {
    it('lets employers, administrators and owners in', () => {
        for (const role of ['employer', 'admin', 'owner']) {
            auth.current = { user: { id: 'x', role }, loading: false, refreshUser: vi.fn() }
            const { unmount } = renderWithClient(<EmployerGate returnTo="/employer"><p>inside</p></EmployerGate>)
            expect(screen.getByText('inside')).toBeInTheDocument()
            unmount()
        }
    })

    it('points a moderator to the queue and a member to the become-employer flow', () => {
        auth.current = { user: { id: 'm', role: 'moderator' }, loading: false, refreshUser: vi.fn() }
        const { unmount } = renderWithClient(<EmployerGate returnTo="/employer"><p>inside</p></EmployerGate>)
        expect(screen.queryByText('inside')).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Open the review queue' })).toHaveAttribute('href', '/admin/jobs')
        unmount()
        auth.current = { user: { id: 'u', role: 'user' }, loading: false, refreshUser: vi.fn() }
        renderWithClient(<EmployerGate returnTo="/employer"><p>inside</p></EmployerGate>)
        expect(screen.getByRole('link', { name: 'Become an employer' })).toHaveAttribute('href', '/employer/setup')
    })

    it('sends a visitor to sign in and brings them back', () => {
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        renderWithClient(<EmployerGate returnTo="/employer/company"><p>inside</p></EmployerGate>)
        expect(nav.replace).toHaveBeenCalledWith('/auth?redirect=%2Femployer%2Fcompany')
    })
})

describe('EmployerDashboard', () => {
    const all = () => rows(row('draft'), row('pending'), row('approved'), row('rejected', { moderation: { reason: 'Add the salary and a real apply link' } }), row('closed'), row('expired'))

    it('shows a chip for every status, with the reason a reviewer gave', async () => {
        api.listMyJobs.mockResolvedValue(all())
        renderWithClient(<EmployerDashboard />)
        const items = await screen.findAllByTestId('employer-job')
        expect(items.map((i) => i.getAttribute('data-status'))).toEqual(['draft', 'pending', 'approved', 'rejected', 'closed', 'expired'])
        expect(within(items[1]).getByTestId('job-status')).toHaveTextContent('Under review')
        expect(within(items[2]).getByTestId('job-status')).toHaveTextContent('Live')
        const rejected = items[3]
        expect(within(rejected).getByTestId('reject-reason')).toHaveTextContent('Add the salary and a real apply link')
        expect(within(rejected).getByTestId('fix-resubmit')).toHaveAttribute('href', '/employer/edit/id-rejected')
        expect(screen.getByTestId('stat-apply-clicks')).toHaveTextContent('7')
    })

    it('offers the actions each status allows and no others', async () => {
        api.listMyJobs.mockResolvedValue(all())
        renderWithClient(<EmployerDashboard />)
        const items = await screen.findAllByTestId('employer-job')
        const has = (el: HTMLElement, id: string) => within(el).queryByTestId(id) !== null
        // draft: send for review, close, delete. pending: close only. approved: close.
        expect([has(items[0], 'submit-job'), has(items[0], 'close-job'), has(items[0], 'delete-job')]).toEqual([true, true, true])
        expect([has(items[1], 'submit-job'), has(items[1], 'close-job'), has(items[1], 'delete-job')]).toEqual([false, true, false])
        expect([has(items[2], 'submit-job'), has(items[2], 'close-job'), has(items[2], 'reopen-job')]).toEqual([false, true, false])
        expect([has(items[4], 'reopen-job'), has(items[4], 'close-job')]).toEqual([true, false])
        expect(has(items[5], 'reopen-job')).toBe(true)
    })

    it('shows an approved job past its end date as expired', async () => {
        api.listMyJobs.mockResolvedValue(rows(row('approved', { expiresAt: '2000-01-01T00:00:00.000Z' })))
        renderWithClient(<EmployerDashboard />)
        expect(await screen.findByTestId('job-status')).toHaveTextContent('Expired')
    })

    it('submits a draft', async () => {
        api.listMyJobs.mockResolvedValue(rows(row('draft')))
        api.submitJob.mockResolvedValue(job({ status: 'pending' }))
        renderWithClient(<EmployerDashboard />)
        await userEvent.click(await screen.findByTestId('submit-job'))
        await waitFor(() => expect(api.submitJob).toHaveBeenCalledWith('id-draft'))
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: expect.stringMatching(/review/) })
    })

    it('closes a job, and tells the poster when it had already moved on', async () => {
        api.listMyJobs.mockResolvedValue(rows(row('approved')))
        api.closeJob.mockRejectedValue(new ApiError('x', 409, 'JOB_INVALID_TRANSITION', undefined, { status: 'closed', to: 'closed' }))
        renderWithClient(<EmployerDashboard />)
        await userEvent.click(await screen.findByTestId('close-job'))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ variant: 'error', message: expect.stringMatching(/closed/) }))
    })

    it('reopens a closed job with a new end date chosen in a dialog', async () => {
        api.listMyJobs.mockResolvedValue(rows(row('closed')))
        api.reopenJob.mockResolvedValue(job({ status: 'approved' }))
        renderWithClient(<EmployerDashboard />)
        await userEvent.click(await screen.findByTestId('reopen-job'))
        await userEvent.selectOptions(screen.getByLabelText('Keep it public for'), '60')
        await userEvent.click(screen.getByTestId('confirm-reopen'))
        await waitFor(() => expect(api.reopenJob).toHaveBeenCalledWith('id-closed', expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)))
        const days = (Date.parse(api.reopenJob.mock.calls[0][1]) - Date.now()) / 86_400_000
        expect(days).toBeGreaterThan(59)
        expect(days).toBeLessThanOrEqual(60)
    })

    it('asks before it deletes', async () => {
        api.listMyJobs.mockResolvedValue(rows(row('draft')))
        api.deleteJob.mockResolvedValue(undefined)
        renderWithClient(<EmployerDashboard />)
        await userEvent.click(await screen.findByTestId('delete-job'))
        expect(api.deleteJob).not.toHaveBeenCalled()
        const deletes = screen.getAllByRole('button', { name: 'Delete' })
        await userEvent.click(deletes[deletes.length - 1])
        await waitFor(() => expect(api.deleteJob).toHaveBeenCalledWith('id-draft'))
    })

    it('filters by status through the API', async () => {
        api.listMyJobs.mockResolvedValue(all())
        renderWithClient(<EmployerDashboard />)
        await screen.findAllByTestId('employer-job')
        api.listMyJobs.mockResolvedValue(rows(row('pending')))
        await userEvent.click(screen.getByRole('button', { name: /^Under review/ }))
        await waitFor(() => expect(api.listMyJobs).toHaveBeenLastCalledWith({ status: 'pending', page: 1, limit: 20 }))
        expect(screen.getByRole('button', { name: /^Under review/ })).toHaveAttribute('aria-pressed', 'true')
    })

    it('says what the company status means, and what to do when it was rejected', async () => {
        api.listMyJobs.mockResolvedValue(rows())
        api.getMyCompany.mockResolvedValue(company({ status: 'rejected', moderation: { reason: 'Website is empty' } }))
        renderWithClient(<EmployerDashboard />)
        const card = await screen.findByTestId('company-card')
        expect(card).toHaveTextContent('Rejected')
        expect(card).toHaveTextContent('Website is empty')
        expect(within(card).getByRole('link', { name: 'Fix the profile' })).toHaveAttribute('href', '/employer/company')
        // A save does not send it back to review any more: the owner asks
        expect(card).not.toHaveTextContent(/save to send it back/)
        expect(card).toHaveTextContent(/ask for a new review/)
        expect(within(card).getByTestId('resubmit-company')).toBeInTheDocument()
    })

    it('asks for a new review from the banner of a rejected company', async () => {
        api.listMyJobs.mockResolvedValue(rows())
        api.getMyCompany.mockResolvedValue(company({ status: 'rejected' }))
        api.resubmitMyCompany.mockResolvedValue(company({ status: 'pending' }))
        renderWithClient(<EmployerDashboard />)
        await userEvent.click(await screen.findByTestId('resubmit-company'))
        await waitFor(() => expect(api.resubmitMyCompany).toHaveBeenCalledTimes(1))
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: expect.stringMatching(/new review/) })
    })

    it('does not tell an administrator to add a company profile', async () => {
        auth.current = { user: { id: 'a1', role: 'admin' }, loading: false, refreshUser: vi.fn() }
        api.listMyJobs.mockResolvedValue(rows())
        api.getMyCompany.mockResolvedValue(null)
        renderWithClient(<EmployerDashboard />)
        expect(await screen.findByTestId('admin-no-company')).toHaveTextContent(/no company profile is needed/)
        expect(screen.queryByRole('link', { name: 'Create company profile' })).not.toBeInTheDocument()
        expect(screen.queryByText(/Add your company profile/)).not.toBeInTheDocument()
    })

    it('asks for a company profile when there is none, and shows an empty list kindly', async () => {
        api.listMyJobs.mockResolvedValue(rows())
        api.getMyCompany.mockResolvedValue(null)
        renderWithClient(<EmployerDashboard />)
        expect(await screen.findByRole('link', { name: 'Create company profile' })).toBeInTheDocument()
        expect(await screen.findByText('You have not posted a job yet.')).toBeInTheDocument()
    })
})

describe('JobForm', () => {
    const fillRequired = async () => {
        await userEvent.type(screen.getByLabelText(/Job title/), 'Senior Pentester')
        await userEvent.type(screen.getByLabelText(/^Description/), 'We need somebody to break our products before somebody else does, and to write it up.')
    }

    it('checks the limits first and focuses the first problem', async () => {
        renderWithClient(<JobForm />)
        await userEvent.click(screen.getByTestId('save-job-form'))
        expect(await screen.findByTestId('form-banner')).toHaveTextContent(/2 problems/)
        expect(api.createJob).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.getByLabelText(/Job title/)).toHaveFocus())
        expect(screen.getByLabelText(/Job title/)).toHaveAttribute('aria-invalid', 'true')
    })

    it('posts a job, says it went to review and goes back to the dashboard', async () => {
        api.createJob.mockResolvedValue(job({ status: 'pending' }))
        renderWithClient(<JobForm companyName="Acme Security" />)
        await fillRequired()
        await userEvent.click(screen.getByTestId('save-job-form'))
        await waitFor(() => expect(api.createJob).toHaveBeenCalledTimes(1))
        const body = api.createJob.mock.calls[0][0]
        expect(body).toMatchObject({ title: 'Senior Pentester' })
        expect(body).not.toHaveProperty('saveAsDraft')
        expect(body).not.toHaveProperty('company')
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: expect.stringMatching(/review/) })
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/employer'))
    })

    it('saves a draft with saveAsDraft', async () => {
        api.createJob.mockResolvedValue(job({ status: 'draft' }))
        renderWithClient(<JobForm />)
        await fillRequired()
        await userEvent.click(screen.getByTestId('save-draft'))
        await waitFor(() => expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({ saveAsDraft: true })))
    })

    it('keeps what was typed and shows the server field errors next to their fields', async () => {
        api.createJob.mockRejectedValue(new ApiError('bad', 400, 'VALIDATION_ERROR', [{ field: 'applyUrl', message: 'That address is not allowed' }]))
        renderWithClient(<JobForm />)
        await fillRequired()
        await userEvent.click(screen.getByTestId('save-job-form'))
        expect(await screen.findByText('That address is not allowed')).toBeInTheDocument()
        expect(screen.getByLabelText(/Job title/)).toHaveValue('Senior Pentester')
        expect(nav.push).not.toHaveBeenCalled()
    })

    it.each([
        [new ApiError('x', 409, 'JOB_LIMIT_REACHED', undefined, { limit: 10 }), /10 open jobs/],
        [new ApiError('x', 403, 'EMAIL_NOT_VERIFIED'), /Confirm your email/],
        [new ApiError('x', 403, 'EMPLOYER_EMAIL_NOT_ORG'), /Free mail providers/],
    ])('shows the message for %#', async (error, text) => {
        api.createJob.mockRejectedValue(error)
        renderWithClient(<JobForm />)
        await fillRequired()
        await userEvent.click(screen.getByTestId('save-job-form'))
        expect(await screen.findByTestId('form-banner')).toHaveTextContent(text)
    })

    it('links to the company profile when the company was rejected', async () => {
        api.createJob.mockRejectedValue(new ApiError('x', 403, 'COMPANY_REJECTED', undefined, { reason: 'Website is empty' }))
        renderWithClient(<JobForm />)
        await fillRequired()
        await userEvent.click(screen.getByTestId('save-job-form'))
        const banner = await screen.findByTestId('form-banner')
        expect(banner).toHaveTextContent('Website is empty')
        expect(within(banner).getByRole('link', { name: 'Open your company profile' })).toHaveAttribute('href', '/employer/company')
    })

    it('edits a rejected job: shows the reason, then saves and resubmits in one step', async () => {
        const rejected = job({ status: 'rejected', moderation: { reason: 'Add the salary' } })
        api.updateJob.mockResolvedValue(rejected)
        api.submitJob.mockResolvedValue(job({ status: 'pending' }))
        renderWithClient(<JobForm job={rejected} />)
        expect(screen.getByTestId('rejected-note')).toHaveTextContent('Add the salary')
        await userEvent.clear(screen.getByLabelText('Lowest pay'))
        await userEvent.type(screen.getByLabelText('Lowest pay'), '80000')
        await userEvent.click(screen.getByTestId('save-resubmit'))
        await waitFor(() => expect(api.submitJob).toHaveBeenCalledWith('j1'))
        expect(api.updateJob).toHaveBeenCalledWith('j1', expect.objectContaining({ salary: expect.objectContaining({ min: 80000 }) }))
        expect(api.updateJob.mock.invocationCallOrder[0]).toBeLessThan(api.submitJob.mock.invocationCallOrder[0])
    })

    it('warns that an edit of a live job can send it back to review', () => {
        renderWithClient(<JobForm job={job({ status: 'approved' })} />)
        expect(screen.getByText(/sends a live job back to review/)).toBeInTheDocument()
    })

    it('shows the company fields to administrators only', () => {
        const { unmount } = renderWithClient(<JobForm />)
        expect(screen.queryByText(/Company \(administrators/)).not.toBeInTheDocument()
        unmount()
        renderWithClient(<JobForm admin />)
        expect(screen.getByLabelText(/Company name/)).toBeInTheDocument()
    })

    it('adds and removes list rows and picks common benefits', async () => {
        renderWithClient(<JobForm />)
        await userEvent.click(screen.getByRole('button', { name: 'Conference budget' }))
        expect(screen.getByRole('button', { name: 'Conference budget' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByLabelText('Benefits, benefit 1')).toHaveValue('Conference budget')
        await userEvent.click(screen.getByRole('button', { name: 'Conference budget' }))
        expect(screen.getByLabelText('Benefits, benefit 1')).toHaveValue('')
    })

    it('holds a click on a link while there are unsaved changes', async () => {
        renderWithClient(<JobForm />)
        await userEvent.type(screen.getByLabelText(/Job title/), 'Draft in progress')
        fireEvent.click(screen.getByRole('link', { name: 'Cancel' }))
        expect(await screen.findByText('Leave without saving?')).toBeInTheDocument()
        expect(nav.push).not.toHaveBeenCalled()
    })
})

describe('EditJobView', () => {
    it('loads the job and fills the form', async () => {
        api.getJob.mockResolvedValue({ job: job({ status: 'draft', viewer: { saved: false, isOwner: true } }), meta: {} })
        renderWithClient(<EditJobView />)
        expect(await screen.findByLabelText(/Job title/)).toHaveValue('Senior Pentester')
        expect(api.getJob).toHaveBeenCalledWith('j1')
    })

    it('says the same for a job that is not found and one that is not theirs', async () => {
        api.getJob.mockRejectedValue(new ApiError('nope', 404, 'JOB_NOT_FOUND'))
        const { unmount } = renderWithClient(<EditJobView />)
        expect(await screen.findByText(/does not exist, or it is not yours/)).toBeInTheDocument()
        unmount()
        api.getJob.mockResolvedValue({ job: job({ status: 'approved', viewer: { saved: false, isOwner: false } }), meta: {} })
        renderWithClient(<EditJobView />)
        expect(await screen.findByText(/belongs to somebody else/)).toBeInTheDocument()
    })
})

describe('company profile and the become-employer flow', () => {
    it('saves the profile and says a verified company that renames goes back to review', async () => {
        api.getMyCompany.mockResolvedValue(company({ status: 'verified' }))
        api.saveMyCompany.mockResolvedValue(company({ status: 'pending' }))
        renderWithClient(<CompanyView />)
        const name = await screen.findByLabelText(/Company name/)
        expect(screen.getByText(/sends a verified company back to review/)).toBeInTheDocument()
        // The logo and the website follow the same rule
        expect(screen.getByText(/A new logo is reviewed before the public sees it/)).toBeInTheDocument()
        expect(screen.getByText(/A new website is reviewed before the public sees it/)).toBeInTheDocument()
        await userEvent.clear(name)
        await userEvent.type(name, 'Acme Labs')
        await userEvent.click(screen.getByTestId('save-company'))
        await waitFor(() => expect(api.saveMyCompany).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme Labs' })))
        expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: expect.stringMatching(/reviewer/) })
    })

    it('shows the reason a rejected company was turned down', async () => {
        api.getMyCompany.mockResolvedValue(company({ status: 'rejected', moderation: { reason: 'We could not find your site' } }))
        renderWithClient(<CompanyView />)
        expect(await screen.findByTestId('company-reject-reason')).toHaveTextContent('We could not find your site')
        expect(screen.queryByRole('link', { name: /View public page/ })).not.toBeInTheDocument()
    })

    it('asks for a new review of a rejected company, and says when it is too soon in the viewer\'s zone', async () => {
        api.getMyCompany.mockResolvedValue(company({ status: 'rejected', moderation: { reason: 'No site' } }))
        const retryAt = '2030-03-10T15:30:00.000Z'
        api.resubmitMyCompany.mockRejectedValueOnce(new ApiError('x', 409, 'COMPANY_RESUBMIT_TOO_SOON', undefined, { retryAt }))
        renderWithClient(<CompanyView />)
        const box = await screen.findByTestId('resubmit-box')
        expect(screen.getByTestId('company-review')).toHaveTextContent(/Saving the profile does not change that/)
        expect(screen.getByTestId('company-review')).not.toHaveTextContent(/save: that sends it back/)
        await userEvent.click(within(box).getByTestId('resubmit-company'))
        const shown = new Date(retryAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
        expect(await within(box).findByTestId('resubmit-error')).toHaveTextContent(`from ${shown}`)
        // Nothing was toasted: the answer sits beside the button
        expect(toast.addToast).not.toHaveBeenCalled()
        api.resubmitMyCompany.mockResolvedValueOnce(company({ status: 'pending' }))
        await userEvent.click(within(box).getByTestId('resubmit-company'))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: expect.stringMatching(/new review/) }))
    })

    it('explains a company that is not rejected any more (COMPANY_NOT_REJECTED)', async () => {
        api.getMyCompany.mockResolvedValue(company({ status: 'rejected' }))
        api.resubmitMyCompany.mockRejectedValue(new ApiError('x', 409, 'COMPANY_NOT_REJECTED'))
        renderWithClient(<CompanyView />)
        await userEvent.click(await screen.findByTestId('resubmit-company'))
        expect(await screen.findByTestId('resubmit-error')).toHaveTextContent(/turned down/)
    })

    it('tells a saved rejected company it is still rejected', async () => {
        api.getMyCompany.mockResolvedValue(company({ status: 'rejected' }))
        api.saveMyCompany.mockResolvedValue(company({ status: 'rejected' }))
        renderWithClient(<CompanyView />)
        await userEvent.click(await screen.findByTestId('save-company'))
        await waitFor(() => expect(toast.addToast).toHaveBeenCalledWith({ variant: 'success', message: expect.stringMatching(/still rejected/) }))
    })

    it('shows the owner what the public page shows and that a change waits for a reviewer', async () => {
        api.getMyCompany.mockResolvedValue(company({
            name: 'Acme Labs', website: 'https://labs.example', status: 'pending', reviewed: { name: 'Acme Security', website: 'https://acme.example', logo: null },
        }))
        renderWithClient(<CompanyView />)
        const shows = await screen.findByTestId('public-shows')
        expect(shows).toHaveTextContent('The public page shows: Acme Security')
        expect(screen.getByTestId('pending-change')).toHaveTextContent('Your saved name and website changes wait for a reviewer')
        expect(screen.getByTestId('pending-change')).not.toHaveTextContent(/logo/i)
    })

    it('says so when nobody approved the profile yet', async () => {
        api.getMyCompany.mockResolvedValue(company({ status: 'pending', reviewed: null }))
        renderWithClient(<CompanyView />)
        expect(await screen.findByTestId('public-shows')).toHaveTextContent(/Nobody has approved this profile yet/)
        expect(screen.queryByTestId('pending-change')).not.toBeInTheDocument()
    })

    it('refuses a bad link before it sends', async () => {
        api.getMyCompany.mockResolvedValue(null)
        renderWithClient(<CompanyView />)
        await userEvent.type(await screen.findByLabelText(/Company name/), 'Acme')
        await userEvent.type(screen.getByLabelText('Website'), 'javascript:alert(1)')
        await userEvent.click(screen.getByTestId('save-company'))
        expect(await screen.findByText(/must be a link that starts with http/)).toBeInTheDocument()
        expect(api.saveMyCompany).not.toHaveBeenCalled()
    })

    describe('SetupView', () => {
        beforeEach(() => {
            auth.current = { user: { id: 'u1', role: 'user', email: 'me@acme.example', isVerified: true, organization: { name: 'Acme' } }, loading: false, refreshUser: vi.fn().mockResolvedValue(undefined) }
        })

        it('registers the company, reads the account again and opens the dashboard', async () => {
            api.becomeEmployer.mockResolvedValue(company({ status: 'pending' }))
            renderWithClient(<SetupView />)
            expect(screen.getByLabelText(/Company name/)).toHaveValue('Acme')
            await userEvent.click(screen.getByTestId('save-company'))
            await waitFor(() => expect(api.becomeEmployer).toHaveBeenCalledWith(expect.objectContaining({ name: 'Acme' })))
            await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/employer'))
            expect((auth.current.refreshUser as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
        })

        it.each([
            ['EMAIL_NOT_VERIFIED', /Confirm your email/],
            ['EMPLOYER_EMAIL_NOT_ORG', /organisation.*domain/],
        ])('shows the %s message and stays on the form', async (code, text) => {
            api.becomeEmployer.mockRejectedValue(new ApiError('x', 403, code))
            renderWithClient(<SetupView />)
            await userEvent.click(screen.getByTestId('save-company'))
            expect(await screen.findByTestId('form-banner')).toHaveTextContent(text)
            expect(nav.replace).not.toHaveBeenCalledWith('/employer')
        })

        it('warns about an unconfirmed email before the member tries', () => {
            auth.current = { ...auth.current, user: { id: 'u1', role: 'user', email: 'me@acme.example', isVerified: false } }
            renderWithClient(<SetupView />)
            expect(screen.getByText(/not confirmed yet/)).toBeInTheDocument()
        })

        it('sends an employer who already has the role to the dashboard', async () => {
            auth.current = { ...auth.current, user: { id: 'e1', role: 'employer', email: 'me@acme.example' } }
            renderWithClient(<SetupView />)
            await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/employer'))
        })
    })
})
