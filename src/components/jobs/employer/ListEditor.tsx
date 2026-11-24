'use client';

import { Plus, X } from 'lucide-react';
import { focusRing, input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';

interface Props {
    id: string;
    label: string;
    /** What one row is called, for the buttons: "requirement" */
    noun: string;
    items: string[];
    onChange: (items: string[]) => void;
    maxItems: number;
    maxLength: number;
    placeholder?: string;
    hint?: string;
    error?: string;
    /** Ready made entries to add with one click */
    suggestions?: readonly string[];
}

/** A list of short texts: one box per row, add and remove buttons, ready made suggestions when given */
export function ListEditor({ id, label, noun, items, onChange, maxItems, maxLength, placeholder, hint, error, suggestions }: Props) {
    const rows = items.length ? items : [''];
    const set = (i: number, value: string) => onChange(rows.map((r, n) => (n === i ? value : r)));
    const remove = (i: number) => onChange(rows.filter((_, n) => n !== i));
    const filled = rows.filter((r) => r.trim()).length;
    const toggle = (text: string) => {
        const on = rows.some((r) => r.trim() === text);
        if (on) onChange(rows.filter((r) => r.trim() !== text));
        else onChange([...rows.filter((r) => r.trim()), text]);
    };

    return (
        <Field id={id} label={label} hint={hint} error={error}>
            {() => (
                <div className="space-y-2" role="group" aria-label={label}>
                    {suggestions && (
                        <div className="mb-3 flex flex-wrap gap-2" aria-label={`Common ${noun}s`}>
                            {suggestions.map((s) => {
                                const on = rows.some((r) => r.trim() === s);
                                return (
                                    <button key={s} type="button" aria-pressed={on} onClick={() => toggle(s)}
                                        className={`rounded-full border px-3 py-1 text-sm transition-colors ${focusRing} ${on ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>
                                        {s}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {rows.map((row, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                id={`${id}-${i}`} type="text" value={row} onChange={(e) => set(i, e.target.value)} maxLength={maxLength} placeholder={placeholder}
                                aria-label={`${label}, ${noun} ${i + 1}`} aria-invalid={error ? true : undefined}
                                className={`${input} ${error ? inputError : ''}`}
                            />
                            {rows.length > 1 || row ? (
                                <button type="button" onClick={() => remove(i)} aria-label={`Remove ${noun} ${i + 1}`} className={`shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-red-800 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-red-300 ${focusRing}`}>
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            ) : null}
                        </div>
                    ))}
                    <div className="flex items-center justify-between gap-3">
                        <button type="button" onClick={() => onChange([...rows, ''])} disabled={rows.length >= maxItems}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-orange-800 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-orange-300 ${focusRing}`}>
                            <Plus className="h-4 w-4" aria-hidden="true" /> Add {noun}
                        </button>
                        <span className={`text-xs ${muted}`} aria-hidden="true">{filled}/{maxItems}</span>
                    </div>
                </div>
            )}
        </Field>
    );
}
