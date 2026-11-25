import type { CrMark } from '@/types/codeReview';
import type { MarkLimits } from './constants';

/**
 * The line marking logic, free of React so it can be tested on its own. Lines are 1 based, exactly
 * as the API counts them (the stored code is split on "\n"). A selection is the range the member is
 * building; a mark is a range they have put on their list.
 */

export interface Selection { anchor: number; focus: number }
export interface LineRange { start: number; end: number }
export type MarkDraft = CrMark;

/** How many lines PageUp and PageDown move */
export const PAGE_STEP = 10;

/** The lines of the code as the API counts them. Line endings are made LF first. */
export function splitCode(code: string): string[] {
    return code.replace(/\r\n?/g, '\n').split('\n');
}

export const clampLine = (line: number, lineCount: number): number => Math.min(Math.max(1, Math.trunc(line) || 1), Math.max(1, lineCount));

/** The first and last line of a selection, whichever way it was drawn */
export function rangeOf(sel: Selection): LineRange {
    return { start: Math.min(sel.anchor, sel.focus), end: Math.max(sel.anchor, sel.focus) };
}

export const lineSpan = (r: LineRange): number => r.end - r.start + 1;

/** "line 5" or "lines 5 to 9" */
export function describeRange(r: LineRange): string {
    return r.start === r.end ? `line ${r.start}` : `lines ${r.start} to ${r.end}`;
}

export const selectLine = (line: number, lineCount: number): Selection => {
    const n = clampLine(line, lineCount);
    return { anchor: n, focus: n };
};

/** Shift-click (or the range mode): keep the anchor, move the end. With no selection yet it selects the one line. */
export function extendSelection(sel: Selection | null, line: number, lineCount: number): Selection {
    const n = clampLine(line, lineCount);
    return sel ? { anchor: sel.anchor, focus: n } : { anchor: n, focus: n };
}

/** A range typed as two numbers. Anything that is not a whole line number inside the code gives null. */
export function selectionFromNumbers(from: string | number, to: string | number, lineCount: number): Selection | null {
    const a = typeof from === 'number' ? from : Number(String(from).trim());
    const b = typeof to === 'number' ? to : Number(String(to).trim());
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    if (a < 1 || b < 1 || a > lineCount || b > lineCount) return null;
    return { anchor: Math.min(a, b), focus: Math.max(a, b) };
}

/**
 * The selection after a navigation key, or null when the key is not one. Arrow keys move the
 * cursor by a line, PageUp and PageDown by ten, Home and End to the first and last line. Shift
 * keeps the anchor (it grows or shrinks the range); without it the selection is the one line.
 */
