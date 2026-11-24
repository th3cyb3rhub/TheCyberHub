import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeCohort, makeMine, QUESTION_AREA, QUESTION_FILE, QUESTION_PICK, QUESTION_TEXT, viewer } from '@/lib/internships/__tests__/fixtures'

vi.mock('@/components/events/PageShell', () => ({ useRequireLogin: () => ({ user: { id: 'u1', role: 'user' }, ready: true }), FullPageSpinner: () => <div role="status">loading</div> }))
const q = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const apply = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, error: null as unknown }))
vi.mock('@/hooks/queries/useInternships', () => ({ useInternship: () => q.current, useApplyInternship: () => apply }))

import { ApplyView } from '../ApplyView'

const ok = (cohort: unknown, refetch = vi.fn()) => ({ data: cohort, isError: false, refetch })
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send application' }))

function fillValid() {
    fill(/^Why do you want to join/, 'I would like to learn web security from your mentors.')
    fill(/^Your favourite tool/, 'Burp')
    fill(/^Preferred track/, 'Offensive')
}

beforeEach(() => {
    vi.clearAllMocks()
    q.current = ok(makeCohort())
    apply.isPending = false
})

describe('ApplyView form', () => {
    it("renders the cohort's questions by type with required markers", () => {
        render(<ApplyView id="c1" />)
        expect(screen.getByLabelText(/^Your favourite tool/)).toHaveAttribute('type', 'text')
        expect(screen.getByLabelText(/^Your favourite tool/)).toHaveAttribute('aria-required', 'true')
        expect(screen.getByLabelText(/^Tell us about a bug/).tagName).toBe('TEXTAREA')
        expect(screen.getByLabelText(/^Tell us about a bug/)).not.toHaveAttribute('aria-required')
        const select = screen.getByLabelText(/^Preferred track/)
        expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose an option', 'Offensive', 'Defensive'])
        expect(screen.getByLabelText(/^Sample report/)).toHaveAttribute('type', 'url')
        // required is not colour alone
        expect(screen.getByText('Your favourite tool', { exact: false }).closest('label')).toHaveTextContent('(required)')
    })

    it('shows every problem at once, focuses the first and sends nothing', () => {
        render(<ApplyView id="c1" />)
        send()
        expect(apply.mutate).not.toHaveBeenCalled()
        expect(screen.getByText(/at least 10 characters/)).toBeInTheDocument()
        expect(screen.getByText('Your favourite tool is required')).toBeInTheDocument()
        expect(screen.getByText('Preferred track is required')).toBeInTheDocument()
        expect(screen.getByLabelText(/^Why do you want to join/)).toHaveAttribute('aria-invalid', 'true')
    })

    it('refuses a link that is not http(s) before it leaves the browser', () => {
        render(<ApplyView id="c1" />)
        fillValid()
        fill('GitHub profile', 'javascript:alert(1)')
        fill(/^Sample report/, 'http://localhost/cv.pdf')
        send()
        expect(apply.mutate).not.toHaveBeenCalled()
        expect(screen.getByText(/GitHub link must be a public link/)).toBeInTheDocument()
        expect(screen.getByText(/Sample report must be a valid public http or https link/)).toBeInTheDocument()
    })

    it('sends the letter, the links and the answers keyed by question id', () => {
        render(<ApplyView id="c1" />)
        fillValid()
        fill('GitHub profile', 'https://github.com/ada')
        fill(/^Tell us about a bug/, 'An IDOR in a school portal.')
        send()
        expect(apply.mutate).toHaveBeenCalledTimes(1)
        expect(apply.mutate.mock.calls[0][0]).toEqual({
            id: 'c1',
            payload: {
                coverLetter: 'I would like to learn web security from your mentors.',
                githubUrl: 'https://github.com/ada',
                answers: [
                    { field: QUESTION_TEXT, value: 'Burp' },
                    { field: QUESTION_AREA, value: 'An IDOR in a school portal.' },
                    { field: QUESTION_PICK, value: 'Offensive' },
                ],
            },
        })
    })

    it('shows the server field errors on the question they name', () => {
        render(<ApplyView id="c1" />)
        fillValid()
        apply.mutate.mockImplementation((_v, opts) => opts.onError(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [
            { field: `answers.${QUESTION_FILE}`, message: 'Sample report must be a valid http or https link' },
            { field: 'coverLetter', message: 'Cover letter must be at least 10 characters' },
        ])))
        send()
        expect(screen.getByLabelText(/^Sample report/)).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByLabelText(/^Sample report/)).toHaveAccessibleDescription(/Make sure anyone with the link can open it|valid http or https link/)
        expect(screen.getByText('Sample report must be a valid http or https link')).toBeInTheDocument()
        expect(screen.getByLabelText(/^Why do you want to join/)).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByTestId('apply-error')).toHaveTextContent('Some answers need your attention')
    })

    it('shows the success state once the application is sent', () => {
        apply.mutate.mockImplementation((_v, opts) => opts.onSuccess(makeMine({ status: 'pending' })))
        render(<ApplyView id="c1" />)
        fillValid()
        send()
        expect(screen.getByTestId('apply-success')).toHaveTextContent('Application sent')
        expect(screen.getByRole('link', { name: 'See my applications' })).toHaveAttribute('href', '/internships/applications')
    })

    it.each([
        ['INTERNSHIP_CLOSED', /closed/i],
        ['INTERNSHIP_ALREADY_APPLIED', /already applied/i],
        ['INTERNSHIP_FULL', /no seats left/i],
    ])('explains a 409 %s and reloads the program', (code, message) => {
        const refetch = vi.fn()
        q.current = ok(makeCohort(), refetch)
        apply.mutate.mockImplementation((_v, opts) => opts.onError(new ApiError('x', 409, code)))
        render(<ApplyView id="c1" />)
        fillValid()
        send()
        expect(screen.getByTestId('apply-error')).toHaveTextContent(message)
        expect(refetch).toHaveBeenCalled()
    })

    it('says "try again in a moment" when rate limited, and keeps what was typed', () => {
        apply.mutate.mockImplementation((_v, opts) => opts.onError(new ApiError('slow', 429)))
        render(<ApplyView id="c1" />)
        fillValid()
        send()
        expect(screen.getByTestId('apply-error')).toHaveTextContent('Too many requests. Try again in a moment.')
        expect(screen.getByLabelText(/^Your favourite tool/)).toHaveValue('Burp')
    })
})

describe('ApplyView states without a form', () => {
    it('says so when the member already applied', () => {
        q.current = ok(makeCohort({ viewer: viewer({ canApply: false, userApplication: { _id: 'a', status: 'pending', appliedAt: 'x', updatedAt: 'y' } }) }))
        render(<ApplyView id="c1" />)
        expect(screen.getByRole('heading', { name: 'You have already applied' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Send application' })).toBeNull()
    })
    it('says so when applications closed or the program is full', () => {
        q.current = ok(makeCohort({ status: 'closed', applicationsOpen: false, viewer: viewer({ canApply: false }) }))
        const { unmount } = render(<ApplyView id="c1" />)
        expect(screen.getByRole('heading', { name: 'Applications are closed' })).toBeInTheDocument()
        unmount()
        q.current = ok(makeCohort({ spotsLeft: 0 }))
        render(<ApplyView id="c1" />)
        expect(screen.getByRole('heading', { name: 'This program is full' })).toBeInTheDocument()
    })
})
