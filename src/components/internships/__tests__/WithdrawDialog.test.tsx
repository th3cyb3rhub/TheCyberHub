import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const withdraw = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useInternships', () => ({ useWithdrawApplication: () => withdraw }))

import { WithdrawDialog } from '../WithdrawDialog'

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
})

/** A page like the real ones: a button opens the dialog, and a withdrawal removes that button */
function Page({ headingId = 'your-application' }: { headingId?: string }) {
    const [open, setOpen] = useState(false)
    const [gone, setGone] = useState(false)
    return (
        <div>
            <h2 id="your-application" tabIndex={-1}>Your application</h2>
            {!gone && <button onClick={() => setOpen(true)}>Open withdraw</button>}
            {open && <WithdrawDialog open onClose={() => { setOpen(false); setGone(true) }} statusHeadingId={headingId} applicationId="app1" />}
        </div>
    )
}

describe('WithdrawDialog focus', () => {
    it('moves focus to the status heading after a withdrawal removed the button that opened it', async () => {
        withdraw.mutate.mockImplementation((_v, opts) => opts?.onSuccess?.())
        render(<Page />)
        fireEvent.click(screen.getByRole('button', { name: 'Open withdraw' }))
        fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your application' })))
    })

    it('gives focus back to the opener when the person keeps the application', async () => {
        render(<PageKeep />)
        const opener = screen.getByRole('button', { name: 'Open withdraw' })
        opener.focus()
        fireEvent.click(opener)
        fireEvent.click(screen.getByRole('button', { name: 'Keep my application' }))
        await waitFor(() => expect(document.activeElement).toBe(opener))
        expect(withdraw.mutate).not.toHaveBeenCalled()
    })
})

function PageKeep() {
    const [open, setOpen] = useState(false)
    return (
        <div>
            <h2 id="your-application" tabIndex={-1}>Your application</h2>
            <button onClick={() => setOpen(true)}>Open withdraw</button>
            {open && <WithdrawDialog open onClose={() => setOpen(false)} statusHeadingId="your-application" applicationId="app1" />}
        </div>
    )
}
