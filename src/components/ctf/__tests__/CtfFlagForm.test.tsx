import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError } from '@/lib/api'
import type { CtfSubmitResult } from '@/types/ctf'

const submit = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useCtf', () => ({ useSubmitCtfFlag: () => submit }))

import { CtfFlagForm, NOT_STARTED_RECHECK_MS } from '../CtfFlagForm'

type Callbacks = { onSuccess?: (r: CtfSubmitResult) => void; onError?: (e: unknown) => void; onSettled?: () => void }
const last = () => submit.mutate.mock.calls[submit.mutate.mock.calls.length - 1] as [{ slug: string; challengeId: string; flag: string }, Callbacks]

const challenge = { _id: 'ch1', title: 'Cookie Monster', flagFormat: 'flag{...}', solved: false }
const renderForm = (over: Partial<Parameters<typeof CtfFlagForm>[0]> = {}) => render(
    <CtfFlagForm slug="winter-ctf" challenge={challenge} status="live" signedIn teamIssue={null} onTeamTab={vi.fn()} {...over} />,
)
const box = () => screen.getByLabelText(/Flag/) as HTMLInputElement
const send = (value: string) => {
    fireEvent.change(box(), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit flag' }))
}

beforeEach(() => { vi.clearAllMocks(); submit.isPending = false })
afterEach(() => { vi.useRealTimers() })

describe('CtfFlagForm', () => {
    it('refuses an empty flag without asking the server, and says why next to the box', () => {
        renderForm()
        fireEvent.click(screen.getByRole('button', { name: 'Submit flag' }))
        expect(submit.mutate).not.toHaveBeenCalled()
        expect(box()).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText('Enter the flag before you send it')).toBeInTheDocument()
    })

    it('sends the flag once, empties the box at once and never keeps the text', () => {
        renderForm()
        send('  flag{secret}  ')
        expect(submit.mutate).toHaveBeenCalledTimes(1)
        expect(last()[0]).toEqual({ slug: 'winter-ctf', challengeId: 'ch1', flag: 'flag{secret}' })
        expect(box().value).toBe('')
        expect(screen.getByTestId('flag-form')).toHaveAttribute('data-phase', 'submitting')
        expect(screen.getByRole('button', { name: 'Checking' })).toBeDisabled()
        expect(document.body.textContent).not.toContain('flag{secret}')
        // A second press while the first is on its way does nothing
        fireEvent.submit(box().closest('form') as HTMLFormElement)
        expect(submit.mutate).toHaveBeenCalledTimes(1)
    })

    it('says how many tries are left after a wrong flag, and lets the player try again', () => {
        renderForm()
        send('flag{nope}')
        act(() => { last()[1].onSuccess?.({ correct: false, message: 'Incorrect flag', attemptsRecent: 8, attemptLimit: 10, windowSeconds: 60 }); last()[1].onSettled?.() })
        const notice = screen.getByTestId('wrong-notice')
        expect(notice).toHaveTextContent('That is not the flag')
        expect(notice).toHaveTextContent('8 of 10 tries used in the last minute; 2 left.')
        expect(screen.getByTestId('flag-status')).toHaveAttribute('aria-live', 'polite')
        expect(screen.getByRole('button', { name: 'Submit flag' })).toBeEnabled()
        expect(submit.reset).toHaveBeenCalled()
    })

    it('shows the points, first blood, the account award and new badges for a right flag', () => {
        renderForm()
        send('flag{yes}')
        act(() => {
            last()[1].onSuccess?.({
                correct: true, message: 'Correct', pointsEarned: 90, firstBlood: true, scope: 'team', teamId: 't1', accountPointsAwarded: true,
                newBadges: [{ code: 'first', name: 'First Blood' }],
            })
        })
        const ok = screen.getByTestId('flag-success')
        expect(ok).toHaveAttribute('role', 'status')
        expect(ok).toHaveTextContent('+90 points')
        expect(ok).toHaveTextContent('your team')
        expect(ok).toHaveTextContent('First blood')
        expect(ok).toHaveTextContent('global leaderboard')
        expect(screen.getByTestId('new-badges')).toHaveTextContent('First Blood')
    })

    it('switches the box off for the wait after a 429 and gives it back when the time is up', () => {
        vi.useFakeTimers()
        renderForm()
        send('flag{a}')
        act(() => { last()[1].onError?.(new ApiError('slow down', 429, 'RATE_LIMIT_EXCEEDED', undefined, { retryAfter: 5 })) })
        expect(screen.getByTestId('flag-form')).toHaveAttribute('data-phase', 'waiting')
        expect(box()).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Submit flag' })).toBeDisabled()
        const clock = screen.getByTestId('wait-clock')
        expect(clock).toHaveAttribute('role', 'timer')
        expect(clock).toHaveAttribute('aria-live', 'off')
        act(() => { vi.advanceTimersByTime(6000) })
        expect(screen.getByTestId('flag-form')).toHaveAttribute('data-phase', 'idle')
        expect(box()).toBeEnabled()
    })

    it('knows a challenge that was solved meanwhile', () => {
        renderForm()
        send('flag{a}')
        act(() => { last()[1].onError?.(new ApiError('x', 409, 'CTF_ALREADY_SOLVED')) })
        expect(screen.getByTestId('flag-solved')).toBeInTheDocument()
        expect(screen.queryByLabelText(/Flag/)).toBeNull()
    })

    it.each([
        ['CTF_ENDED', 'has ended'],
        ['CTF_CANCELLED', 'was cancelled'],
        ['CTF_NOT_STARTED', 'has not started'],
    ])('closes the form when the server says %s', (code, words) => {
        renderForm()
        send('flag{a}')
        act(() => { last()[1].onError?.(new ApiError('x', 403, code)) })
        expect(screen.getByTestId('flag-blocked')).toHaveTextContent(words)
    })

    it('lets the box open again a few seconds after "not started": the page clock may be ahead of the server', () => {
        vi.useFakeTimers()
        renderForm()
        send('flag{a}')
        act(() => { last()[1].onError?.(new ApiError('x', 403, 'CTF_NOT_STARTED')) })
        expect(screen.getByTestId('flag-blocked')).toHaveAttribute('data-reason', 'not-started')
        act(() => { vi.advanceTimersByTime(NOT_STARTED_RECHECK_MS - 1) })
        expect(screen.getByTestId('flag-blocked')).toBeInTheDocument()
        act(() => { vi.advanceTimersByTime(1) })
        expect(screen.queryByTestId('flag-blocked')).toBeNull()
        expect(box()).toBeEnabled()
    })

    it('recovers from "not started" when the competition status moves, and keeps "ended" for good', () => {
        const view = renderForm()
        send('flag{a}')
        act(() => { last()[1].onError?.(new ApiError('x', 403, 'CTF_NOT_STARTED')); last()[1].onSettled?.() })
        // The page's clock now agrees with the server: upcoming, then live again at the start
        view.rerender(<CtfFlagForm slug="winter-ctf" challenge={challenge} status="upcoming" signedIn teamIssue={null} onTeamTab={vi.fn()} />)
        view.rerender(<CtfFlagForm slug="winter-ctf" challenge={challenge} status="live" signedIn teamIssue={null} onTeamTab={vi.fn()} />)
        expect(screen.queryByTestId('flag-blocked')).toBeNull()
        expect(box()).toBeEnabled()

        send('flag{b}')
        act(() => { last()[1].onError?.(new ApiError('x', 403, 'CTF_ENDED')) })
        view.rerender(<CtfFlagForm slug="winter-ctf" challenge={challenge} status="frozen" signedIn teamIssue={null} onTeamTab={vi.fn()} />)
        expect(screen.getByTestId('flag-blocked')).toHaveTextContent('has ended')
    })

    it('sends the player to the team tab when a team is needed or too small', () => {
        const onTeamTab = vi.fn()
        renderForm({ teamIssue: { reason: 'team-too-small', message: 'Your team has 1 member. It needs at least 2 to send flags.' }, onTeamTab })
        const blocked = screen.getByTestId('flag-blocked')
        expect(blocked).toHaveTextContent('needs at least 2')
        fireEvent.click(screen.getByRole('button', { name: /Open the team tab/ }))
        expect(onTeamTab).toHaveBeenCalled()
        expect(screen.queryByLabelText(/Flag/)).toBeNull()
    })

    it('shows a plain error for anything else and keeps the form open', () => {
        renderForm()
        send('flag{a}')
        act(() => { last()[1].onError?.(new ApiError('boom', 500)) })
        expect(screen.getByTestId('flag-status')).toHaveTextContent('boom')
        expect(box()).toBeEnabled()
    })

    it.each([
        ['upcoming', 'Flags are accepted when the competition starts.'],
        ['ended', 'flags are closed'],
        ['cancelled', 'flags are closed'],
        ['draft', 'flags are closed'],
    ] as const)('does not offer a box while the competition is %s', (status, words) => {
        renderForm({ status })
        expect(screen.getByTestId('flag-closed')).toHaveTextContent(words)
        expect(screen.queryByLabelText(/Flag/)).toBeNull()
    })

    it('asks a visitor to sign in, and shows an already solved challenge as solved', () => {
        const visitor = renderForm({ signedIn: false })
        expect(screen.getByTestId('flag-signin')).toHaveTextContent('Sign in')
        visitor.unmount()
        renderForm({ challenge: { ...challenge, solved: true } })
        expect(screen.getByTestId('flag-solved')).toBeInTheDocument()
    })

    it('marks the box as private for tools that record the page', () => {
        renderForm()
        expect(box()).toHaveAttribute('data-private', 'true')
        expect(box()).toHaveAttribute('autocomplete', 'off')
    })
})
