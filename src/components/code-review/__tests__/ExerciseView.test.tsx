import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeDetail, makeResult, makeViewer } from '@/lib/codeReview/__tests__/fixtures'
import type { CrDetail } from '@/types/codeReview'

const auth = vi.hoisted(() => ({ current: { user: null as null | { role: string; id?: string }, loading: false } }))
const snip = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const submit = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth.current }))
vi.mock('@/hooks/queries/useCodeReview', () => ({
    useCodeSnippet: () => snip.current,
    useSubmitAttempt: () => submit,
    useUnlockHint: () => ({ mutate: vi.fn(), isPending: false }),
    useSolution: () => ({ data: undefined, isError: false, isFetching: false, error: null, refetch: vi.fn() }),
    useAttempts: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}))

import { ExerciseView } from '../ExerciseView'

const loaded = (data: CrDetail | undefined, over = {}) => ({ data, isLoading: false, isPending: false, isError: false, error: null, isPlaceholderData: false, refetch: vi.fn(), ...over })
const line = (n: number) => document.getElementById(`cr-line-${n}`) as HTMLElement
const mark = (n: number) => fireEvent.click(line(n))
const markSelection = () => fireEvent.click(screen.getByRole('button', { name: /Mark selection/ }))

type Handlers = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void }

beforeEach(() => {
    vi.clearAllMocks()
    submit.isPending = false
    auth.current = { user: { role: 'member' }, loading: false }
    snip.current = loaded(makeDetail())
})
afterEach(() => vi.useRealTimers())

describe('ExerciseView, visitor', () => {
    beforeEach(() => {
        auth.current = { user: null, loading: false }
        snip.current = loaded(makeDetail({ viewer: null }))
    })

    it('shows the exercise, lets a visitor mark lines, and asks to sign in to submit', () => {
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail({ viewer: null })} />)
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Login check')
        mark(4)
        markSelection()
        expect(screen.getAllByTestId('mark-item')).toHaveLength(1)
        const prompt = screen.getByTestId('signin-prompt')
        expect(prompt).toHaveTextContent('Sign in to submit')
        const link = screen.getByRole('link', { name: /Sign in to submit/ })
        expect(link.getAttribute('href')).toBe('/auth?redirect=%2Fcode-review%2Fsql-injection-login')
        expect(screen.queryByTestId('submit-marks')).not.toBeInTheDocument()
        expect(submit.mutate).not.toHaveBeenCalled()
    })

    it('does not offer the edit link or the progress panel', () => {
        render(<ExerciseView slug="sql-injection-login" initialSnippet={null} />)
        expect(screen.queryByRole('link', { name: /Edit exercise/ })).not.toBeInTheDocument()
        expect(screen.queryByText('Your progress')).not.toBeInTheDocument()
        expect(screen.getByTestId('solution-locked')).toBeInTheDocument()
    })
})

