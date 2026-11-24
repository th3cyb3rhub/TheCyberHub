import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeCohort } from '@/lib/internships/__tests__/fixtures'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useInternships', () => ({ useCreateCohort: () => create, useUpdateCohort: () => update }))

import { CohortForm } from '../CohortForm'

const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const save = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))

function fillRequired() {
    fill(/^Title/, 'Winter Internship')
    fill(/^Description/, 'A program for newcomers.')
    fill(/^Application deadline/, '2099-01-05T10:00')
    fill(/^Start/, '2099-01-10T10:00')
    fill(/^End/, '2099-03-10T10:00')
}

beforeEach(() => { vi.clearAllMocks(); create.isPending = false; update.isPending = false })

describe('CohortForm (new program)', () => {
    it('shows every problem at once and sends nothing', () => {
        render(<CohortForm />)
        save('Save draft')
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByTestId('form-error')).toHaveTextContent(/Please fix \d+ things/)
        expect(screen.getByText(/Title must be at least 3/)).toBeInTheDocument()
        expect(screen.getByText('Application deadline is required')).toBeInTheDocument()
        expect(screen.getByLabelText(/^Title/)).toHaveAttribute('aria-invalid', 'true')
    })

    it('offers draft and open on create, and no visibility switch', () => {
        render(<CohortForm />)
        expect(within(screen.getByLabelText('Status')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Draft', 'Open'])
        expect(screen.queryByLabelText(/Visible to the public/)).toBeNull()
    })

    it('applies the date rules before it asks the server', () => {
        render(<CohortForm />)
        fillRequired()
        fill(/^Application deadline/, '2099-01-11T10:00')
        save('Save draft')
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByText(/deadline must be on or before the start date/)).toBeInTheDocument()
        fill(/^Application deadline/, '2099-01-05T10:00')
        fill(/^End/, '2099-01-10T10:00')
        save('Save draft')
        expect(screen.getByText(/end date must be after the start date/)).toBeInTheDocument()
    })

    it('takes a capacity of 0 as no limit and sends the whole payload', () => {
        render(<CohortForm />)
        fillRequired()
        expect(screen.getByLabelText(/^Capacity/)).toHaveValue(0)
        expect(screen.getByText(/0 means no limit/)).toBeInTheDocument()
        fill(/^Requirements/, 'Networking basics\n\nCuriosity')
        save('Save draft')
        expect(create.mutate).toHaveBeenCalledTimes(1)
        const payload = create.mutate.mock.calls[0][0]
        expect(payload).toMatchObject({ title: 'Winter Internship', status: 'draft', capacity: 0, type: 'internship', requirements: ['Networking basics', 'Curiosity'], customFields: [], syllabus: [] })
        expect(payload.startDate).toBe(new Date('2099-01-10T10:00').toISOString())
        expect(payload).not.toHaveProperty('isActive')
    })

    it('redirects to the list after it was saved', () => {
        create.mutate.mockImplementation((_p, opts) => opts.onSuccess())
        render(<CohortForm />)
        fillRequired()
        save('Save draft')
        expect(push).toHaveBeenCalledWith('/admin/internships')
        expect(addToast).toHaveBeenCalledWith({ variant: 'success', message: 'Program saved as a draft.' })
    })

    it('maps server details to the fields they name, even inside a question or a list', () => {
        create.mutate.mockImplementation((_p, opts) => opts.onError(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [
            { field: 'requirements.2', message: 'requirements[2] is too long' },
            { field: 'customFields.0.label', message: 'Question is required' },
            { field: 'endDate', message: 'endDate must be after startDate' },
        ])))
        render(<CohortForm />)
        fillRequired()
        fireEvent.click(screen.getByRole('button', { name: 'Add a question' }))
        fill(/^Question/, 'Why us?')
        save('Save draft')
        expect(screen.getByText('requirements[2] is too long')).toBeInTheDocument()
        expect(screen.getByText('Question is required')).toBeInTheDocument()
        expect(screen.getByText('endDate must be after startDate')).toBeInTheDocument()
        expect(screen.getByTestId('form-error')).toHaveTextContent(/did not accept some fields/)
    })

    it('says "try again in a moment" when rate limited', () => {
        create.mutate.mockImplementation((_p, opts) => opts.onError(new ApiError('slow', 429)))
        render(<CohortForm />)
        fillRequired()
        save('Save draft')
        expect(screen.getByTestId('form-error')).toHaveTextContent('Too many requests. Try again in a moment.')
    })
})

