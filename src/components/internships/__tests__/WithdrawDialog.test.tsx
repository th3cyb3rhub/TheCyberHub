import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const withdraw = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useInternships', () => ({ useWithdrawApplication: () => withdraw }))

import { focusAfterRender, WithdrawDialog } from '../WithdrawDialog'

beforeEach(() => { vi.clearAllMocks(); withdraw.isPending = false })

describe('WithdrawDialog', () => {
    it('sends the optional reason and closes when it worked', () => {
        const onClose = vi.fn()
        withdraw.mutate.mockImplementation((_v, opts) => opts?.onSuccess?.())
        render(<WithdrawDialog open onClose={onClose} applicationId="app1" cohortId="c1" cohortTitle="Summer Internship" />)
        expect(screen.getByRole('dialog', { name: 'Withdraw your application?' })).toBeInTheDocument()
        expect(screen.getByText(/cannot apply to this program again/)).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Found a job' } })
        fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
        expect(withdraw.mutate).toHaveBeenCalledWith({ id: 'app1', cohortId: 'c1', reason: 'Found a job' }, expect.any(Object))
        expect(onClose).toHaveBeenCalled()
    })

    it('warns that an accepted application gives the seat back', () => {
        render(<WithdrawDialog open onClose={vi.fn()} applicationId="app1" accepted />)
        expect(screen.getByText(/seat goes back/)).toBeInTheDocument()
    })

    it('does not withdraw when the user keeps the application', () => {
        const onClose = vi.fn()
        render(<WithdrawDialog open onClose={onClose} applicationId="app1" />)
        fireEvent.click(screen.getByRole('button', { name: 'Keep my application' }))
        expect(withdraw.mutate).not.toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('tells the screen after a successful withdrawal, and not after a refusal', () => {
        const onWithdrawn = vi.fn()
        withdraw.mutate.mockImplementationOnce(() => undefined) // the API refused: no onSuccess
        render(<WithdrawDialog open onClose={vi.fn()} onWithdrawn={onWithdrawn} applicationId="app1" />)
        fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
        expect(onWithdrawn).not.toHaveBeenCalled()
        withdraw.mutate.mockImplementationOnce((_v, opts) => opts?.onSuccess?.())
        fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
        expect(onWithdrawn).toHaveBeenCalledTimes(1)
    })
})

describe('focusAfterRender', () => {
    it('moves focus to the heading once the screen has settled', async () => {
        render(<h2 id="your-application" tabIndex={-1}>Your application</h2>)
        focusAfterRender('your-application')
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your application' }))
    })

    it('does nothing for an element that is not there', () => {
        expect(() => focusAfterRender('nope')).not.toThrow()
    })
})
