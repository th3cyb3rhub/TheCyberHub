import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeLab, makeViewer } from '@/lib/labs/__tests__/fixtures'

type Callbacks = { onError?: (e: unknown) => void; onSettled?: () => void }
const unlock = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useLabs', () => ({ useUnlockHint: () => unlock }))

import { LabHints, hintPrice } from '../LabHints'

const started = (over = {}) => makeLab({ viewer: makeViewer({ myStatus: 'in-progress', pointsAvailable: 50 }), ...over })

beforeEach(() => { vi.clearAllMocks(); unlock.isPending = false })

describe('hint price', () => {
    it('never costs more than what is left', () => {
        expect(hintPrice(50, 20)).toEqual({ cost: 20, after: 30 })
        expect(hintPrice(15, 20)).toEqual({ cost: 15, after: 0 })
        expect(hintPrice(0, 20)).toEqual({ cost: 0, after: 0 })
    })
})

describe('LabHints', () => {
    it('shows every hint with its cost, and only the text of opened ones', () => {
        const lab = started({ hints: [{ index: 0, penalty: 10, unlocked: true, text: 'Look at the **login** form.' }, { index: 1, penalty: 20, unlocked: false }] })
        render(<LabHints lab={lab} signedIn />)
        const hints = screen.getAllByTestId('lab-hint')
        expect(hints[0]).toHaveTextContent('Costs 10 points')
        expect(hints[0]).toHaveTextContent('Opened')
        expect(hints[0]).toHaveTextContent('Look at the login form.')
        expect(hints[1]).toHaveTextContent('Costs 20 points')
        expect(hints[1]).not.toHaveTextContent('Opened')
        expect(within(hints[1]).getByRole('button', { name: 'Open hint 2' })).toBeEnabled()
    })

    it('asks first, naming what the hint costs and what is left', () => {
        render(<LabHints lab={started()} signedIn />)
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 2' }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('takes 20 points off this lab')
        expect(dialog).toHaveTextContent('you would earn 30 instead of 50')
        expect(unlock.mutate).not.toHaveBeenCalled()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Open for 20 points' }))
        expect(unlock.mutate).toHaveBeenCalledWith({ slug: 'sql-injection-basics', hintIndex: 1 }, expect.any(Object))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens nothing when the member keeps the hint closed', () => {
        render(<LabHints lab={started()} signedIn />)
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        fireEvent.click(screen.getByRole('button', { name: 'Keep it closed' }))
        expect(unlock.mutate).not.toHaveBeenCalled()
    })

    it('says a hint is free when no points are left to take', () => {
        render(<LabHints lab={started({ viewer: makeViewer({ myStatus: 'in-progress', pointsAvailable: 0 }) })} signedIn />)
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        expect(screen.getByRole('dialog')).toHaveTextContent('costs nothing')
    })

    it('shows the server error under the hint', () => {
        render(<LabHints lab={started()} signedIn />)
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        fireEvent.click(screen.getByRole('button', { name: /Open for/ }))
        const cb = unlock.mutate.mock.calls[0][1] as Callbacks
        act(() => { cb.onError?.(new ApiError('x', 404, 'LAB_HINT_NOT_FOUND')); cb.onSettled?.() })
        expect(screen.getByRole('alert')).toHaveTextContent('This hint does not exist any more')
    })

    it('keeps hints closed with the reason for a visitor, a member who has not started, and a completed lab', () => {
        const { unmount } = render(<LabHints lab={makeLab({ viewer: null })} signedIn={false} />)
        expect(screen.getByTestId('hints-locked-note')).toHaveTextContent('Sign in and start the lab')
        expect(screen.getByRole('button', { name: 'Open hint 1' })).toBeDisabled()
        unmount()
        const second = render(<LabHints lab={makeLab()} signedIn />)
        expect(screen.getByTestId('hints-locked-note')).toHaveTextContent('Start the lab to open hints')
        expect(screen.getByRole('button', { name: 'Open hint 1' })).toBeDisabled()
        second.unmount()
        render(<LabHints lab={makeLab({ viewer: makeViewer({ myStatus: 'completed' }) })} signedIn />)
        expect(screen.getByTestId('hints-locked-note')).toHaveTextContent('completed')
        expect(screen.getByRole('button', { name: 'Open hint 1' })).toBeDisabled()
    })

    it('shows hint text to staff without opening it', () => {
        const lab = makeLab({ viewer: null, hints: [{ index: 0, penalty: 10, unlocked: false, text: 'Staff only text' }] })
        render(<LabHints lab={lab} signedIn />)
        expect(screen.getByTestId('lab-hint')).toHaveTextContent('Staff preview')
        expect(screen.getByTestId('lab-hint')).toHaveTextContent('Staff only text')
    })

    it('renders hint text as inert markdown: no script, no handler, no javascript link', () => {
        const text = '<script>alert(1)</script><img src=x onerror=alert(2)> [click](javascript:alert(3)) `<b>code</b>`'
        const lab = started({ hints: [{ index: 0, penalty: 10, unlocked: true, text }] })
        const { container } = render(<LabHints lab={lab} signedIn />)
        expect(container.querySelector('script')).toBeNull()
        expect(container.querySelector('img')).toBeNull()
        expect(container.querySelector('[onerror]')).toBeNull()
        expect(container.querySelector('a[href^="javascript"]')).toBeNull()
        expect(container.querySelector('b')).toBeNull()
        expect(screen.getByTestId('lab-hint')).toHaveTextContent('<script>alert(1)</script>')
    })
})
