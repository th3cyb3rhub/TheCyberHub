import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { splitCode, type MarkDraft } from '@/lib/codeReview/selection'
import { CODE } from '@/lib/codeReview/__tests__/fixtures'
import { LineMarker } from '../LineMarker'

const LINES = splitCode(CODE)

function Harness({ initial = [], onChange }: { initial?: MarkDraft[]; onChange?: (m: MarkDraft[]) => void }) {
    const [marks, setMarks] = useState<MarkDraft[]>(initial)
    return <LineMarker lines={LINES} marks={marks} onMarksChange={(m) => { setMarks(m); onChange?.(m) }} />
}

const line = (n: number) => document.getElementById(`cr-line-${n}`) as HTMLElement
const list = () => screen.getByRole('listbox')
const status = () => screen.getByTestId('selection-status')

describe('the code is text with line numbers', () => {
    it('shows one row per line and escapes everything', () => {
        const hostile = ['<img src=x onerror="window.__pwn=1">', '<script>window.__pwn=2</script>', 'a < b && c > d']
        render(<LineMarker lines={hostile} marks={[]} onMarksChange={() => undefined} />)
        const options = within(list()).getAllByRole('option')
        expect(options).toHaveLength(3)
        expect(options[0]).toHaveTextContent('<img src=x onerror="window.__pwn=1">')
        expect(document.querySelector('img')).toBeNull()
        expect(document.querySelector('script')).toBeNull()
        expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined()
        expect(options[2]).toHaveTextContent('a < b && c > d')
    })

    it('keeps indentation and shows an empty line as a row', () => {
        render(<LineMarker lines={['    indented', '', 'end']} marks={[]} onMarksChange={() => undefined} />)
        expect(within(list()).getAllByRole('option')).toHaveLength(3)
        expect(within(list()).getAllByRole('option')[0].querySelector('.whitespace-pre')).toHaveTextContent('indented')
    })

    it('numbers the lines from 1', () => {
        render(<Harness />)
        expect(line(1)).toHaveTextContent(/^1/)
        expect(line(7)).toHaveTextContent(/^7/)
    })
})

