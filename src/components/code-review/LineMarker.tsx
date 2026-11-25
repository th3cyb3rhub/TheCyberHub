'use client';

import { useMemo, useState } from 'react';
import { Eraser, MousePointerClick, Plus, Rows3 } from 'lucide-react';
import { btnPrimary, btnSecondary, input, muted } from '@/components/events/styles';
import { CR_FINDING_TYPES } from '@/types/codeReview';
import { CR_LIMITS, findingTypeLabel, type MarkLimits } from '@/lib/codeReview/constants';
import {
    addMark, describeRange, extendSelection, markedLines, moveSelection, rangeOf, selectLine, selectionFromNumbers, toggleMark, type AddStatus,
    type MarkDraft, type Selection,
} from '@/lib/codeReview/selection';
import { CodeLines, type Band } from './CodeLines';

/** Why a range cannot be added, in words, for the limits of this exercise */
function limitMessage(status: AddStatus, limits: MarkLimits, used: number): string {
    return status === 'lines'
        ? `Your marks can cover at most ${limits.maxLines} lines in all and ${used} are used. Remove a mark, or mark fewer lines.`
        : `An answer can hold at most ${limits.maxMarks} marks. Remove one first.`;
}

/**
 * The code with the tools to pick lines: click for a line, shift-click (or "Select a range" and a
 * second tap, for touch) for a range, or the keyboard on the code (arrow keys move, Shift grows
 * the range, Space or Enter marks or unmarks, Escape clears). "Mark selection" and the two line
 * boxes do the same without any pointer. Nothing here needs a drag.
 */