describe('ExerciseView, member', () => {
    it('submits the marks with their types and shows the result', () => {
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        mark(4)
        fireEvent.click(line(5), { shiftKey: true })
        markSelection()
        mark(7)
        markSelection()
        expect(screen.getAllByTestId('mark-item')).toHaveLength(2)
        fireEvent.click(screen.getByTestId('submit-marks'))
        expect(submit.mutate).toHaveBeenCalledTimes(1)
        const [vars, handlers] = submit.mutate.mock.calls[0] as [{ ref: string; marks: unknown[] }, Handlers]
        expect(vars.ref).toBe('sql-injection-login')
        expect(vars.marks).toEqual([{ lineStart: 4, lineEnd: 5 }, { lineStart: 7, lineEnd: 7 }])
        act(() => handlers.onSuccess?.(makeResult()))
        expect(screen.getByTestId('result')).toBeInTheDocument()
        expect(screen.getByTestId('submit-marks')).toHaveTextContent('Submit again')
        expect(screen.getByTestId('legend')).toBeInTheDocument()
    })

    it('shows a clear message for a refused submit and keeps the marks', () => {
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        mark(4)
        markSelection()
        fireEvent.click(screen.getByTestId('submit-marks'))
        const handlers = submit.mutate.mock.calls[0][1] as Handlers
        act(() => handlers.onError?.(new ApiError('nope', 409, 'CR_NOT_GRADABLE')))
        expect(screen.getByTestId('submit-error')).toBeInTheDocument()
        expect(screen.getAllByTestId('mark-item')).toHaveLength(1)
        expect(screen.getByTestId('submit-marks')).toBeEnabled()
    })

    it('runs a countdown after a 429 wait and re-enables the button when it is over', () => {
        vi.useFakeTimers()
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        mark(4)
        markSelection()
        fireEvent.click(screen.getByTestId('submit-marks'))
        const handlers = submit.mutate.mock.calls[0][1] as Handlers
        act(() => handlers.onError?.(new ApiError('slow down', 429, 'RATE_LIMIT_EXCEEDED', undefined, { retryAfter: 3 })))
        expect(screen.getByTestId('wait-notice')).toHaveTextContent('3 seconds')
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
        act(() => { vi.advanceTimersByTime(2000) })
        expect(screen.getByTestId('wait-notice')).toHaveTextContent('1 second')
        act(() => { vi.advanceTimersByTime(2000) })
        expect(screen.queryByTestId('wait-notice')).not.toBeInTheDocument()
        expect(screen.getByTestId('submit-marks')).toBeEnabled()
    })

    it('states the daily cap in words instead of a countdown', () => {
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        mark(4)
        markSelection()
        fireEvent.click(screen.getByTestId('submit-marks'))
        const handlers = submit.mutate.mock.calls[0][1] as Handlers
        act(() => handlers.onError?.(new ApiError('limit', 429, 'CR_ATTEMPT_LIMIT', undefined, { retryAfter: 7200, limit: 30 })))
        expect(screen.queryByTestId('wait-notice')).not.toBeInTheDocument()
        expect(screen.getByTestId('submit-error')).toHaveTextContent(/30/)
    })

    it('blocks submitting once the daily attempts are used', () => {
        snip.current = loaded(makeDetail({ viewer: makeViewer({ attempts: 30, attemptsToday: 30, attemptsLeftToday: 0, status: 'in-progress', solutionUnlocked: true }) }))
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        mark(4)
        markSelection()
        expect(screen.getByTestId('no-attempts')).toBeInTheDocument()
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
    })

    it('says an exercise without findings cannot be attempted', () => {
        snip.current = loaded(makeDetail({ findingCount: 0 }))
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        expect(screen.getByText(/has no findings to grade yet/)).toBeInTheDocument()
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
    })

    it('waits for the member answer before showing progress, with a way to reload', () => {
        const refetch = vi.fn()
        snip.current = loaded(makeDetail({ viewer: null }), { refetch })
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail({ viewer: null })} />)
        expect(screen.getByTestId('progress-pending')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Reload my progress' }))
        expect(refetch).toHaveBeenCalled()
    })

    it('has no edit link for a member, and one for an admin', () => {
        const { unmount } = render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        expect(screen.queryByRole('link', { name: /Edit exercise/ })).not.toBeInTheDocument()
        unmount()
        auth.current = { user: { role: 'admin' }, loading: false }
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        expect(screen.getByRole('link', { name: /Edit exercise/ }).getAttribute('href')).toBe('/admin/code-review/sql-injection-login/edit')
    })
})