describe('picking lines with the pointer', () => {
    it('a click selects the line, shift-click extends to a range', () => {
        render(<Harness />)
        expect(status()).toHaveTextContent('No lines selected.')
        fireEvent.click(line(3))
        expect(status()).toHaveTextContent('Selected: line 3')
        expect(line(3)).toHaveAttribute('aria-selected', 'true')
        fireEvent.click(line(6), { shiftKey: true })
        expect(status()).toHaveTextContent('lines 3 to 6 (4 lines)')
        expect(line(4)).toHaveAttribute('aria-selected', 'true')
        expect(line(7)).toHaveAttribute('aria-selected', 'false')
        // shift-click above the anchor
        fireEvent.click(line(1), { shiftKey: true })
        expect(status()).toHaveTextContent('lines 1 to 3')
    })

    it('a plain click after a range starts a new selection', () => {
        render(<Harness />)
        fireEvent.click(line(2))
        fireEvent.click(line(5), { shiftKey: true })
        fireEvent.click(line(7))
        expect(status()).toHaveTextContent('Selected: line 7')
    })

    it('works on touch: tap a line, press Select a range, tap the last line (no shift key, no drag)', () => {
        render(<Harness />)
        const range = screen.getByTestId('range-mode')
        expect(range).toBeDisabled()
        fireEvent.click(line(2))
        expect(range).toBeEnabled()
        fireEvent.click(range)
        expect(range).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(line(5))
        expect(status()).toHaveTextContent('lines 2 to 5')
        // the mode turns itself off after one range
        expect(range).toHaveAttribute('aria-pressed', 'false')
    })

    it('Mark selection puts the range on the list', () => {
        const onChange = vi.fn()
        render(<Harness onChange={onChange} />)
        expect(screen.getByTestId('mark-selection')).toBeDisabled()
        fireEvent.click(line(4))
        fireEvent.click(line(5), { shiftKey: true })
        fireEvent.click(screen.getByTestId('mark-selection'))
        expect(onChange).toHaveBeenLastCalledWith([{ lineStart: 4, lineEnd: 5 }])
        expect(screen.getByTestId('marker-note')).toHaveTextContent('Marked lines 4 to 5.')
        expect(line(4)).toHaveAttribute('data-tone', 'mark')
        expect(line(6)).not.toHaveAttribute('data-tone')
        // a marked line says so to a screen reader
        expect(line(4)).toHaveTextContent('(marked)')
    })

    it('uses the type chosen for new marks', () => {
        const onChange = vi.fn()
        render(<Harness onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Type for new marks (optional)'), { target: { value: 'sqli' } })
        fireEvent.click(line(4))
        fireEvent.click(screen.getByTestId('mark-selection'))
        expect(onChange).toHaveBeenLastCalledWith([{ lineStart: 4, lineEnd: 4, vulnerabilityType: 'sqli' }])
    })

    it('says so when the lines are already marked, joins an overlapping mark, and stops at 50', () => {
        render(<Harness initial={[{ lineStart: 2, lineEnd: 4 }]} />)
        fireEvent.click(line(3))
        fireEvent.click(screen.getByTestId('mark-selection'))
        expect(screen.getByTestId('marker-note')).toHaveTextContent('Line 3 is already marked.')
        fireEvent.click(line(4))
        fireEvent.click(line(6), { shiftKey: true })
        fireEvent.click(screen.getByTestId('mark-selection'))
        expect(screen.getByTestId('marker-note')).toHaveTextContent('joined')
        expect(line(6)).toHaveAttribute('data-tone', 'mark')
        expect(line(2)).toHaveAttribute('data-tone', 'mark')
    })

    it('disables marking and says why at the 50 mark ceiling', () => {
        const many = Array.from({ length: 50 }, (_, i) => ({ lineStart: i * 3 + 1, lineEnd: i * 3 + 1 }))
        const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`)
        const onChange = vi.fn()
        render(<LineMarker lines={lines} marks={many} onMarksChange={onChange} />)
        fireEvent.click(document.getElementById('cr-line-152') as HTMLElement)
        expect(screen.getByTestId('mark-selection')).toBeDisabled()
        expect(screen.getByTestId('limit-note')).toHaveTextContent('at most 50 marks')
        expect(onChange).not.toHaveBeenCalled()
    })

    it('disables marking beyond the marks of this exercise, and not inside a mark that exists', () => {
        const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`)
        const marks = [{ lineStart: 2, lineEnd: 2 }, { lineStart: 5, lineEnd: 5 }, { lineStart: 9, lineEnd: 9 }]
        render(<LineMarker lines={lines} marks={marks} onMarksChange={vi.fn()} limits={{ maxMarks: 3, maxLines: 12 }} />)
        fireEvent.click(document.getElementById('cr-line-20') as HTMLElement)
        expect(screen.getByTestId('mark-selection')).toBeDisabled()
        expect(screen.getByTestId('limit-note')).toHaveTextContent('at most 3 marks')
        // A line of a mark that exists is not "one more": it only says it is marked
        fireEvent.click(document.getElementById('cr-line-5') as HTMLElement)
        expect(screen.getByTestId('mark-selection')).not.toBeDisabled()
        expect(screen.queryByTestId('limit-note')).not.toBeInTheDocument()
    })

    it('disables marking beyond the lines an answer may cover, counting lines once', () => {
        const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`)
        const onChange = vi.fn()
        render(<LineMarker lines={lines} marks={[{ lineStart: 1, lineEnd: 5 }]} onMarksChange={onChange} limits={{ maxMarks: 5, maxLines: 6 }} />)
        fireEvent.click(document.getElementById('cr-line-10') as HTMLElement)
        fireEvent.click(document.getElementById('cr-line-12') as HTMLElement, { shiftKey: true })
        expect(screen.getByTestId('mark-selection')).toBeDisabled()
        expect(screen.getByTestId('limit-note')).toHaveTextContent('at most 6 lines in all and 5 are used')
        // One more line fits
        fireEvent.click(document.getElementById('cr-line-10') as HTMLElement)
        expect(screen.getByTestId('mark-selection')).not.toBeDisabled()
        fireEvent.click(screen.getByTestId('mark-selection'))
        expect(onChange).toHaveBeenCalledWith([{ lineStart: 1, lineEnd: 5 }, { lineStart: 10, lineEnd: 10 }])
    })

    it('says why when the keyboard cannot add a mark at the limit', () => {
        const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`)
        const onChange = vi.fn()
        render(<LineMarker lines={lines} marks={[{ lineStart: 1, lineEnd: 1 }]} onMarksChange={onChange} limits={{ maxMarks: 1, maxLines: 6 }} />)
        const listbox = screen.getByRole('listbox')
        fireEvent.keyDown(listbox, { key: 'End' })
        fireEvent.keyDown(listbox, { key: ' ' })
        expect(onChange).not.toHaveBeenCalled()
        expect(screen.getByTestId('marker-note')).toHaveTextContent('at most 1 marks')
    })

    it('names a finding type of the 15, not a category, in the type chooser', () => {
        render(<Harness />)
        const select = screen.getByLabelText('Type for new marks (optional)')
        const values = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
        expect(values).toContain('sqli')
        expect(values).toContain('race-condition')
        expect(values).not.toContain('server-side')
        expect(values).toHaveLength(16)
    })

    it('gives every line a spoken number and makes the selection status polite', () => {
        render(<Harness />)
        expect(document.getElementById('cr-line-3')).toHaveTextContent('Line 3:')
        expect(screen.getByTestId('selection-status')).toHaveAttribute('aria-live', 'polite')
    })
})

