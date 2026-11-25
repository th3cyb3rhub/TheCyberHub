'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import type { Selection } from '@/lib/codeReview/selection';

/**
 * The code to review, one line at a time, with line numbers. Every line is a React text child:
 * the code is TEXT, never HTML, so a payload in an exercise is shown and never runs. There is no
 * highlighter on purpose (a highlighter that builds HTML is the way code would end up executing).
 * Monospace, no wrapping, and a horizontal scroll for long lines.
 *
 * With `interactive` the lines can be picked by click, shift-click and the keyboard (the listbox
 * pattern: one tab stop, arrow keys move, the parent decides what Space and Enter do).
 */

export type Tone = 'mark' | 'match' | 'finding' | 'conflict';
export interface Band { start: number; end: number; tone: Tone }

const TONE_CLASS: Record<Tone, string> = {
    mark: 'bg-orange-100 dark:bg-orange-500/20 shadow-[inset_3px_0_0_0_#c2410c] dark:shadow-[inset_3px_0_0_0_#fb923c]',
    match: 'bg-green-100 dark:bg-green-500/20 shadow-[inset_3px_0_0_0_#15803d] dark:shadow-[inset_3px_0_0_0_#4ade80]',
    finding: 'bg-violet-100 dark:bg-violet-500/20 shadow-[inset_3px_0_0_0_#6d28d9] dark:shadow-[inset_3px_0_0_0_#a78bfa]',
    conflict: 'bg-red-100 dark:bg-red-500/25 shadow-[inset_3px_0_0_0_#b91c1c] dark:shadow-[inset_3px_0_0_0_#f87171]',
};
const TONE_WORD: Record<Tone, string> = { mark: 'marked', match: 'found', finding: 'finding', conflict: 'conflict' };
const PRIORITY: Tone[] = ['conflict', 'match', 'mark', 'finding'];

interface LineProps {
    id: string;
    n: number;
    text: string;
    width: number;
    tone: Tone | null;
    selected: boolean;
    cursor: boolean;
    interactive: boolean;
}

const Line = memo(function Line({ id, n, text, width, tone, selected, cursor, interactive }: LineProps) {
    const surface = tone ? TONE_CLASS[tone] : 'bg-gray-50 dark:bg-neutral-950';
    return (
        <li
            id={id}
            role={interactive ? 'option' : 'listitem'}
            aria-selected={interactive ? selected : undefined}
            data-line={n}
            data-tone={tone ?? undefined}
            className={`flex min-w-full w-max py-1 sm:py-0.5 ${surface} ${selected ? '!bg-sky-100 dark:!bg-sky-500/25' : ''} ${cursor ? 'outline outline-2 -outline-offset-2 outline-sky-600 dark:outline-sky-400' : ''} ${interactive ? 'cursor-pointer' : ''}`}
        >
            <span
                aria-hidden="true"
                className="sticky left-0 z-[1] shrink-0 select-none bg-inherit pr-3 text-right text-gray-600 dark:text-gray-400"
                style={{ width: `${width + 2}ch`, paddingLeft: '0.5rem' }}
            >{n}</span>
            <span className="sr-only">{`Line ${n}: `}</span>
            <span className="whitespace-pre pr-6 text-gray-900 dark:text-gray-100">{text === '' ? ' ' : text}</span>
            {tone && <span className="sr-only">{`(${TONE_WORD[tone]})`}</span>}
        </li>
    );
});

export function toneMap(lineCount: number, bands: Band[]): (Tone | null)[] {
    const out: (Tone | null)[] = Array.from({ length: lineCount }, () => null);
    for (const tone of [...PRIORITY].reverse()) {
        for (const b of bands) {
            if (b.tone !== tone) continue;
            for (let n = Math.max(1, b.start); n <= Math.min(lineCount, b.end); n += 1) out[n - 1] = tone;
        }
    }
    return out;
}

export function CodeLines({
    lines, label, idPrefix = 'cr', selection = null, bands = [], interactive = false, showCursor = false, maxHeight = '28rem',
    onLineClick, onKeyDown, onFocus, onBlur, describedBy,
}: {
    lines: string[];
    label: string;
    idPrefix?: string;
    selection?: Selection | null;
    bands?: Band[];
    interactive?: boolean;
    /** Draw the cursor line (the keyboard has the focus) */
    showCursor?: boolean;
    maxHeight?: string;
    onLineClick?: (line: number, event: { shift: boolean }) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLOListElement>) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    describedBy?: string;
}) {
    const tones = useMemo(() => toneMap(lines.length, bands), [lines.length, bands]);
    const width = String(lines.length).length;
    const lo = selection ? Math.min(selection.anchor, selection.focus) : 0;
    const hi = selection ? Math.max(selection.anchor, selection.focus) : -1;
    const cursorLine = selection ? selection.focus : null;
    const listRef = useRef<HTMLOListElement>(null);

    // Keep the cursor line in view when the keyboard moves it
    useEffect(() => {
        if (!showCursor || cursorLine === null) return;
        const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${cursorLine}"]`);
        el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [cursorLine, showCursor]);

    const click = (e: React.MouseEvent) => {
        if (!interactive || !onLineClick) return;
        const li = (e.target as HTMLElement).closest<HTMLElement>('[data-line]');
        if (!li) return;
        onLineClick(Number(li.dataset.line), { shift: e.shiftKey });
    };

    const listProps = interactive
        ? {
            role: 'listbox' as const,
            'aria-multiselectable': true,
            tabIndex: 0,
            'aria-activedescendant': showCursor && cursorLine ? `${idPrefix}-line-${cursorLine}` : undefined,
            onKeyDown,
            onFocus,
            onBlur,
        }
        : { role: 'list' as const };

    return (
        <div className="overflow-hidden rounded-xl border border-gray-300 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-950" data-testid="code-lines">
            <div className="overflow-auto overscroll-x-contain" style={{ maxHeight }}>
                <ol
                    ref={listRef}
                    aria-label={label}
                    aria-describedby={describedBy}
                    onClick={click}
                    className="w-max min-w-full select-text py-2 font-mono text-[13px] leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400"
                    {...listProps}
                >
                    {lines.map((text, i) => {
                        const n = i + 1;
                        return (
                            <Line
                                key={n}
                                id={`${idPrefix}-line-${n}`}
                                n={n}
                                text={text}
                                width={width}
                                tone={tones[i]}
                                selected={n >= lo && n <= hi}
                                cursor={showCursor && cursorLine === n}
                                interactive={interactive}
                            />
                        );
                    })}
                </ol>
            </div>
        </div>
    );
}

/** Code shown as text without picking (fixed code, exploit): the same renderer, not interactive */
export function CodeText({ code, label, idPrefix = 'code' }: { code: string; label: string; idPrefix?: string }) {
    const lines = useMemo(() => code.replace(/\r\n?/g, '\n').split('\n'), [code]);
    return <CodeLines lines={lines} label={label} idPrefix={idPrefix} maxHeight="22rem" />;
}
