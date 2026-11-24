import { describe, expect, it } from 'vitest'
import {
    addMark, clampLine, describeRange, extendSelection, isMarked, marksFit, moveSelection, rangeOf, removeMarkAt, selectLine, selectionFromNumbers,
    setMarkType, splitCode, toPayload, toggleMark,
} from '../selection'

const M = (a: number, b: number, t?: string) => ({ lineStart: a, lineEnd: b, ...(t ? { vulnerabilityType: t } : {}) })

describe('lines of the code', () => {
    it('splits the way the API counts: on LF, CRLF made LF first', () => {
        expect(splitCode('a\nb\nc')).toEqual(['a', 'b', 'c'])
        expect(splitCode('a\r\nb\rc')).toEqual(['a', 'b', 'c'])
        expect(splitCode('a\n\nb')).toEqual(['a', '', 'b'])
    })

    it('clamps a line into the code', () => {
        expect(clampLine(0, 10)).toBe(1)
        expect(clampLine(99, 10)).toBe(10)
        expect(clampLine(4.9, 10)).toBe(4)
        expect(clampLine(NaN, 10)).toBe(1)
    })
})

describe('building a range', () => {
    it('a selection is the same range whichever way it was drawn', () => {
        expect(rangeOf({ anchor: 9, focus: 5 })).toEqual({ start: 5, end: 9 })
        expect(rangeOf({ anchor: 5, focus: 9 })).toEqual({ start: 5, end: 9 })
        expect(describeRange({ start: 5, end: 5 })).toBe('line 5')
        expect(describeRange({ start: 5, end: 9 })).toBe('lines 5 to 9')
    })

    it('a click selects one line, shift-click grows it from the anchor', () => {
        const one = selectLine(4, 20)
        expect(one).toEqual({ anchor: 4, focus: 4 })
        expect(extendSelection(one, 8, 20)).toEqual({ anchor: 4, focus: 8 })
        // shrinking back and going above the anchor
        expect(extendSelection({ anchor: 4, focus: 8 }, 2, 20)).toEqual({ anchor: 4, focus: 2 })
        expect(rangeOf(extendSelection({ anchor: 4, focus: 8 }, 2, 20))).toEqual({ start: 2, end: 4 })
        // with no selection yet it is just the one line, and it stays inside the code
        expect(extendSelection(null, 99, 20)).toEqual({ anchor: 20, focus: 20 })
    })

    it('two typed numbers make a range, only when they are whole lines of the code', () => {
        expect(selectionFromNumbers('3', '7', 10)).toEqual({ anchor: 3, focus: 7 })
        expect(selectionFromNumbers(7, 3, 10)).toEqual({ anchor: 3, focus: 7 })
        expect(selectionFromNumbers('0', '3', 10)).toBeNull()
        expect(selectionFromNumbers('3', '11', 10)).toBeNull()
        expect(selectionFromNumbers('a', '3', 10)).toBeNull()
        expect(selectionFromNumbers('2.5', '3', 10)).toBeNull()
        expect(selectionFromNumbers('', '3', 10)).toBeNull()
    })
})

describe('keyboard movement', () => {
    it('arrow keys move one line and stop at the ends', () => {
        expect(moveSelection({ anchor: 5, focus: 5 }, 'ArrowDown', false, 10)).toEqual({ anchor: 6, focus: 6 })
        expect(moveSelection({ anchor: 5, focus: 5 }, 'ArrowUp', false, 10)).toEqual({ anchor: 4, focus: 4 })
        expect(moveSelection({ anchor: 10, focus: 10 }, 'ArrowDown', false, 10)).toEqual({ anchor: 10, focus: 10 })
        expect(moveSelection({ anchor: 1, focus: 1 }, 'ArrowUp', false, 10)).toEqual({ anchor: 1, focus: 1 })
    })

    it('the first arrow key with nothing selected lands on line 1', () => {
        expect(moveSelection(null, 'ArrowDown', false, 10)).toEqual({ anchor: 1, focus: 1 })
        expect(moveSelection(null, 'ArrowUp', false, 10)).toEqual({ anchor: 1, focus: 1 })
    })

    it('shift keeps the anchor and grows or shrinks the range', () => {
        let s = moveSelection({ anchor: 5, focus: 5 }, 'ArrowDown', true, 10)
        s = moveSelection(s, 'ArrowDown', true, 10)
        expect(s).toEqual({ anchor: 5, focus: 7 })
        s = moveSelection(s, 'ArrowUp', true, 10)
        expect(s).toEqual({ anchor: 5, focus: 6 })
        // without shift the range collapses to the line
        expect(moveSelection(s, 'ArrowDown', false, 10)).toEqual({ anchor: 7, focus: 7 })
    })

    it('page keys move ten lines, Home and End go to the first and last line', () => {
        expect(moveSelection({ anchor: 5, focus: 5 }, 'PageDown', false, 30)).toEqual({ anchor: 15, focus: 15 })
        expect(moveSelection({ anchor: 5, focus: 5 }, 'PageUp', false, 30)).toEqual({ anchor: 1, focus: 1 })
        expect(moveSelection({ anchor: 5, focus: 5 }, 'End', false, 30)).toEqual({ anchor: 30, focus: 30 })
        expect(moveSelection({ anchor: 5, focus: 5 }, 'Home', true, 30)).toEqual({ anchor: 5, focus: 1 })
    })

    it('a key that is not navigation is not handled', () => {
        expect(moveSelection({ anchor: 5, focus: 5 }, 'a', false, 10)).toBeNull()
        expect(moveSelection({ anchor: 5, focus: 5 }, 'Enter', false, 10)).toBeNull()
    })
})