describe('picking lines with the keyboard', () => {
    it('is one tab stop: a listbox with arrow keys, no mouse needed', () => {
        render(<Harness />)
        expect(list()).toHaveAttribute('tabindex', '0')
        expect(list()).toHaveAttribute('aria-multiselectable', 'true')
        list().focus()
        fireEvent.keyDown(list(), { key: 'ArrowDown' })
        expect(status()).toHaveTextContent('Selected: line 1')
        fireEvent.keyDown(list(), { key: 'ArrowDown' })
        fireEvent.keyDown(list(), { key: 'ArrowDown' })
        expect(status()).toHaveTextContent('Selected: line 3')
        expect(list()).toHaveAttribute('aria-activedescendant', 'cr-line-3')
    })

    it('Shift and the arrows grow the range, Space marks it, Space again takes it off', () => {
        const onChange = vi.fn()
        render(<Harness onChange={onChange} />)
        list().focus()
        fireEvent.keyDown(list(), { key: 'ArrowDown' })
        fireEvent.keyDown(list(), { key: 'ArrowDown' })
        fireEvent.keyDown(list(), { key: 'ArrowDown', shiftKey: true })
        fireEvent.keyDown(list(), { key: 'ArrowDown', shiftKey: true })
        expect(status()).toHaveTextContent('lines 2 to 4')
        fireEvent.keyDown(list(), { key: ' ' })
        expect(onChange).toHaveBeenLastCalledWith([{ lineStart: 2, lineEnd: 4 }])
        fireEvent.keyDown(list(), { key: ' ' })
        expect(onChange).toHaveBeenLastCalledWith([])
        expect(screen.getByTestId('marker-note')).toHaveTextContent('Removed the mark on lines 2 to 4.')
        fireEvent.keyDown(list(), { key: 'Enter' })
        expect(onChange).toHaveBeenLastCalledWith([{ lineStart: 2, lineEnd: 4 }])
    })

    it('Space on a line inside a mark takes that whole mark off', () => {
        const onChange = vi.fn()
        render(<Harness initial={[{ lineStart: 2, lineEnd: 5 }]} onChange={onChange} />)
        list().focus()
        fireEvent.click(line(3))
        fireEvent.keyDown(list(), { key: ' ' })
        expect(onChange).toHaveBeenLastCalledWith([])
    })

    it('Home, End and Page keys jump; Escape clears the selection', () => {
        render(<Harness />)
        list().focus()
        fireEvent.keyDown(list(), { key: 'End' })
        expect(status()).toHaveTextContent('line 7')
        fireEvent.keyDown(list(), { key: 'Home' })
        expect(status()).toHaveTextContent('line 1')
        fireEvent.keyDown(list(), { key: 'PageDown' })
        expect(status()).toHaveTextContent('line 7')
        fireEvent.keyDown(list(), { key: 'Escape' })
        expect(status()).toHaveTextContent('No lines selected.')
    })

    it('Space with nothing selected starts on line 1 and does not mark anything', () => {
        const onChange = vi.fn()
        render(<Harness onChange={onChange} />)
        list().focus()
        fireEvent.keyDown(list(), { key: ' ' })
        expect(status()).toHaveTextContent('line 1')
        expect(onChange).not.toHaveBeenCalled()
    })

    it('leaves browser shortcuts alone', () => {
        render(<Harness />)
        list().focus()
        fireEvent.keyDown(list(), { key: 'ArrowDown', ctrlKey: true })
        fireEvent.keyDown(list(), { key: 'a', metaKey: true })
        expect(status()).toHaveTextContent('No lines selected.')
    })
})

describe('picking lines by number', () => {
    it('selects the typed range', () => {
        render(<Harness />)
        fireEvent.change(screen.getByLabelText('From line'), { target: { value: '2' } })
        fireEvent.change(screen.getByLabelText('To line'), { target: { value: '5' } })
        fireEvent.click(screen.getByRole('button', { name: /Select these lines/ }))
        expect(status()).toHaveTextContent('lines 2 to 5')
    })

    it('says what is wrong with a number outside the code', () => {
        render(<Harness />)
        fireEvent.change(screen.getByLabelText('From line'), { target: { value: '2' } })
        fireEvent.change(screen.getByLabelText('To line'), { target: { value: '99' } })
        fireEvent.click(screen.getByRole('button', { name: /Select these lines/ }))
        expect(screen.getByRole('alert')).toHaveTextContent('whole line numbers from 1 to 7')
        expect(within(screen.getByRole('group', { name: 'Pick lines by number' })).getByLabelText('To line')).toHaveAttribute('aria-invalid', 'true')
    })

    it('Clear selection empties the selection and keeps the marks', () => {
        const onChange = vi.fn()
        render(<Harness initial={[{ lineStart: 1, lineEnd: 1 }]} onChange={onChange} />)
        fireEvent.click(line(3))
        fireEvent.click(screen.getByRole('button', { name: /Clear selection/ }))
        expect(status()).toHaveTextContent('No lines selected.')
        expect(onChange).not.toHaveBeenCalled()
        expect(line(1)).toHaveAttribute('data-tone', 'mark')
    })
})
