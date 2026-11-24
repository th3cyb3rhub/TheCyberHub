import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FeedbackDialog, ReportDialog } from '../FeedbackDialog'
import { initialValues, toApplication } from '../MentorApplicationForm'
import { makeOwn } from '@/lib/mentorship/__tests__/fixtures'

describe('FeedbackDialog', () => {
    it('needs a rating', () => {
        const onSubmit = vi.fn()
        render(<FeedbackDialog open onOpenChange={vi.fn()} title="Rate" onSubmit={onSubmit} />)
        fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }))
        expect(onSubmit).not.toHaveBeenCalled()
        expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })

    it('offers to share a first name only to mentees, off by default', () => {
        const { rerender } = render(<FeedbackDialog open onOpenChange={vi.fn()} title="Rate" offerShareName onSubmit={vi.fn()} />)
        expect(screen.getByRole('checkbox')).not.toBeChecked()
        rerender(<FeedbackDialog open onOpenChange={vi.fn()} title="Rate" onSubmit={vi.fn()} />)
        expect(screen.queryByRole('checkbox')).toBeNull()
    })

    it('shows the API error inside the dialog', () => {
        render(<FeedbackDialog open onOpenChange={vi.fn()} title="Rate" error={Object.assign(new Error('x'), { status: 409, code: 'ALREADY_REVIEWED' })} onSubmit={vi.fn()} />)
        expect(screen.getByTestId('dialog-error')).toBeInTheDocument()
    })
})

describe('ReportDialog', () => {
    it('asks for a reason and sends the target and message id', () => {
        const onSubmit = vi.fn()
        render(<ReportDialog open onOpenChange={vi.fn()} target="message" messageId="m1" onSubmit={onSubmit} />)
        fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
        expect(onSubmit).not.toHaveBeenCalled()
        fireEvent.click(screen.getAllByRole('radio')[0])
        fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ target: 'message', messageId: 'm1' }))
    })
})

describe('mentor application values', () => {
    const base = { ...initialValues(null, 'Europe/Berlin'), expertiseAreas: ['osint' as const], bio: 'x'.repeat(60), preferredTimes: [{ dayOfWeek: 2, startHour: 9, endHour: 11 }, { dayOfWeek: 1, startHour: 18, endHour: 20 }] }

    it('defaults to the visitor zone', () => {
        expect(initialValues(null, 'Europe/Berlin').timezone).toBe('Europe/Berlin')
    })
    it('starts from an existing profile', () => {
        const v = initialValues(makeOwn())
        expect(v.bio).toContain('application security')
        expect(v.conductAccepted).toBe(true)
    })
    it('requires the conduct acceptance for a first application', () => {
        const r = toApplication({ ...base, conductAccepted: false }, true)
        expect(r.ok).toBe(false)
        expect(toApplication({ ...base, conductAccepted: false }, false).ok).toBe(true)
    })
    it('sorts the slots and sends numbers', () => {
        const r = toApplication({ ...base, conductAccepted: true }, true)
        expect(r.ok).toBe(true)
        if (r.ok) {
            expect(r.input.availability.preferredTimes[0].dayOfWeek).toBe(1)
            expect(r.input.maxMentees).toBe(3)
            expect(r.input.conductAccepted).toBe(true)
        }
    })
    it('reports an empty bio', () => {
        const r = toApplication({ ...base, bio: '', conductAccepted: true }, true)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.errors.bio).toBeTruthy()
    })
})
