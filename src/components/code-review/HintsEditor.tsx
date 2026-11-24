'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { btnSecondary, card, focusRing, input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';
import { CR_LIMITS } from '@/lib/codeReview/constants';
import { newHint, type HintRow } from '@/lib/codeReview/form';

type Errors = Record<string, string>;

function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
    const to = index + delta;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
}

const iconBtn = `inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800 ${focusRing}`;

/** Hints are numbered by their position: members open them in that order */
export function HintsEditor({ rows, onChange, errors, disabled = false }: { rows: HintRow[]; onChange: (rows: HintRow[]) => void; errors: Errors; disabled?: boolean }) {
    const set = (i: number, patch: Partial<HintRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    return (
        <div>
            {errors.hints && <p role="alert" className="mb-3 text-sm text-red-800 dark:text-red-300">{errors.hints}</p>}
            {rows.length === 0 && <p className={`mb-3 text-sm ${muted}`}>No hints. Members will have to work it out on their own.</p>}
            <ol className="space-y-4">
                {rows.map((row, i) => (
                    <li key={row.key} className={`${card} space-y-3 p-4`} data-testid="hint-row">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Hint {i + 1}</h3>
                            <div className="flex gap-1">
                                <button type="button" className={iconBtn} disabled={disabled || i === 0} onClick={() => onChange(move(rows, i, -1))} aria-label={`Move hint ${i + 1} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                                <button type="button" className={iconBtn} disabled={disabled || i === rows.length - 1} onClick={() => onChange(move(rows, i, 1))} aria-label={`Move hint ${i + 1} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                                <button type="button" className={`${iconBtn} text-red-800 dark:text-red-300`} disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove hint ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                            </div>
                        </div>
                        <Field id={`hint-${row.key}-text`} label={`Hint ${i + 1} text`} required error={errors[`hints.${i}.text`]} hint={`${row.text.trim().length}/${CR_LIMITS.hintText}. Markdown or text; shown sanitised.`}>
                            {(p) => <textarea {...p} rows={3} value={row.text} onChange={(e) => set(i, { text: e.target.value })} className={`${input} ${errors[`hints.${i}.text`] ? inputError : ''}`} />}
                        </Field>
                        <Field id={`hint-${row.key}-cost`} label={`Hint ${i + 1} cost in points`} required error={errors[`hints.${i}.cost`]} hint="Taken off the award when a member opens it. 0 makes it free." className="sm:max-w-xs">
                            {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={CR_LIMITS.hintCostMax} value={row.cost} onChange={(e) => set(i, { cost: e.target.value })} className={`${input} ${errors[`hints.${i}.cost`] ? inputError : ''}`} />}
                        </Field>
                    </li>
                ))}
            </ol>
            <button type="button" className={`${btnSecondary} mt-4`} disabled={disabled || rows.length >= CR_LIMITS.hints} onClick={() => onChange([...rows, newHint()])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add a hint
            </button>
            <span className={`ml-3 text-xs ${muted}`}>{rows.length} of {CR_LIMITS.hints}</span>
        </div>
    );
}
