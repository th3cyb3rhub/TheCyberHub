import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeDetail, makeViewer } from '@/lib/codeReview/__tests__/fixtures'

const sol = vi.hoisted(() => ({ current: {} as Record<string, unknown>, enabled: [] as boolean[] }))
vi.mock('@/hooks/queries/useCodeReview', () => ({ useSolution: (_ref: string, enabled: boolean) => { sol.enabled.push(enabled); return sol.current } }))

import { SolutionPanel } from '../SolutionPanel'

const idle = (over = {}) => ({ data: undefined, isError: false, isFetching: false, error: null, refetch: vi.fn(), ...over })
const solution = {
    _id: '1', slug: 's', title: 'T', explanation: 'The query is built by **concatenation**.',
    findings: [{ lineStart: 4, lineEnd: 5, title: 'SQL injection', vulnerabilityType: 'sqli', severity: 'critical', cwe: 'CWE-89', owasp: null, explanation: 'Concatenated.', exploit: { description: 'Send a quote.', payload: "' OR 1=1 --", result: 'Logged in' }, fix: { description: 'Bind it.', code: 'cursor.execute(q, (name,))' } }],
    fixedCode: 'def login(u, p):\n    safe()', exploitedCode: '<script>alert(1)</script>', fixedExploitedCode: '', exploitExample: { title: 'Bypass', payload: 'x' }, hints: [], viewer: null,
}
const unlocked = (over = {}) => makeDetail({ viewer: makeViewer({ solutionUnlocked: true, attempts: 1, status: 'in-progress', ...over }) })

beforeEach(() => { sol.current = idle(); sol.enabled = [] })

describe('SolutionPanel', () => {
    it('is locked for a visitor, with nothing fetched', () => {
        render(<SolutionPanel snippet={makeDetail({ viewer: null })} signedIn={false} staff={false} />)
        expect(screen.getByTestId('solution-locked')).toHaveTextContent('Sign in and submit your first attempt')
        expect(screen.queryByRole('button', { name: 'Show solution' })).not.toBeInTheDocument()
        expect(sol.enabled.every((e) => e === false)).toBe(true)
    })

    it('is locked for a member until the first graded attempt, with a disabled button', () => {
        render(<SolutionPanel snippet={makeDetail({ viewer: makeViewer({ solutionUnlocked: false }) })} signedIn staff={false} />)
        expect(screen.getByTestId('solution-locked')).toHaveTextContent('locked until your first graded attempt')
        expect(screen.getByRole('button', { name: /Show solution/ })).toBeDisabled()
        expect(sol.enabled.every((e) => e === false)).toBe(true)
    })

    it('asks before it opens the solution of an exercise that is not passed: a pass would pay 0', () => {
        render(<SolutionPanel snippet={unlocked()} signedIn staff={false} />)
        expect(screen.getByText(/Opening the solution before you pass means a pass pays 0 points/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /Show solution/ }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('that pass pays 0 points')
        // nothing was fetched yet
        expect(sol.enabled.every((e) => e === false)).toBe(true)
        fireEvent.click(within(dialog).getByRole('button', { name: 'Keep trying' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(sol.enabled.every((e) => e === false)).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: /Show solution/ }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open the solution' }))
        expect(sol.enabled.at(-1)).toBe(true)
    })

    it('opens at once, with no warning, once passed, once the solution was opened before, and for staff', () => {
        const { unmount } = render(<SolutionPanel snippet={unlocked({ passed: true, status: 'passed' })} signedIn staff={false} />)
        fireEvent.click(screen.getByRole('button', { name: /Show solution/ }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(sol.enabled.at(-1)).toBe(true)
        unmount()
        sol.enabled = []
        const second = render(<SolutionPanel snippet={unlocked({ solutionViewed: true })} signedIn staff={false} />)
        expect(screen.getByText(/already opened the solution before passing/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /Show solution/ }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        second.unmount()
        sol.enabled = []
        render(<SolutionPanel snippet={makeDetail({ viewer: makeViewer() })} signedIn staff />)
        expect(screen.getByText(/As staff you can read the solution at any time/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /Show solution/ }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(sol.enabled.at(-1)).toBe(true)
    })

    it('shows the whole solution as text once it is loaded', () => {
        sol.current = idle({ data: solution })
        render(<SolutionPanel snippet={unlocked({ passed: true, status: 'passed' })} signedIn staff={false} />)
        fireEvent.click(screen.getByRole('button', { name: /Show solution/ }))
        const body = screen.getByTestId('solution-body')
        expect(within(body).getByText('Overview')).toBeInTheDocument()
        expect(body).toHaveTextContent('The query is built by concatenation.')
        expect(within(body).getByTestId('finding')).toHaveTextContent('SQL injection')
        expect(body).toHaveTextContent("' OR 1=1 --")
        expect(body).toHaveTextContent('cursor.execute(q, (name,))')
        expect(within(body).getByRole('list', { name: 'Fixed code' })).toHaveTextContent('safe()')
        expect(within(body).getByTestId('exploit-example')).toHaveTextContent('Bypass')
        // code with a script tag is shown, never run
        expect(body).toHaveTextContent('<script>alert(1)</script>')
        expect(body.querySelector('script')).toBeNull()
    })

    it('can be hidden again without asking the API again', () => {
        sol.current = idle({ data: solution })
        render(<SolutionPanel snippet={unlocked({ passed: true, status: 'passed' })} signedIn staff={false} />)
        fireEvent.click(screen.getByRole('button', { name: /Show solution/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Hide solution' }))
        expect(screen.queryByTestId('solution-body')).not.toBeInTheDocument()
    })

    it('shows the error of a refused open with a way to try again', () => {
        const refetch = vi.fn()
        sol.current = idle({ isError: true, error: new ApiError('x', 403, 'CR_SOLUTION_LOCKED'), refetch })
        render(<SolutionPanel snippet={unlocked({ passed: true, status: 'passed' })} signedIn staff={false} />)
        expect(screen.getByTestId('solution-error')).toHaveTextContent('first graded attempt')
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(refetch).toHaveBeenCalled()
    })
})
