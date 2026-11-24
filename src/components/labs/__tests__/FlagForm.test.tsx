import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeLab, makeViewer } from '@/lib/labs/__tests__/fixtures'

type Callbacks = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void; onSettled?: () => void }
const mutation = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn() }))
vi.mock('@/hooks/queries/useLabs', () => ({
    useSubmitFlag: () => mutation,
    useNextLabCards: () => ({ data: [], isLoading: false }),
}))
vi.mock('@/components/internships/ViewerTime', () => ({ ViewerTime: ({ iso }: { iso: string }) => <time>{iso}</time> }))

import { FlagForm } from '../FlagForm'

const lab = (over = {}) => makeLab({ viewer: makeViewer({ myStatus: 'in-progress' }), ...over })
const type = (value: string) => fireEvent.change(screen.getByLabelText('Flag'), { target: { value } })
const send = () => fireEvent.click(screen.getByRole('button', { name: /Submit flag/ }))
const lastCall = () => mutation.mutate.mock.calls[mutation.mutate.mock.calls.length - 1] as [{ slug: string; flag: string }, Callbacks]

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => vi.useRealTimers())

describe('FlagForm', () => {
    it('sends the trimmed flag and clears the box at once', () => {
        render(<FlagForm lab={lab()} />)
        type('  flag{abc}  ')
        send()
        expect(lastCall()[0]).toEqual({ slug: 'sql-injection-basics', flag: 'flag{abc}' })
        expect(screen.getByLabelText('Flag')).toHaveValue('')
        expect(screen.getByRole('button', { name: /Checking/ })).toBeDisabled()
    })

    it('does not send an empty flag and says why', () => {
        render(<FlagForm lab={lab()} />)
        type('   ')
        send()
        expect(mutation.mutate).not.toHaveBeenCalled()
        expect(screen.getByLabelText('Flag')).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText('Enter the flag before you send it')).toBeInTheDocument()
    })

    it('cannot be sent twice while the first is on its way', () => {
        render(<FlagForm lab={lab()} />)
        type('flag{a}')
        send()
        type('flag{b}')
        fireEvent.submit(screen.getByTestId('flag-form').querySelector('form') as HTMLFormElement)
        expect(mutation.mutate).toHaveBeenCalledTimes(1)
    })

    it('keeps the flag off the page, out of storage and out of the markup', () => {
        const { container } = render(<FlagForm lab={lab()} />)
        type('flag{topsecret}')
        send()
        expect(container.innerHTML).not.toContain('topsecret')
        expect(JSON.stringify({ ...window.localStorage })).not.toContain('topsecret')
        const input = screen.getByLabelText('Flag')
        expect(input).toHaveAttribute('autocomplete', 'off')
        expect(input).toHaveAttribute('data-private', 'true')
        expect(input).toHaveAttribute('maxlength', '500')
    })

    it('shows the attempts left after a wrong flag, in a live region, and opens the box again', async () => {
        render(<FlagForm lab={lab()} />)
        type('nope')
        send()
        await act(async () => {
            const cb = lastCall()[1]
            cb.onSuccess?.({ correct: false, attempts: 2, status: 'started', pointsEarned: 0, attemptsLeft: 3, lockedUntil: null })
            cb.onSettled?.()
        })
        expect(screen.getByTestId('wrong-notice')).toHaveTextContent('That is not the flag. 2 attempts so far, 3 left before this lab locks.')
        expect(screen.getByTestId('flag-status')).toHaveAttribute('aria-live', 'polite')
        expect(screen.getByLabelText('Flag')).toBeEnabled()
        expect(mutation.reset).toHaveBeenCalled()
    })

    it('locks with a live countdown, disables the form and opens again when it ends', async () => {
        vi.useFakeTimers()
        const onUnlocked = vi.fn()
        render(<FlagForm lab={lab()} onUnlocked={onUnlocked} />)
        type('nope')
        send()
        const until = new Date(Date.now() + 3000).toISOString()
        await act(async () => { lastCall()[1].onSuccess?.({ correct: false, attempts: 5, status: 'started', pointsEarned: 0, attemptsLeft: 0, lockedUntil: until }) })
        expect(screen.getByTestId('lock-notice')).toBeInTheDocument()
        expect(screen.getByTestId('lock-clock')).toHaveTextContent('0:03')
        expect(screen.getByLabelText('Flag')).toBeDisabled()
        expect(screen.getByRole('button', { name: /Submit flag/ })).toBeDisabled()
        expect(screen.getByTestId('flag-status')).toHaveTextContent(/locked for about 1 minute/)
        act(() => { vi.advanceTimersByTime(1000) })
        expect(screen.getByTestId('lock-clock')).toHaveTextContent('0:02')
        act(() => { vi.advanceTimersByTime(2500) })
        expect(screen.queryByTestId('lock-notice')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Flag')).toBeEnabled()
        expect(onUnlocked).toHaveBeenCalledTimes(1)
    })

    it('opens already locked when the lab says so', () => {
        const lockedUntil = new Date(Date.now() + 120_000).toISOString()
        render(<FlagForm lab={lab({ viewer: makeViewer({ myStatus: 'in-progress', lockedUntil }) })} />)
        expect(screen.getByTestId('lock-notice')).toBeInTheDocument()
        expect(screen.getByLabelText('Flag')).toBeDisabled()
    })

    it('reload while locked: disabled, with the wait counted from when the lab was read, whatever the server instant says', () => {
        // lockedUntil is 20 minutes in the browser's future (a server clock that runs ahead); the wait is 10 minutes
        const lockedUntil = new Date(Date.now() + 20 * 60_000).toISOString()
        const lockEndsAt = Date.now() + 600_000
        render(<FlagForm lab={lab({ viewer: makeViewer({ myStatus: 'in-progress', lockedUntil, lockedForSeconds: 600, lockEndsAt }) })} />)
        expect(screen.getByTestId('lock-notice')).toBeInTheDocument()
        expect(screen.getByLabelText('Flag')).toBeDisabled()
        expect(screen.getByTestId('lock-clock')).toHaveTextContent('10:00')
    })

    it('is open when the API says not locked, even if an old lockedUntil is still in the future', () => {
        const lockedUntil = new Date(Date.now() + 20 * 60_000).toISOString()
        render(<FlagForm lab={lab({ viewer: makeViewer({ myStatus: 'in-progress', lockedUntil, lockedForSeconds: null, lockEndsAt: null }) })} />)
        expect(screen.queryByTestId('lock-notice')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Flag')).toBeEnabled()
    })

    it('locks from a wrong flag answer by its lockedForSeconds, not its lockedUntil', async () => {
        render(<FlagForm lab={lab()} />)
        type('x')
        send()
        const skewed = new Date(Date.now() - 5 * 60_000).toISOString() // server clock 5 minutes behind: the instant is already past here
        await act(async () => { lastCall()[1].onSuccess?.({ correct: false, attempts: 5, status: 'started', pointsEarned: 0, attemptsLeft: 0, lockedUntil: skewed, lockedForSeconds: 900 }) })
        expect(screen.getByTestId('lock-clock')).toHaveTextContent('15:00')
    })

    it('locks from a 429 using the wait the API names', async () => {
        render(<FlagForm lab={lab()} />)
        type('x')
        send()
        await act(async () => { lastCall()[1].onError?.(new ApiError('locked', 429, 'LAB_LOCKED', undefined, { retryAfter: 600 })) })
        expect(screen.getByTestId('lock-clock')).toHaveTextContent('10:00')
    })

    it('asks to send again on a busy answer', async () => {
        render(<FlagForm lab={lab()} />)
        type('x')
        send()
        await act(async () => { lastCall()[1].onError?.(new ApiError('busy', 409, 'LAB_BUSY')) })
        expect(screen.getByTestId('flag-status')).toHaveTextContent(/send it again/)
        expect(screen.getByLabelText('Flag')).toBeEnabled()
    })

    it('shows the success state with the points and the new badges', async () => {
        render(<FlagForm lab={lab({ points: 50 })} />)
        type('flag{ok}')
        send()
        await act(async () => {
            lastCall()[1].onSuccess?.({ correct: true, attempts: 1, status: 'completed', pointsEarned: 40, completedAt: '2030-01-01T00:00:00Z', newBadges: [{ code: 'b', name: 'First blood', icon: 'x', rarity: 'rare' }] })
        })
        expect(screen.getByRole('heading', { name: 'Flag accepted' })).toBeInTheDocument()
        expect(screen.getByTestId('points-earned')).toHaveTextContent('40 points')
        expect(screen.getByTestId('points-earned')).toHaveTextContent('of 50')
        expect(screen.getByTestId('new-badges')).toHaveTextContent('First blood')
        expect(screen.queryByLabelText('Flag')).not.toBeInTheDocument()
    })

    it('shows the completed state when the lab was already completed', async () => {
        render(<FlagForm lab={lab()} />)
        type('x')
        send()
        await act(async () => { lastCall()[1].onError?.(new ApiError('done', 409, 'LAB_ALREADY_COMPLETED')) })
        expect(screen.getByRole('heading', { name: 'Lab completed' })).toBeInTheDocument()
    })

    it('shows the completed state for a lab that is completed on load', () => {
        render(<FlagForm lab={lab({ viewer: makeViewer({ myStatus: 'completed', pointsAwarded: 30, pointsAvailable: 30, completedAt: '2030-01-01T00:00:00Z' }) })} />)
        expect(screen.getByRole('heading', { name: 'Lab completed' })).toBeInTheDocument()
        expect(screen.getByTestId('points-earned')).toHaveTextContent('30 points')
        expect(screen.queryByLabelText('Flag')).not.toBeInTheDocument()
    })
})
