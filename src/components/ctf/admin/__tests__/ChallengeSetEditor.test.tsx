import { useState } from 'react'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCompetition } from '@/lib/ctf/__tests__/fixtures'
import type { CtfCompetition } from '@/types/ctf'

const addToast = vi.fn()
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ addToast }) }))
type Callbacks = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void }
const add = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const take = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const order = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
const PICKER = [
    { _id: 'p1', title: 'Cookie Monster', category: 'web-security', difficulty: 'easy', basePoints: 100, status: 'active' },
    { _id: 'p2', title: 'Padding Oracle', category: 'cryptography', difficulty: 'hard', basePoints: 300, status: 'active' },
    { _id: 'p4', title: 'Spare', category: 'forensics', difficulty: 'easy', basePoints: 50, status: 'active' },
]
vi.mock('@/hooks/queries/useCtf', () => ({
    useAddCtfChallenge: () => add, useRemoveCtfChallenge: () => take, useSetCtfChallenges: () => order,
    useCtfPickerChallenges: () => ({ data: { items: PICKER, hasMore: false }, isLoading: false, isError: false, refetch: vi.fn() }),
}))

import { ChallengeSetEditor } from '../ChallengeSetEditor'

const call = (m: { mutate: ReturnType<typeof vi.fn> }) => m.mutate.mock.calls[m.mutate.mock.calls.length - 1] as [Record<string, unknown>, Callbacks]
const detail = (id: string, title: string, solveCount = 0) => ({ _id: id, position: 0, title, category: 'misc', difficulty: 'easy', basePoints: 10, status: 'active', solveCount })
const saved = (ids: string[], names: Record<string, string>) => makeCompetition({
    _id: 'c1', status: 'upcoming', challenges: ids,
    challengeDetails: ids.map((id) => detail(id, names[id])),
}) as CtfCompetition
const NAMES = { a: 'Alpha', b: 'Bravo', c: 'Charlie' }

const renderSaved = (ids = ['a', 'b', 'c']) => {
    const view = render(<ChallengeSetEditor competition={saved(ids, NAMES)} value={[]} onChange={vi.fn()} />)
    return { ...view, to: (next: string[]) => view.rerender(<ChallengeSetEditor competition={saved(next, NAMES)} value={[]} onChange={vi.fn()} />) }
}

beforeEach(() => {
    vi.clearAllMocks()
    for (const m of [add, take, order]) m.isPending = false
})

describe('set editor: controls', () => {
    it('keeps every control focusable and says it is off with aria-disabled, never the disabled attribute', () => {
        renderSaved()
        const up = screen.getByRole('button', { name: 'Move Alpha up' })
        const down = screen.getByRole('button', { name: 'Move Charlie down' })
        for (const b of [up, down]) {
            expect(b).toHaveAttribute('aria-disabled', 'true')
            expect(b).not.toBeDisabled()
        }
        up.focus()
        expect(document.activeElement).toBe(up)
    })

    it('ignores clicks while a change is being saved', () => {
        order.isPending = true
        renderSaved()
        const move = screen.getByRole('button', { name: 'Move Bravo up' })
        expect(move).toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(move)
        fireEvent.click(screen.getByRole('button', { name: 'Remove Bravo' }))
        fireEvent.click(screen.getByRole('button', { name: /Add Padding Oracle/ }))
        expect(order.mutate).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(add.mutate).not.toHaveBeenCalled()
        expect(screen.getByTestId('set-list')).toHaveAttribute('aria-busy', 'true')
    })

    it('ignores a click on Add for a challenge already in the set', () => {
        render(<ChallengeSetEditor value={['p1']} onChange={vi.fn()} />)
        const inSet = screen.getByRole('button', { name: 'Cookie Monster is in the set' })
        expect(inSet).toHaveAttribute('aria-disabled', 'true')
        const onChange = vi.fn()
        render(<ChallengeSetEditor value={['p1']} onChange={onChange} />)
        fireEvent.click(screen.getAllByRole('button', { name: 'Cookie Monster is in the set' })[1])
        expect(onChange).not.toHaveBeenCalled()
    })
})