describe('CohortForm (custom questions editor)', () => {
    it('adds, reorders and removes questions, and edits dropdown options, up to 20', () => {
        render(<CohortForm />)
        const add = screen.getByRole('button', { name: 'Add a question' })
        fireEvent.click(add)
        fireEvent.click(add)
        const rows = () => screen.getAllByTestId('custom-field-row')
        expect(rows()).toHaveLength(2)
        fireEvent.change(within(rows()[0]).getByLabelText(/^Question/), { target: { value: 'First' } })
        fireEvent.change(within(rows()[1]).getByLabelText(/^Question/), { target: { value: 'Second' } })
        fireEvent.click(screen.getByRole('button', { name: 'Move question 2 up' }))
        expect(within(rows()[0]).getByLabelText(/^Question/)).toHaveValue('Second')
        fireEvent.change(within(rows()[0]).getByLabelText('Answer type'), { target: { value: 'dropdown' } })
        expect(within(rows()[0]).getAllByLabelText(/^Option/)).toHaveLength(1)
        fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Add option' }))
        expect(within(rows()[0]).getAllByLabelText(/^Option/)).toHaveLength(2)
        fireEvent.click(screen.getByRole('button', { name: 'Remove question 1' }))
        expect(rows()).toHaveLength(1)
        expect(within(rows()[0]).getByLabelText(/^Question/)).toHaveValue('First')
        for (let i = 0; i < 25; i++) if (!(add as HTMLButtonElement).disabled) fireEvent.click(add)
        expect(rows()).toHaveLength(20)
        expect(add).toBeDisabled()
    })

    it('needs at least one option for a dropdown before it saves', () => {
        render(<CohortForm />)
        fillRequired()
        fireEvent.click(screen.getByRole('button', { name: 'Add a question' }))
        fill(/^Question/, 'Track')
        fill('Answer type', 'dropdown')
        save('Save draft')
        expect(create.mutate).not.toHaveBeenCalled()
        expect(screen.getByText('A dropdown needs at least one option')).toBeInTheDocument()
    })
})

describe('CohortForm (edit)', () => {
    const loaded = () => makeCohort({ storedStatus: 'open', isActive: true, acceptedCount: 4, applicationCount: 9, applicationDeadline: '2099-01-05T10:00:00.000Z', startDate: '2099-01-10T10:00:00.000Z', endDate: '2099-03-10T10:00:00.000Z' })

    it('starts from the cohort and offers every status and the visibility switch', () => {
        render(<CohortForm cohort={loaded()} />)
        expect(screen.getAllByLabelText(/^Title/)[0]).toHaveValue('Summer Security Internship')
        expect(screen.getByLabelText('Status')).toHaveValue('open')
        expect(within(screen.getByLabelText('Status')).getAllByRole('option')).toHaveLength(5)
        expect(screen.getByLabelText(/Visible to the public/)).toBeChecked()
        expect(screen.getByText(/4 accepted so far/)).toBeInTheDocument()
        expect(screen.getAllByTestId('custom-field-row')).toHaveLength(4)
    })

    it('does not call the API when nothing changed', () => {
        render(<CohortForm cohort={loaded()} />)
        save('Save changes')
        expect(update.mutate).not.toHaveBeenCalled()
        expect(addToast).toHaveBeenCalledWith({ variant: 'info', message: 'Nothing changed, so there is nothing to save.' })
    })

    it('sends only what changed, with the id of every question that exists', () => {
        render(<CohortForm cohort={loaded()} />)
        fireEvent.change(screen.getAllByLabelText(/^Title/)[0], { target: { value: 'Summer Security Internship 2027' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add a question' }))
        const rows = screen.getAllByTestId('custom-field-row')
        fireEvent.change(within(rows[4]).getByLabelText(/^Question/), { target: { value: 'Anything else?' } })
        save('Save changes')
        const { id, payload } = update.mutate.mock.calls[0][0]
        expect(id).toBe('a'.repeat(24))
        expect(Object.keys(payload).sort()).toEqual(['customFields', 'title'])
        expect(payload.customFields.slice(0, 4).map((f: { _id: string }) => f._id)).toEqual(['b', 'c', 'd', 'e'].map((c) => c.repeat(24)))
        expect(payload.customFields[4]).toEqual({ label: 'Anything else?', type: 'text', required: false })
    })

    it('will not lower the capacity under the accepted applicants', () => {
        render(<CohortForm cohort={loaded()} />)
        fill(/^Capacity/, '2')
        save('Save changes')
        expect(update.mutate).not.toHaveBeenCalled()
        expect(screen.getByText(/4 applicants are already accepted/)).toBeInTheDocument()
    })

    it('shows the capacity conflict the server finds as an error on the capacity', () => {
        update.mutate.mockImplementation((_p, opts) => opts.onError(new ApiError('x', 409, 'INTERNSHIP_CAPACITY_TOO_LOW')))
        render(<CohortForm cohort={loaded()} />)
        fill(/^Capacity/, '6')
        save('Save changes')
        expect(screen.getByLabelText(/^Capacity/)).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getAllByText(/cannot be lower than the number of applicants already accepted/).length).toBeGreaterThan(0)
    })

    it('shows the showcase editor for a completed cohort only', () => {
        const { unmount } = render(<CohortForm cohort={loaded()} />)
        expect(screen.queryByRole('heading', { name: 'Showcase' })).toBeNull()
        unmount()
        render(<CohortForm cohort={makeCohort({ storedStatus: 'completed', status: 'completed', showcaseProjects: [{ title: 'Scanner', description: '', teamMembers: [], repoLink: 'https://github.com/a/b' }] })} />)
        expect(screen.getByRole('heading', { name: 'Showcase' })).toBeInTheDocument()
        expect(screen.getAllByTestId('showcase-row')).toHaveLength(1)
    })
})
