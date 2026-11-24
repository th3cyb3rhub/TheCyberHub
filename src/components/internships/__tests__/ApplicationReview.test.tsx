import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { COHORT_ID, makeCohort, makeRow, makeStaffApplication } from '@/lib/internships/__tests__/fixtures'

const auth = vi.hoisted(() => ({ current: { user: { id: 'staff1', role: 'moderator' } } }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const app = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const cohort = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const change = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useInternships', () => ({
    useStaffApplication: () => app.current,
    useInternship: () => cohort.current,
    useChangeApplicationStatus: () => change,
}))

import { ApplicationDrawer } from '../ApplicationReview'

const loaded = (a: unknown) => ({ data: a, isLoading: false, isError: false, refetch: vi.fn() })
const staffCohort = (over = {}) => ({ data: makeCohort({ acceptedCount: 2, capacity: 10, ...over }) })
const open = (row = makeRow()) => render(<ApplicationDrawer row={row} cohortId={COHORT_ID} onClose={vi.fn()} />)
const actionNames = () => within(screen.getByTestId('review-panel')).getAllByRole('button').map((b) => b.textContent)

beforeEach(() => {
    vi.clearAllMocks()
    auth.current = { user: { id: 'staff1', role: 'moderator' } }
    app.current = loaded(makeStaffApplication())
    cohort.current = staffCohort()
})

describe('ApplicationDrawer', () => {
    it('shows the applicant email to staff, and what they sent as plain text', () => {
        const { baseElement } = open()
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Grace Hopper')
        expect(dialog).toHaveTextContent('grace@example.org')
        expect(dialog).toHaveTextContent('Please pick me.')
        // the answer holds markup: it is shown, not run
        expect(dialog).toHaveTextContent('<img src=x onerror=alert(1)>')
        expect(baseElement.querySelector('img')).toBeNull()
        expect(within(dialog).getByRole('link', { name: /GitHub/ })).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
        expect(within(dialog).getByTestId('status-timeline')).toBeInTheDocument()
    })

    it('offers exactly the allowed moves for a pending application', () => {
        open()
        expect(actionNames()).toEqual(['Start review', 'Accept', 'Reject'])
    })

    it('offers only accept and reject for one in review', () => {
        app.current = loaded(makeStaffApplication({ status: 'reviewing' }))
        open(makeRow({ status: 'reviewing' }))
        expect(actionNames()).toEqual(['Accept', 'Reject'])
    })

    it.each(['accepted', 'rejected', 'withdrawn'] as const)('offers nothing for a %s application', (status) => {
        app.current = loaded(makeStaffApplication({ status }))
        open(makeRow({ status }))
        expect(screen.getByTestId('review-final')).toBeInTheDocument()
        expect(screen.queryByTestId('review-panel')).toBeNull()
    })

    it('asks for a note and a confirmation before it changes the status', () => {
        open()
        fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
        expect(change.mutate).not.toHaveBeenCalled()
        const confirm = screen.getByTestId('review-confirm')
        expect(confirm).toHaveTextContent('Accept this application?')
        fireEvent.change(within(confirm).getByLabelText(/Note to the applicant/), { target: { value: 'Welcome aboard' } })
        expect(within(confirm).getByLabelText(/Note to the applicant/)).toHaveAttribute('maxlength', '1000')
        fireEvent.click(screen.getByTestId('review-confirm-button'))
        expect(change.mutate).toHaveBeenCalledWith({ id: makeRow()._id, cohortId: COHORT_ID, status: 'accepted', note: 'Welcome aboard' }, expect.any(Object))
    })

    it('can be cancelled without changing anything', () => {
        open()
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(change.mutate).not.toHaveBeenCalled()
        expect(actionNames()).toEqual(['Start review', 'Accept', 'Reject'])
    })

    it('thanks the reviewer and says the applicant was told', () => {
        change.mutate.mockImplementation((_v, opts) => opts.onSuccess())
        open()
        fireEvent.click(screen.getByRole('button', { name: 'Start review' }))
        fireEvent.click(screen.getByTestId('review-confirm-button'))
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Application moved to in review. The applicant was notified.' })
    })

    it('shows your own application with every move off and the reason', () => {
        auth.current = { user: { id: 'u-applicant', role: 'moderator' } }
        open()
        expect(screen.getByTestId('self-review')).toHaveTextContent('This is your own application')
        for (const name of ['Start review', 'Accept', 'Reject']) expect(screen.getByRole('button', { name })).toBeDisabled()
    })

    it('turns acceptance off when the cohort is full, but not rejection', () => {
        cohort.current = staffCohort({ capacity: 2, acceptedCount: 2 })
        open()
        expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled()
        expect(screen.getByText(/Every seat is taken/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
    })

    it.each([
        [new ApiError('x', 409, 'INTERNSHIP_FULL'), /no seats left/],
        [new ApiError('x', 409, 'INTERNSHIP_INVALID_TRANSITION', undefined, { from: 'rejected', to: 'accepted', allowed: [] }), /already rejected/],
        [new ApiError('x', 403, 'INTERNSHIP_SELF_REVIEW'), /your own application/],
        [new ApiError('x', 429), /Too many requests\. Try again in a moment\./],
    ])('maps the error %#', (error, message) => {
        change.mutate.mockImplementation((_v, opts) => opts.onError(error))
        open()
        fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
        fireEvent.click(screen.getByTestId('review-confirm-button'))
        expect(screen.getByTestId('review-error')).toHaveTextContent(message)
    })

    it('keeps the reason readable when somebody else decided first and the refreshed panel turns final', () => {
        change.mutate.mockImplementation((_v, opts) => opts.onError(new ApiError('x', 409, 'INTERNSHIP_INVALID_TRANSITION', undefined, { from: 'accepted', to: 'rejected', allowed: [] })))
        const row = makeRow()
        const { rerender } = render(<ApplicationDrawer row={row} cohortId={COHORT_ID} onClose={vi.fn()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
        fireEvent.click(screen.getByTestId('review-confirm-button'))
        app.current = loaded(makeStaffApplication({ status: 'accepted' }))
        rerender(<ApplicationDrawer row={{ ...row, status: 'accepted' }} cohortId={COHORT_ID} onClose={vi.fn()} />)
        expect(screen.getByTestId('review-final')).toBeInTheDocument()
        expect(screen.getByTestId('review-error')).toHaveTextContent(/already accepted/)
    })
})