describe('set editor: focus after a change', () => {
    it('keeps focus on the Add button while a challenge is added, and shows it as in the set afterwards', () => {
        const view = renderSaved(['a'])
        const addButton = screen.getByRole('button', { name: 'Add Padding Oracle' })
        addButton.focus()
        fireEvent.click(addButton)
        expect(call(add)[0]).toEqual({ id: 'c1', challengeId: 'p2' })
        expect(document.activeElement).toBe(addButton)
        view.rerender(<ChallengeSetEditor competition={{ ...saved(['a', 'p2'], { ...NAMES, p2: 'Padding Oracle' }) }} value={[]} onChange={vi.fn()} />)
        const same = screen.getByRole('button', { name: 'Padding Oracle is in the set' })
        expect(same).toHaveAttribute('aria-disabled', 'true')
        expect(document.activeElement).toBe(same)
    })

    it('keeps focus on the moved row, on the button that moved it, so the same key moves it again', () => {
        const view = renderSaved()
        const down = screen.getByRole('button', { name: 'Move Alpha down' })
        down.focus()
        fireEvent.click(down)
        expect(call(order)[0]).toEqual({ id: 'c1', challenges: ['b', 'a', 'c'] })
        // The server answers with the new order
        view.to(['b', 'a', 'c'])
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Alpha down' }))
    })

    it('falls back to the other move button when the row reached an end', () => {
        const view = renderSaved()
        const down = screen.getByRole('button', { name: 'Move Bravo down' })
        down.focus()
        fireEvent.click(down)
        view.to(['a', 'c', 'b'])
        // Bravo is last now: its Down button is off, so focus goes to Up
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Bravo up' }))
    })

    it('does not steal focus when the move failed', () => {
        const view = renderSaved()
        screen.getByRole('button', { name: 'Move Alpha down' }).click()
        act(() => { call(order)[1].onError?.(new Error('boom')) })
        const other = screen.getByRole('button', { name: 'Remove Charlie' })
        other.focus()
        view.to(['a', 'b', 'c'])
        expect(document.activeElement).toBe(other)
    })

    it('puts focus on the row that took the place of a removed one', () => {
        const view = renderSaved()
        fireEvent.click(screen.getByRole('button', { name: 'Remove Bravo' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove challenge' }))
        view.to(['a', 'c'])
        const rows = screen.getAllByTestId('set-row')
        expect(document.activeElement).toBe(rows[1])
        expect(rows[1]).toHaveTextContent('Charlie')
    })

    it('puts focus on the previous row when the last one was removed', () => {
        const view = renderSaved()
        fireEvent.click(screen.getByRole('button', { name: 'Remove Charlie' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove challenge' }))
        view.to(['a', 'b'])
        expect(document.activeElement).toBe(screen.getAllByTestId('set-row')[1])
    })

    it('puts focus on the list heading when nothing is left', () => {
        const view = renderSaved(['a'])
        fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove challenge' }))
        view.to([])
        expect(document.activeElement).toBe(screen.getByTestId('set-count'))
    })

    it('keeps focus in a new competition too: moving and removing in the form', () => {
        function Harness() {
            const [ids, setIds] = useState<string[]>(['p1', 'p2', 'p4'])
            return <ChallengeSetEditor value={ids} onChange={setIds} />
        }
        render(<Harness />)
        const down = screen.getAllByRole('button', { name: /Move .* down/ })[0]
        down.focus()
        fireEvent.click(down)
        const moved = screen.getAllByTestId('set-row')[1]
        expect(moved.contains(document.activeElement)).toBe(true)
        const first = screen.getAllByTestId('set-row')[0]
        fireEvent.click(within(first).getByRole('button', { name: /^Remove / }))
        expect(screen.getAllByTestId('set-row')).toHaveLength(2)
        expect(document.activeElement).toBe(screen.getAllByTestId('set-row')[0])
    })
})