describe('ExerciseView, limits and results', () => {
    it('shows the limits of the exercise live and stops adding at the marks limit', () => {
        // 2 findings: 4 marks; 40% of 7 lines is 2, but never fewer than 6 lines
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        expect(screen.getByTestId('marks-count')).toHaveTextContent('0 of 4 marks, 0 of 6 lines')
        for (const n of [1, 3, 5, 7]) { mark(n); markSelection() }
        expect(screen.getByTestId('marks-count')).toHaveTextContent('4 of 4 marks, 4 of 6 lines')
        mark(2)
        expect(screen.getByRole('button', { name: /Mark selection/ })).toBeDisabled()
        expect(screen.getByTestId('limit-note')).toHaveTextContent('at most 4 marks')
    })

    it('follows the limits the API names when it refuses an answer as too broad', () => {
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        mark(4)
        markSelection()
        fireEvent.click(screen.getByTestId('submit-marks'))
        const handlers = submit.mutate.mock.calls[0][1] as Handlers
        act(() => handlers.onError?.(new ApiError('broad', 400, 'CR_TOO_BROAD', undefined, { maxMarks: 3, maxLines: 5 })))
        expect(screen.getByTestId('submit-error')).toHaveTextContent('at most 3 marks covering at most 5 lines')
        expect(screen.getByTestId('marks-count')).toHaveTextContent('1 of 3 marks, 1 of 5 lines')
        // Nothing was lost: the marks are still there
        expect(screen.getAllByTestId('mark-item')).toHaveLength(1)
    })

    it('does not send an answer that is over the limits', () => {
        // All 7 lines are over the 6 that an answer may cover
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        mark(1)
        fireEvent.click(line(7), { shiftKey: true })
        expect(screen.getByRole('button', { name: /Mark selection/ })).toBeDisabled()
        expect(submit.mutate).not.toHaveBeenCalled()
    })

    it('paints the member\'s own matching marks green before the details are revealed', () => {
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        mark(4)
        markSelection()
        mark(7)
        markSelection()
        fireEvent.click(screen.getByTestId('submit-marks'))
        const handlers = submit.mutate.mock.calls[0][1] as Handlers
        act(() => handlers.onSuccess?.(makeResult({ detailsRevealed: false, matchedCount: 1, matched: [], marks: [{ index: 0, result: 'matched' }, { index: 1, result: 'unmatched' }] })))
        expect(line(4)).toHaveAttribute('data-tone', 'match')
        expect(line(7)).toHaveAttribute('data-tone', 'mark')
        expect(screen.getByTestId('details-locked')).toBeInTheDocument()
    })

    it('does not offer a sign-in while the session is still being read', () => {
        auth.current = { user: null, loading: true }
        render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail({ viewer: null })} />)
        expect(screen.queryByTestId('signin-prompt')).not.toBeInTheDocument()
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
    })

    it('clears the result and the marks when the member signs out or another account signs in', () => {
        auth.current = { user: { role: 'member', id: 'u1' }, loading: false }
        const { rerender } = render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail()} />)
        mark(4)
        markSelection()
        fireEvent.click(screen.getByTestId('submit-marks'))
        act(() => (submit.mutate.mock.calls[0][1] as Handlers).onSuccess?.(makeResult()))
        expect(screen.getByTestId('result')).toBeInTheDocument()
        auth.current = { user: null, loading: false }
        snip.current = loaded(makeDetail({ viewer: null }))
        rerender(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail({ viewer: null })} />)
        expect(screen.queryByTestId('result')).not.toBeInTheDocument()
        expect(screen.queryAllByTestId('mark-item')).toHaveLength(0)
    })

    it('keeps what a visitor marked when they sign in', () => {
        auth.current = { user: null, loading: false }
        snip.current = loaded(makeDetail({ viewer: null }))
        const { rerender } = render(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail({ viewer: null })} />)
        mark(4)
        markSelection()
        auth.current = { user: { role: 'member', id: 'u1' }, loading: false }
        snip.current = loaded(makeDetail())
        rerender(<ExerciseView slug="sql-injection-login" initialSnippet={makeDetail({ viewer: null })} />)
        expect(screen.getAllByTestId('mark-item')).toHaveLength(1)
    })
})

describe('ExerciseView, failing loads', () => {
    it('shows a not-available page for a 404, without a retry', () => {
        snip.current = loaded(undefined, { isError: true, error: new ApiError('gone', 404, 'CR_NOT_FOUND') })
        render(<ExerciseView slug="x" initialSnippet={null} />)
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This exercise is not available')
        expect(screen.getByRole('link', { name: 'Back to the exercises' })).toBeInTheDocument()
        expect(screen.queryByTestId('code-card')).not.toBeInTheDocument()
    })

    it('shows an honest error with a retry for anything else, never other data', () => {
        const refetch = vi.fn()
        snip.current = loaded(undefined, { isError: true, error: new ApiError('boom', 500, 'INTERNAL'), refetch })
        render(<ExerciseView slug="x" initialSnippet={null} />)
        expect(screen.getByText('Could not load this exercise')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /Try again|Retry/ }))
        expect(refetch).toHaveBeenCalled()
        expect(screen.queryByTestId('code-card')).not.toBeInTheDocument()
    })

    it('shows a loading state while the first answer is pending', () => {
        snip.current = loaded(undefined, { isLoading: true, isPending: true })
        render(<ExerciseView slug="x" initialSnippet={null} />)
        expect(screen.getByRole('status', { name: 'Loading exercise' })).toBeInTheDocument()
    })
})