export function LineMarker({ lines, marks, onMarksChange, bands = [], idPrefix = 'cr', limits }: {
    lines: string[];
    marks: MarkDraft[];
    onMarksChange: (marks: MarkDraft[]) => void;
    /** What an attempt may hold; without it only the API's ceiling of marks applies */
    limits?: MarkLimits;
    /** Lines to paint as found (the last result) */
    bands?: Band[];
    idPrefix?: string;
}) {
    const lineCount = lines.length;
    const capacity = useMemo<MarkLimits>(() => limits ?? { maxMarks: CR_LIMITS.marks, maxLines: Math.max(1, lines.length) }, [limits, lines.length]);
    const [sel, setSel] = useState<Selection | null>(null);
    const [rangeMode, setRangeMode] = useState(false);
    const [focused, setFocused] = useState(false);
    const [type, setType] = useState('');
    const [note, setNote] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [numberError, setNumberError] = useState<string | null>(null);

    const allBands = useMemo<Band[]>(() => [...marks.map((m) => ({ start: m.lineStart, end: m.lineEnd, tone: 'mark' as const })), ...bands], [marks, bands]);
    const range = sel ? rangeOf(sel) : null;
    // Whether the selection could be added now: a range inside an existing mark can always be taken off again
    const preview = range ? addMark(marks, range, undefined, capacity) : null;
    const blocked = preview && (preview.status === 'limit' || preview.status === 'lines') ? preview.status : null;

    const choose = (next: Selection | null) => { setSel(next); if (next) { const r = rangeOf(next); setFrom(String(r.start)); setTo(String(r.end)); } setNumberError(null); };

    const onLineClick = (line: number, { shift }: { shift: boolean }) => {
        if ((shift || rangeMode) && sel) choose(extendSelection(sel, line, lineCount));
        else choose(selectLine(line, lineCount));
        if (rangeMode) setRangeMode(false);
    };

    const mark = () => {
        if (!range) return;
        const out = addMark(marks, range, type || undefined, capacity);
        if (out.status === 'limit' || out.status === 'lines') { setNote(limitMessage(out.status, capacity, markedLines(marks))); return; }
        if (out.status === 'exists') { setNote(`${cap(describeRange(range))} is already marked.`); return; }
        onMarksChange(out.marks);
        setNote(out.status === 'merged' ? `Marked ${describeRange(range)}. It touched another mark, so they were joined.` : `Marked ${describeRange(range)}.`);
    };

    const toggle = () => {
        if (!range) return;
        const out = toggleMark(marks, range, type || undefined, capacity);
        if (out.status === 'limit' || out.status === 'lines') { setNote(limitMessage(out.status, capacity, markedLines(marks))); return; }
        if (out.status === 'exists') { setNote(`${cap(describeRange(range))} is already marked.`); return; }
        onMarksChange(out.marks);
        if (out.status === 'removed' && out.removed) setNote(`Removed the mark on ${describeRange({ start: out.removed.lineStart, end: out.removed.lineEnd })}.`);
        else setNote(`Marked ${describeRange(range)}.`);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLOListElement>) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (!sel) { choose(selectLine(1, lineCount)); return; }
            toggle();
            return;
        }
        if (e.key === 'Escape') {
            if (sel) { e.preventDefault(); choose(null); setNote('Selection cleared.'); }
            return;
        }
        const next = moveSelection(sel, e.key, e.shiftKey, lineCount);
        if (next) { e.preventDefault(); choose(next); }
    };

    const pickNumbers = () => {
        const next = selectionFromNumbers(from, to, lineCount);
        if (!next) { setNumberError(`Enter whole line numbers from 1 to ${lineCount}.`); return; }
        choose(next);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Line selection tools">
                <button type="button" className={btnPrimary} onClick={mark} disabled={!range || !!blocked} data-testid="mark-selection">
                    <Plus className="h-4 w-4" aria-hidden="true" /> Mark selection
                </button>
                <button type="button" className={btnSecondary} aria-pressed={rangeMode} onClick={() => setRangeMode((v) => !v)} disabled={!sel} data-testid="range-mode">
                    <Rows3 className="h-4 w-4" aria-hidden="true" /> Select a range
                </button>
                <button type="button" className={btnSecondary} onClick={() => { choose(null); setNote(''); }} disabled={!sel}>
                    <Eraser className="h-4 w-4" aria-hidden="true" /> Clear selection
                </button>
                <div className="min-w-[10rem] flex-1 sm:max-w-[16rem]">
                    <label htmlFor={`${idPrefix}-type`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Type for new marks (optional)</label>
                    <select id={`${idPrefix}-type`} value={type} onChange={(e) => setType(e.target.value)} className={`${input} !py-2`}>
                        <option value="">No type</option>
                        {CR_FINDING_TYPES.map((c) => <option key={c} value={c}>{findingTypeLabel(c)}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Pick lines by number">
                <div>
                    <label htmlFor={`${idPrefix}-from`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">From line</label>
                    <input id={`${idPrefix}-from`} inputMode="numeric" autoComplete="off" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} !w-24 !py-2`} aria-invalid={numberError ? true : undefined} aria-describedby={numberError ? `${idPrefix}-number-error` : undefined} />
                </div>
                <div>
                    <label htmlFor={`${idPrefix}-to`} className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">To line</label>
                    <input id={`${idPrefix}-to`} inputMode="numeric" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} !w-24 !py-2`} aria-invalid={numberError ? true : undefined} aria-describedby={numberError ? `${idPrefix}-number-error` : undefined} />
                </div>
                <button type="button" className={btnSecondary} onClick={pickNumbers}><MousePointerClick className="h-4 w-4" aria-hidden="true" /> Select these lines</button>
            </div>
            {numberError && <p id={`${idPrefix}-number-error`} role="alert" className="text-sm text-red-800 dark:text-red-300">{numberError}</p>}

            <p id={`${idPrefix}-help`} className={`text-sm ${muted}`}>
                Click a line to select it, shift-click another to select a range. On a touch screen tap a line, press &ldquo;Select a range&rdquo; and tap the last line.
                With the keyboard: arrow keys move, Shift and an arrow grows the range, Space or Enter marks or unmarks it, Escape clears it.
            </p>

            <CodeLines
                lines={lines}
                label="Code to review. Select lines, then mark them."
                idPrefix={idPrefix}
                selection={sel}
                bands={allBands}
                interactive
                showCursor={focused}
                onLineClick={onLineClick}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                describedBy={`${idPrefix}-help`}
            />

            <p className="text-sm text-gray-800 dark:text-gray-200" aria-live="polite" data-testid="selection-status">
                {range ? <>Selected: <strong>{describeRange(range)}</strong>{range.end > range.start ? ` (${range.end - range.start + 1} lines)` : ''}</> : 'No lines selected.'}
            </p>
            {blocked && range && (
                <p className="text-sm text-amber-900 dark:text-amber-300" data-testid="limit-note">{limitMessage(blocked, capacity, markedLines(marks))}</p>
            )}
            <p role="status" aria-live="polite" className="min-h-5 text-sm text-gray-800 dark:text-gray-200" data-testid="marker-note">{note}</p>
        </div>
    );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