export function moveSelection(sel: Selection | null, key: string, shift: boolean, lineCount: number): Selection | null {
    let target: number;
    const here = sel ? sel.focus : null;
    switch (key) {
        case 'ArrowDown': target = here === null ? 1 : here + 1; break;
        case 'ArrowUp': target = here === null ? 1 : here - 1; break;
        case 'PageDown': target = here === null ? 1 : here + PAGE_STEP; break;
        case 'PageUp': target = here === null ? 1 : here - PAGE_STEP; break;
        case 'Home': target = 1; break;
        case 'End': target = lineCount; break;
        default: return null;
    }
    const n = clampLine(target, lineCount);
    return shift && sel ? { anchor: sel.anchor, focus: n } : { anchor: n, focus: n };
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

const sortMarks = (marks: MarkDraft[]): MarkDraft[] => [...marks].sort((a, b) => a.lineStart - b.lineStart || a.lineEnd - b.lineEnd);
const overlap = (a: MarkDraft, r: LineRange) => a.lineStart <= r.end && a.lineEnd >= r.start;
const contains = (a: MarkDraft, r: LineRange) => a.lineStart <= r.start && a.lineEnd >= r.end;

export const isMarked = (marks: MarkDraft[], line: number): boolean => marks.some((m) => m.lineStart <= line && m.lineEnd >= line);

/** How many lines the marks cover; the list never holds overlapping marks, so each line is counted once */
export function markedLines(marks: MarkDraft[]): number {
    const lines = new Set<number>();
    for (const m of marks) for (let n = m.lineStart; n <= m.lineEnd; n += 1) lines.add(n);
    return lines.size;
}

/** `limit` is the number of marks, `lines` the number of marked lines */
export type AddStatus = 'added' | 'merged' | 'exists' | 'limit' | 'lines';

/**
 * Put a range on the list. A range that is already inside a mark changes nothing (`exists`). A
 * range that touches other marks is merged with them into one mark that covers all of it
 * (`merged`), so the list never holds two marks over the same lines; marks that only sit next to
 * each other stay separate, because they can be two findings. `type` is kept from the mark it
 * replaces unless a new one is given. At the limits nothing is added: `limit` for the number of
 * marks, `lines` for the number of marked lines. `limits` is the marks and lines an attempt may
 * hold, or just the number of marks.
 */
export function addMark(marks: MarkDraft[], r: LineRange, type: string | undefined, limits: MarkLimits | number): { marks: MarkDraft[]; status: AddStatus } {
    const max = typeof limits === 'number' ? limits : limits.maxMarks;
    const maxLines = typeof limits === 'number' ? Infinity : limits.maxLines;
    if (marks.some((m) => contains(m, r))) return { marks, status: 'exists' };
    const touched = marks.filter((m) => overlap(m, r));
    const rest = marks.filter((m) => !overlap(m, r));
    const start = Math.min(r.start, ...touched.map((m) => m.lineStart));
    const end = Math.max(r.end, ...touched.map((m) => m.lineEnd));
    const kept = type || touched.find((m) => m.vulnerabilityType)?.vulnerabilityType;
    const merged: MarkDraft = { lineStart: start, lineEnd: end, ...(kept ? { vulnerabilityType: kept } : {}) };
    const next = sortMarks([...rest, merged]);
    if (next.length > max) return { marks, status: 'limit' };
    if (markedLines(next) > maxLines) return { marks, status: 'lines' };
    return { marks: next, status: touched.length > 0 ? 'merged' : 'added' };
}

export function removeMarkAt(marks: MarkDraft[], index: number): MarkDraft[] {
    return marks.filter((_, i) => i !== index);
}

export type ToggleStatus = AddStatus | 'removed';

/**
 * Space or Enter on a selection: a selection inside an existing mark takes that mark off the list
 * (the whole mark), anything else is added like `addMark`.
 */
export function toggleMark(marks: MarkDraft[], r: LineRange, type: string | undefined, limits: MarkLimits | number): { marks: MarkDraft[]; status: ToggleStatus; removed?: MarkDraft } {
    const index = marks.findIndex((m) => contains(m, r));
    if (index >= 0) return { marks: removeMarkAt(marks, index), status: 'removed', removed: marks[index] };
    return addMark(marks, r, type, limits);
}

export function setMarkType(marks: MarkDraft[], index: number, type: string | undefined): MarkDraft[] {
    return marks.map((m, i) => {
        if (i !== index) return m;
        const { vulnerabilityType: _drop, ...rest } = m;
        void _drop;
        return type ? { ...rest, vulnerabilityType: type } : rest;
    });
}

/** What goes to the API: ranges and an optional type, nothing else */
export function toPayload(marks: MarkDraft[]): CrMark[] {
    return marks.map((m) => ({ lineStart: m.lineStart, lineEnd: m.lineEnd, ...(m.vulnerabilityType ? { vulnerabilityType: m.vulnerabilityType } : {}) }));
}

/** Whether a mark lies inside the code (the API refuses a mark past the last line) */
export const marksFit = (marks: MarkDraft[], lineCount: number): boolean => marks.every((m) => m.lineStart >= 1 && m.lineEnd <= lineCount && m.lineEnd >= m.lineStart);