describe('the list of marks', () => {
    it('adds a mark and keeps the list sorted', () => {
        let r = addMark([], { start: 10, end: 12 }, undefined, 50)
        expect(r.status).toBe('added')
        r = addMark(r.marks, { start: 2, end: 3 }, 'xss', 50)
        expect(r.marks).toEqual([M(2, 3, 'xss'), M(10, 12)])
    })

    it('a range inside an existing mark changes nothing', () => {
        const marks = [M(4, 8)]
        const r = addMark(marks, { start: 5, end: 6 }, undefined, 50)
        expect(r.status).toBe('exists')
        expect(r.marks).toBe(marks)
        expect(addMark(marks, { start: 4, end: 8 }, undefined, 50).status).toBe('exists')
    })

    it('a range that overlaps marks is merged with them into one', () => {
        const r = addMark([M(4, 6, 'sqli'), M(20, 22)], { start: 6, end: 9 }, undefined, 50)
        expect(r.status).toBe('merged')
        expect(r.marks).toEqual([M(4, 9, 'sqli'), M(20, 22)])
        // one range can join several
        const both = addMark([M(2, 3), M(5, 6)], { start: 3, end: 5 }, undefined, 50)
        expect(both.marks).toEqual([M(2, 6)])
        // a type given now wins over the old one
        expect(addMark([M(4, 6, 'sqli')], { start: 5, end: 8 }, 'xss', 50).marks).toEqual([M(4, 8, 'xss')])
    })

    it('marks that only sit next to each other stay apart: they can be two findings', () => {
        const r = addMark([M(4, 5)], { start: 6, end: 7 }, undefined, 50)
        expect(r.status).toBe('added')
        expect(r.marks).toEqual([M(4, 5), M(6, 7)])
    })

    it('refuses to go past the limit, but a merge that does not add a mark is fine', () => {
        const full = Array.from({ length: 50 }, (_, i) => M(i * 3 + 1, i * 3 + 1))
        expect(addMark(full, { start: 500, end: 500 }, undefined, 50).status).toBe('limit')
        expect(addMark(full, { start: 1, end: 4 }, undefined, 50).status).toBe('merged')
    })

    it('toggle takes off the mark that holds the selection, and adds otherwise', () => {
        const marks = [M(4, 8)]
        const off = toggleMark(marks, { start: 5, end: 5 }, undefined, 50)
        expect(off.status).toBe('removed')
        expect(off.marks).toEqual([])
        expect(off.removed).toEqual(M(4, 8))
        const on = toggleMark([], { start: 5, end: 5 }, 'sqli', 50)
        expect(on.status).toBe('added')
        expect(on.marks).toEqual([M(5, 5, 'sqli')])
        // twice is back to nothing
        expect(toggleMark(on.marks, { start: 5, end: 5 }, 'sqli', 50).marks).toEqual([])
    })

    it('removes a mark by position and sets or clears a type', () => {
        expect(removeMarkAt([M(1, 1), M(3, 3)], 0)).toEqual([M(3, 3)])
        expect(setMarkType([M(1, 1), M(3, 3)], 1, 'xss')).toEqual([M(1, 1), M(3, 3, 'xss')])
        expect(setMarkType([M(3, 3, 'xss')], 0, undefined)).toEqual([M(3, 3)])
    })

    it('knows which lines are marked', () => {
        expect(isMarked([M(4, 6)], 5)).toBe(true)
        expect(isMarked([M(4, 6)], 7)).toBe(false)
    })

    it('sends ranges and an optional type, nothing else', () => {
        const dirty = [{ lineStart: 1, lineEnd: 2, vulnerabilityType: 'xss', id: 'x', secret: 1 }, { lineStart: 5, lineEnd: 5, vulnerabilityType: '' }]
        expect(toPayload(dirty as never)).toEqual([{ lineStart: 1, lineEnd: 2, vulnerabilityType: 'xss' }, { lineStart: 5, lineEnd: 5 }])
    })

    it('checks that every mark lies inside the code', () => {
        expect(marksFit([M(1, 7)], 7)).toBe(true)
        expect(marksFit([M(1, 8)], 7)).toBe(false)
        expect(marksFit([M(0, 2)], 7)).toBe(false)
    })
})
