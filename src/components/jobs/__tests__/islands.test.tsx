import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { renderWithClient } from './utils'

const auth = vi.hoisted(() => ({ current: { user: { id: 'u1', role: 'user' } as { id: string; role: string } | null, loading: false, refreshUser: vi.fn() } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const toast = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('@/context/ToastContext', () => ({ useToast: () => toast }))
vi.mock('next/navigation', () => ({ usePathname: () => '/jobs/senior-pentester-abc123', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
const api = vi.hoisted(() => ({ reportJob: vi.fn(), applyToJob: vi.fn(), saveJob: vi.fn(), unsaveJob: vi.fn() }))
vi.mock('@/lib/api/jobs', () => api)
vi.mock('@/lib/jobs/revalidate', () => ({ refreshPublicJobs: vi.fn() }))

import { ApplyPanel } from '../ApplyPanel'
import { ReportJobDialog } from '../ReportJobDialog'
import { SaveJobButton } from '../SaveJobButton'
import { CompanyStatusChip, JobStatusChip } from '../StatusChips'

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'u1', role: 'user' }, loading: false, refreshUser: vi.fn() }
})

describe('status chips', () => {
    it.each([
        ['draft', 'Draft'], ['pending', 'Under review'], ['approved', 'Live'], ['rejected', 'Rejected'], ['closed', 'Closed'], ['expired', 'Expired'],
    ] as const)('says %s in words for the poster', (status, words) => {
        const { unmount } = renderWithClient(<JobStatusChip status={status} />)
        const chip = screen.getByTestId('job-status')
        expect(chip).toHaveTextContent(words)
        expect(chip).toHaveAttribute('data-status', status)
        // An icon and a word: colour is never the only signal
        expect(chip.querySelector('svg')).not.toBeNull()
        unmount()
    })

    it('uses the reviewer words in the queue and names company states', () => {
        renderWithClient(<><JobStatusChip status="pending" audience="reviewer" /><CompanyStatusChip status="verified" /><CompanyStatusChip status="pending" /></>)
        expect(screen.getByText('Waiting for review')).toBeInTheDocument()
        expect(screen.getByText('Verified')).toBeInTheDocument()
        expect(screen.getByText('Under review')).toBeInTheDocument()
    })
})

describe('ReportJobDialog', () => {
    const open = () => renderWithClient(<ReportJobDialog open onOpenChange={vi.fn()} job={{ _id: 'j1', title: 'Senior Pentester' }} />)
    const pick = async (reason: RegExp) => { await userEvent.click(screen.getByRole('radio', { name: reason })) }

    it('needs a reason before it sends anything', () => {
        open()
        expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled()
        expect(api.reportJob).not.toHaveBeenCalled()
    })

    it('sends the reason and the details, closes and thanks the member', async () => {
        api.reportJob.mockResolvedValue(undefined)
        const onOpenChange = vi.fn()
        renderWithClient(<ReportJobDialog open onOpenChange={onOpenChange} job={{ _id: 'j1', title: 'Senior Pentester' }} />)
        await pick(/scam/i)
        await userEvent.type(screen.getByLabelText(/Details/), 'Asks for a deposit')
        await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
        await waitFor(() => expect(api.reportJob).toHaveBeenCalledWith('j1', { reason: 'scam', details: 'Asks for a deposit' }))
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
        expect(toast.addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success', title: 'Report sent' }))
    })

    it('says "already reported" on a 409 and offers nothing more to send', async () => {
        api.reportJob.mockRejectedValue(new ApiError('dup', 409))
        open()
        await pick(/spam/i)
        await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
        expect(await screen.findByTestId('report-error')).toHaveTextContent(/already reported/)
        expect(screen.queryByRole('button', { name: 'Send report' })).not.toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2)
    })

    it('keeps what was typed and tells the member to retry later on a 429', async () => {
        api.reportJob.mockRejectedValue(new ApiError('slow', 429, 'RATE_LIMIT_EXCEEDED', undefined, { retryAfter: 120 }))
        open()
        await pick(/misleading/i)
        await userEvent.type(screen.getByLabelText(/Details/), 'Wrong pay')
        await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
        expect(await screen.findByTestId('report-error')).toHaveTextContent(/2 minutes/)
        expect(screen.getByLabelText(/Details/)).toHaveValue('Wrong pay')
        expect(screen.getByRole('button', { name: 'Send report' })).toBeEnabled()
    })

    it('refuses a report of the own job (400) in plain words', async () => {
        api.reportJob.mockRejectedValue(new ApiError('own', 400, 'JOB_OWN_REPORT'))
        open()
        await pick(/inappropriate/i)
        await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
        expect(await screen.findByTestId('report-error')).toHaveTextContent(/your own job/)
    })

    it('says the job is gone on a 404', async () => {
        api.reportJob.mockRejectedValue(new ApiError('gone', 404, 'JOB_NOT_FOUND'))
        open()
        await pick(/broken/i)
        await userEvent.click(screen.getByRole('button', { name: 'Send report' }))
        expect(await screen.findByTestId('report-error')).toHaveTextContent(/not available/)
    })
})

describe('ApplyPanel', () => {
    it('counts the click, then opens the returned link without a handle on this page', async () => {
        api.applyToJob.mockResolvedValue({ applyUrl: 'https://careers.example/apply/1', applyEmail: null })
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        renderWithClient(<ApplyPanel id="j1" title="Senior Pentester" />)
        await userEvent.click(screen.getByTestId('apply'))
        await waitFor(() => expect(open).toHaveBeenCalledWith('https://careers.example/apply/1', '_blank', 'noopener,noreferrer'))
        expect(api.applyToJob).toHaveBeenCalledWith('j1')
        const fallback = within(screen.getByTestId('apply-result')).getByRole('link')
        expect(fallback).toHaveAttribute('href', 'https://careers.example/apply/1')
        expect(fallback.getAttribute('rel')).toMatch(/noopener/)
        expect(fallback.getAttribute('rel')).toMatch(/noreferrer/)
        open.mockRestore()
    })

    it('never opens a script link, even when the answer carries one', async () => {
        api.applyToJob.mockResolvedValue({ applyUrl: 'javascript:alert(1)', applyEmail: null })
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        renderWithClient(<ApplyPanel id="j1" title="Senior Pentester" />)
        await userEvent.click(screen.getByTestId('apply'))
        expect(await screen.findByTestId('apply-result')).toHaveTextContent(/has not given a way to apply/)
        expect(open).not.toHaveBeenCalled()
        expect(document.querySelector('a[href^="javascript"]')).toBeNull()
        open.mockRestore()
    })

    it('shows a mailto link when the employer takes applications by email, and opens no window', async () => {
        api.applyToJob.mockResolvedValue({ applyUrl: null, applyEmail: 'jobs@acme.example' })
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        renderWithClient(<ApplyPanel id="j1" title="Senior Pentester" />)
        await userEvent.click(screen.getByTestId('apply'))
        const link = await within(await screen.findByTestId('apply-result')).findByRole('link')
        expect(link).toHaveAttribute('href', expect.stringMatching(/^mailto:jobs@acme\.example\?subject=/))
        expect(open).not.toHaveBeenCalled()
        open.mockRestore()
    })

    it('says so when the call fails and lets the visitor try again', async () => {
        api.applyToJob.mockRejectedValueOnce(new ApiError('down', 500))
        renderWithClient(<ApplyPanel id="j1" title="Senior Pentester" />)
        await userEvent.click(screen.getByTestId('apply'))
        expect(await screen.findByRole('alert')).toBeInTheDocument()
        expect(screen.getByTestId('apply')).toBeEnabled()
    })

    it('works for a visitor who is not signed in', async () => {
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        api.applyToJob.mockResolvedValue({ applyUrl: null, applyEmail: null })
        renderWithClient(<ApplyPanel id="j1" title="x" />)
        await userEvent.click(screen.getByTestId('apply'))
        await waitFor(() => expect(api.applyToJob).toHaveBeenCalled())
    })
})

describe('SaveJobButton', () => {
    it('sends a visitor to sign in and back to the page', () => {
        auth.current = { user: null, loading: false, refreshUser: vi.fn() }
        renderWithClient(<SaveJobButton id="j1" title="Senior Pentester" saved={false} />)
        expect(screen.getByRole('link', { name: /Sign in to save/ })).toHaveAttribute('href', '/auth?redirect=%2Fjobs%2Fsenior-pentester-abc123')
        expect(screen.queryByTestId('save-job')).not.toBeInTheDocument()
    })

    it('saves and unsaves, and exposes the state to assistive technology', async () => {
        api.saveJob.mockResolvedValue(undefined)
        api.unsaveJob.mockResolvedValue(undefined)
        const { rerender } = renderWithClient(<SaveJobButton id="j1" title="Senior Pentester" saved={false} variant="icon" />)
        const button = screen.getByRole('button', { name: 'Save Senior Pentester' })
        expect(button).toHaveAttribute('aria-pressed', 'false')
        fireEvent.click(button)
        await waitFor(() => expect(api.saveJob).toHaveBeenCalledWith('j1'))
        rerender(<SaveJobButton id="j1" title="Senior Pentester" saved variant="icon" />)
        const saved = screen.getByRole('button', { name: 'Remove Senior Pentester from saved jobs' })
        expect(saved).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(saved)
        await waitFor(() => expect(api.unsaveJob).toHaveBeenCalledWith('j1'))
    })

    it('is disabled while the saved state is not known yet', () => {
        renderWithClient(<SaveJobButton id="j1" title="x" saved={false} pending />)
        expect(screen.getByTestId('save-job')).toBeDisabled()
    })
})
