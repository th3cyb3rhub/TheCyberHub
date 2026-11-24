import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ApplicationProgress, ApplicationTimeline } from '../ApplicationTimeline'

describe('ApplicationTimeline', () => {
    const history = [
        { status: 'pending' as const, at: '2026-12-01T10:00:00.000Z' },
        { status: 'reviewing' as const, at: '2026-12-02T10:00:00.000Z', note: 'Reading your <b>repo</b>' },
        { status: 'accepted' as const, at: '2026-12-03T10:00:00.000Z', note: 'Welcome aboard' },
    ]

    it('lists the entries oldest first with dates, marks the current one and shows reviewer notes as text', () => {
        render(<ApplicationTimeline history={history} status="accepted" />)
        const items = within(screen.getByRole('list', { name: 'Status timeline' })).getAllByRole('listitem')
        expect(items).toHaveLength(3)
        expect(items[0]).toHaveTextContent('Pending')
        expect(items[0]).toHaveTextContent('Dec 1, 2026')
        expect(items[2]).toHaveAttribute('aria-current', 'step')
        expect(items[0]).not.toHaveAttribute('aria-current')
        // Plain text: the markup is shown, not rendered
        expect(items[1]).toHaveTextContent('Reading your <b>repo</b>')
        expect(items[1].querySelector('b')).toBeNull()
        expect(items[1]).toHaveTextContent('Reviewer note')
        expect(items[2]).toHaveTextContent('You are in')
    })

    it('calls the note on a withdrawal the applicant own reason', () => {
        render(<ApplicationTimeline history={[{ status: 'pending', at: '2026-12-01T10:00:00.000Z' }, { status: 'withdrawn', at: '2026-12-02T10:00:00.000Z', note: 'Another offer' }]} status="withdrawn" />)
        expect(screen.getByTestId('timeline-note')).toHaveTextContent('Your reason')
    })

    it('shows who made each move to staff only', () => {
        render(<ApplicationTimeline staff status="reviewing" history={[{ status: 'pending', at: '2026-12-01T10:00:00.000Z', actor: 'applicant' }, { status: 'reviewing', at: '2026-12-02T10:00:00.000Z', actor: 'staff', note: 'Looks good' }]} />)
        expect(screen.getByText('by the applicant')).toBeInTheDocument()
        expect(screen.getByText('by a reviewer')).toBeInTheDocument()
        expect(screen.getByTestId('timeline-note')).toHaveTextContent('Note to the applicant')
    })

    it('says so when there is no history', () => {
        render(<ApplicationTimeline history={[]} status="pending" />)
        expect(screen.getByText('No history yet.')).toBeInTheDocument()
    })
})

describe('ApplicationProgress', () => {
    it('names the current step for screen readers', () => {
        render(<ApplicationProgress status="reviewing" />)
        const steps = within(screen.getByTestId('application-progress')).getAllByRole('listitem')
        expect(steps[1]).toHaveAttribute('aria-current', 'step')
        expect(steps[0]).toHaveTextContent('(done)')
        expect(steps[2]).toHaveTextContent('(not reached yet)')
    })

    it('has no bar for a withdrawn application', () => {
        const { container } = render(<ApplicationProgress status="withdrawn" />)
        expect(container).toBeEmptyDOMElement()
    })
})
