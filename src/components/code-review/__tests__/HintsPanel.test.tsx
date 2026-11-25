import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { makeDetail, makeViewer } from '@/lib/codeReview/__tests__/fixtures'

type Callbacks = { onSuccess?: () => void; onError?: (e: unknown) => void; onSettled?: () => void }
const unlock = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('@/hooks/queries/useCodeReview', () => ({ useUnlockHint: () => unlock }))

import { HintsPanel } from '../HintsPanel'

const member = (over = {}) => makeDetail({ viewer: makeViewer({ status: 'in-progress', attempts: 1, pointsAvailable: 25, solutionUnlocked: true }), ...over })

beforeEach(() => { vi.clearAllMocks(); unlock.isPending = false })

describe('HintsPanel', () => {
    it('shows every hint with its cost, and the text only of an opened one', () => {
        render(<HintsPanel snippet={member({ hints: [{ order: 1, cost: 3, unlocked: true, text: 'Look at the **query**.' }, { order: 2, cost: 5, unlocked: false }] })} signedIn staff={false} />)
        const hints = screen.getAllByTestId('cr-hint')
        expect(hints[0]).toHaveTextContent('Costs 3 points')
        expect(hints[0]).toHaveTextContent('Opened')
        expect(hints[0]).toHaveTextContent('Look at the query.')
        expect(hints[1]).toHaveTextContent('Costs 5 points')
        expect(hints[1]).not.toHaveTextContent('Opened')
        expect(within(hints[1]).getByRole('button', { name: 'Open hint 2' })).toBeEnabled()
    })

    it('opens hints in order: only the next closed one has a working button', () => {
        render(<HintsPanel snippet={member()} signedIn staff={false} />)
        expect(screen.getByRole('button', { name: 'Open hint 1' })).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Open hint 2' })).toBeDisabled()
        expect(screen.getByText('Opens after hint 1.')).toBeInTheDocument()
    })

    it('counts a hint the viewer block says was opened as opened', () => {
        render(<HintsPanel snippet={member({ viewer: makeViewer({ hintsUnlocked: [1], pointsAvailable: 22 }), hints: [{ order: 1, cost: 3, unlocked: false }, { order: 2, cost: 5, unlocked: false }] })} signedIn staff={false} />)
        expect(screen.getByRole('button', { name: 'Open hint 2' })).toBeEnabled()
    })

    it('asks first, naming the cost and what a pass pays now', () => {
        render(<HintsPanel snippet={member()} signedIn staff={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('takes 3 points off what a pass pays')
        expect(dialog).toHaveTextContent('a perfect pass pays 25 points now')
        expect(unlock.mutate).not.toHaveBeenCalled()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Open for 3 points' }))
        expect(unlock.mutate).toHaveBeenCalledWith({ ref: 'sql-injection-login', order: 1 }, expect.any(Object))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens nothing when the member keeps the hint closed', () => {
        render(<HintsPanel snippet={member()} signedIn staff={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        fireEvent.click(screen.getByRole('button', { name: 'Keep it closed' }))
        expect(unlock.mutate).not.toHaveBeenCalled()
    })

    it('says a hint costs nothing when no points are left or it is free', () => {
        const { unmount } = render(<HintsPanel snippet={member({ viewer: makeViewer({ pointsAvailable: 0 }) })} signedIn staff={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        expect(screen.getByRole('dialog')).toHaveTextContent('costs you nothing')
        unmount()
        render(<HintsPanel snippet={member({ hints: [{ order: 1, cost: 0, unlocked: false }] })} signedIn staff={false} />)
        expect(screen.getByTestId('cr-hint')).toHaveTextContent('Free')
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        expect(screen.getByRole('dialog')).toHaveTextContent('This hint is free')
    })

    it('shows the error of a failed open under that hint, with the order hint from the server', () => {
        unlock.mutate.mockImplementation((_v: unknown, cb: Callbacks) => { cb.onError?.(new ApiError('x', 409, 'CR_HINT_OUT_OF_ORDER', undefined, { next: 1 })); cb.onSettled?.() })
        render(<HintsPanel snippet={member()} signedIn staff={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        fireEvent.click(screen.getByRole('button', { name: 'Open for 3 points' }))
        expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Open hint 1 first')
    })

    it('announces an opened hint', () => {
        unlock.mutate.mockImplementation((_v: unknown, cb: Callbacks) => { cb.onSuccess?.(); cb.onSettled?.() })
        render(<HintsPanel snippet={member()} signedIn staff={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open hint 1' }))
        fireEvent.click(screen.getByRole('button', { name: 'Open for 3 points' }))
        expect(screen.getByTestId('hint-announcement')).toHaveTextContent('Hint 1 opened. It took 3 points off what a pass pays.')
    })

    it('a visitor sees the costs and cannot open anything', () => {
        render(<HintsPanel snippet={makeDetail({ viewer: null })} signedIn={false} staff={false} />)
        expect(screen.getByTestId('hints-locked-note')).toHaveTextContent('Sign in to open hints')
        expect(screen.getByRole('button', { name: 'Open hint 1' })).toBeDisabled()
        expect(screen.queryByTestId('hint-text')).not.toBeInTheDocument()
    })

    it('staff read the texts for free, with no buttons', () => {
        render(<HintsPanel snippet={makeDetail({ viewer: makeViewer(), hints: [{ order: 1, cost: 3, unlocked: false, text: 'Secret hint' }] })} signedIn staff />)
        expect(screen.getByText('Secret hint')).toBeInTheDocument()
        expect(screen.getByText('Staff preview')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Open hint/ })).not.toBeInTheDocument()
    })

    it('draws nothing for an exercise without hints', () => {
        const { container } = render(<HintsPanel snippet={member({ hints: [] })} signedIn staff={false} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('shows hint text as text', () => {
        render(<HintsPanel snippet={member({ hints: [{ order: 1, cost: 3, unlocked: true, text: '<img src=x onerror="window.__x=1"> and `payload`' }] })} signedIn staff={false} />)
        expect(document.querySelector('img')).toBeNull()
        expect(screen.getByTestId('hint-text')).toHaveTextContent('<img src=x onerror="window.__x=1">')
    })
})
