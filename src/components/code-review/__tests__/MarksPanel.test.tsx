import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarksPanel, useCountdown, useWaitAnnouncement } from '../MarksPanel'

const base = { onMarksChange: vi.fn(), onSubmit: vi.fn(), submitting: false, block: null, error: null, waitSeconds: null, attemptsLeft: 29, hasResult: false }
const marks = [{ lineStart: 4, lineEnd: 5 }, { lineStart: 9, lineEnd: 9, vulnerabilityType: 'xss' }]

beforeEach(() => vi.clearAllMocks())

describe('MarksPanel', () => {
    it('explains how to start when there are no marks, and cannot submit', () => {
        render(<MarksPanel {...base} marks={[]} />)
        expect(screen.getByTestId('no-marks')).toHaveTextContent('Marking the whole file earns nothing')
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
        expect(screen.getByTestId('marks-count')).toHaveTextContent('0 of 50 marks')
    })

    it('lists each mark with a type and a remove button, and sends them', () => {
        render(<MarksPanel {...base} marks={marks} />)
        const items = screen.getAllByTestId('mark-item')
        expect(items).toHaveLength(2)
        expect(items[0]).toHaveTextContent('Lines 4 to 5')
        expect(items[1]).toHaveTextContent('Line 9')
        expect(within(items[1]).getByLabelText('Vulnerability type for line 9')).toHaveValue('xss')
        fireEvent.change(within(items[0]).getByLabelText('Vulnerability type for lines 4 to 5'), { target: { value: 'sqli' } })
        expect(base.onMarksChange).toHaveBeenLastCalledWith([{ lineStart: 4, lineEnd: 5, vulnerabilityType: 'sqli' }, marks[1]])
        fireEvent.click(screen.getByRole('button', { name: 'Remove mark on lines 4 to 5' }))
        expect(base.onMarksChange).toHaveBeenLastCalledWith([marks[1]])
        const submit = screen.getByTestId('submit-marks')
        expect(submit).toHaveTextContent('Submit marks (2)')
        fireEvent.click(submit)
        expect(base.onSubmit).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('attempts-left')).toHaveTextContent('29 graded attempts left today')
        fireEvent.click(screen.getByRole('button', { name: 'Clear all marks' }))
        expect(base.onMarksChange).toHaveBeenLastCalledWith([])
    })

    it('asks a visitor to sign in instead of offering a submit button, and returns here afterwards', () => {
        render(<MarksPanel {...base} marks={marks} block={{ kind: 'signed-out', href: '/auth?redirect=%2Fcode-review%2Fx' }} attemptsLeft={null} />)
        expect(screen.getByTestId('signin-prompt')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Sign in to submit/ })).toHaveAttribute('href', '/auth?redirect=%2Fcode-review%2Fx')
        expect(screen.queryByTestId('submit-marks')).not.toBeInTheDocument()
        expect(screen.queryByTestId('attempts-left')).not.toBeInTheDocument()
        // the marks are still there for the visitor to look at
        expect(screen.getAllByTestId('mark-item')).toHaveLength(2)
    })

    it('says when the daily attempts are used up, and blocks the submit', () => {
        render(<MarksPanel {...base} marks={marks} block={{ kind: 'no-attempts' }} attemptsLeft={0} />)
        expect(screen.getByTestId('no-attempts')).toHaveTextContent('all 30 graded attempts')
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
    })

    it('says a snippet with no findings cannot be attempted', () => {
        render(<MarksPanel {...base} marks={marks} block={{ kind: 'not-gradable' }} />)
        expect(screen.getByText(/no findings to grade yet/)).toBeInTheDocument()
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
    })

    it('shows the 429 wait and keeps submit off until it ends', () => {
        render(<MarksPanel {...base} marks={marks} waitSeconds={42} />)
        expect(screen.getByTestId('wait-notice')).toHaveTextContent('You can submit again in 42 seconds')
        expect(screen.getByTestId('wait-announce')).toHaveTextContent('You can submit again in 42 seconds')
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
    })

    it('shows the marks and the lines used against the limits of the exercise', () => {
        render(<MarksPanel {...base} marks={marks} limits={{ maxMarks: 4, maxLines: 6 }} />)
        expect(screen.getByTestId('marks-count')).toHaveTextContent('2 of 4 marks, 3 of 6 lines')
        expect(screen.getByTestId('submit-marks')).not.toBeDisabled()
        expect(screen.queryByTestId('over-limit')).not.toBeInTheDocument()
    })

    it('blocks a submit that is over the limits and says what the limits are', () => {
        render(<MarksPanel {...base} marks={marks} limits={{ maxMarks: 4, maxLines: 2 }} />)
        expect(screen.getByTestId('marks-count')).toHaveTextContent('2 of 4 marks, 3 of 2 lines')
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
        expect(screen.getByTestId('over-limit')).toHaveTextContent('at most 4 marks covering at most 2 lines')
    })

    it('counts overlapping lines once and names the finding types, not the categories', () => {
        render(<MarksPanel {...base} marks={[{ lineStart: 4, lineEnd: 5 }]} limits={{ maxMarks: 3, maxLines: 6 }} />)
        const values = within(screen.getByLabelText('Vulnerability type for lines 4 to 5')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
        expect(values).toContain('race-condition')
        expect(values).not.toContain('access-control')
    })

    it('shows the error from the server and a busy submit', () => {
        const { rerender } = render(<MarksPanel {...base} marks={marks} error="Too many requests." />)
        expect(screen.getByTestId('submit-error')).toHaveTextContent('Too many requests.')
        rerender(<MarksPanel {...base} marks={marks} submitting />)
        expect(screen.getByTestId('submit-marks')).toBeDisabled()
        expect(screen.getByTestId('submit-marks')).toHaveAttribute('aria-busy', 'true')
        rerender(<MarksPanel {...base} marks={marks} hasResult />)
        expect(screen.getByTestId('submit-marks')).toHaveTextContent('Submit again')
    })
})

describe('useCountdown', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('counts down to nothing', () => {
        const until = Date.now() + 3000
        const { result } = renderHook(() => useCountdown(until))
        expect(result.current).toBe(3)
        act(() => { vi.advanceTimersByTime(1000) })
        expect(result.current).toBe(2)
        act(() => { vi.advanceTimersByTime(2500) })
        expect(result.current).toBeNull()
    })

    it('is null without a wait', () => {
        expect(renderHook(() => useCountdown(null)).result.current).toBeNull()
    })
})

describe('useWaitAnnouncement', () => {
    it('speaks at the start, every 10 seconds and at the end, not every second', () => {
        const { result, rerender } = renderHook(({ s }: { s: number | null }) => useWaitAnnouncement(s), { initialProps: { s: null as number | null } })
        expect(result.current).toBe('')
        rerender({ s: 37 })
        expect(result.current).toBe('You can submit again in 37 seconds.')
        rerender({ s: 36 })
        expect(result.current).toBe('You can submit again in 37 seconds.')
        rerender({ s: 31 })
        expect(result.current).toBe('You can submit again in 37 seconds.')
        rerender({ s: 30 })
        expect(result.current).toBe('You can submit again in 30 seconds.')
        rerender({ s: 29 })
        expect(result.current).toBe('You can submit again in 30 seconds.')
        rerender({ s: 10 })
        expect(result.current).toBe('You can submit again in 10 seconds.')
        rerender({ s: null })
        expect(result.current).toBe('You can submit again now.')
    })
})
