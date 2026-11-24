'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { btnSecondary, card, focusRing, input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';
import {
    FORM_LIMITS, newFile, newFlag, newHint, type FileRow, type FlagRow, type HintRow,
} from '@/lib/labs/form';

type Errors = Record<string, string>;

function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
    const to = index + delta;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
}

const iconBtn = `inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800 ${focusRing}`;

function RowActions({ index, count, label, onMove, onRemove }: { index: number; count: number; label: string; onMove?: (d: -1 | 1) => void; onRemove: () => void }) {
    return (
        <div className="flex shrink-0 gap-1">
            {onMove && <button type="button" className={iconBtn} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>}
            {onMove && <button type="button" className={iconBtn} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>}
            <button type="button" className={`${iconBtn} text-red-800 dark:text-red-300`} onClick={onRemove} aria-label={`Remove ${label}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
        </div>
    );
}

export function HintsEditor({ rows, onChange, errors }: { rows: HintRow[]; onChange: (rows: HintRow[]) => void; errors: Errors }) {
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
                            <RowActions index={i} count={rows.length} label={`hint ${i + 1}`} onMove={(d) => onChange(move(rows, i, d))} onRemove={() => onChange(rows.filter((_, j) => j !== i))} />
                        </div>
                        <Field id={`hint-${row.key}-text`} label={`Hint ${i + 1} text`} required error={errors[`hints.${i}.text`]} hint={`${row.text.trim().length}/${FORM_LIMITS.hintText}. Markdown or text; shown sanitised.`}>
                            {(p) => <textarea {...p} rows={3} value={row.text} onChange={(e) => set(i, { text: e.target.value })} className={`${input} ${errors[`hints.${i}.text`] ? inputError : ''}`} />}
                        </Field>
                        <Field id={`hint-${row.key}-penalty`} label={`Hint ${i + 1} cost in points`} error={errors[`hints.${i}.penalty`]} hint="Taken off the award when a member opens it. 0 makes it free." className="sm:max-w-xs">
                            {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={FORM_LIMITS.hintPenalty} value={row.penalty} onChange={(e) => set(i, { penalty: e.target.value })} className={`${input} ${errors[`hints.${i}.penalty`] ? inputError : ''}`} />}
                        </Field>
                    </li>
                ))}
            </ol>
            <button type="button" className={`${btnSecondary} mt-4`} disabled={rows.length >= FORM_LIMITS.hints} onClick={() => onChange([...rows, newHint()])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add a hint
            </button>
            {rows.length >= FORM_LIMITS.hints && <p className={`mt-2 text-xs ${muted}`}>At most {FORM_LIMITS.hints} hints.</p>}
        </div>
    );
}

export function FilesEditor({ rows, onChange, errors }: { rows: FileRow[]; onChange: (rows: FileRow[]) => void; errors: Errors }) {
    const set = (i: number, patch: Partial<FileRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    return (
        <div>
            {errors.files && <p role="alert" className="mb-3 text-sm text-red-800 dark:text-red-300">{errors.files}</p>}
            {rows.length === 0 && <p className={`mb-3 text-sm ${muted}`}>No files. Add a download if the exercise needs one.</p>}
            <ul className="space-y-4">
                {rows.map((row, i) => (
                    <li key={row.key} className={`${card} space-y-3 p-4`} data-testid="file-row">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">File {i + 1}</h3>
                            <RowActions index={i} count={rows.length} label={`file ${i + 1}`} onMove={(d) => onChange(move(rows, i, d))} onRemove={() => onChange(rows.filter((_, j) => j !== i))} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field id={`file-${row.key}-name`} label={`File ${i + 1} name`} required error={errors[`files.${i}.name`]}>
                                {(p) => <input {...p} type="text" value={row.name} onChange={(e) => set(i, { name: e.target.value })} className={`${input} ${errors[`files.${i}.name`] ? inputError : ''}`} />}
                            </Field>
                            <Field id={`file-${row.key}-url`} label={`File ${i + 1} link`} required error={errors[`files.${i}.url`]} hint="A public http or https link. The server never fetches it.">
                                {(p) => <input {...p} type="url" inputMode="url" value={row.url} onChange={(e) => set(i, { url: e.target.value })} className={`${input} ${errors[`files.${i}.url`] ? inputError : ''}`} />}
                            </Field>
                            <Field id={`file-${row.key}-size`} label={`File ${i + 1} size in bytes`} error={errors[`files.${i}.sizeBytes`]} hint="Optional.">
                                {(p) => <input {...p} type="number" inputMode="numeric" min={0} value={row.sizeBytes} onChange={(e) => set(i, { sizeBytes: e.target.value })} className={`${input} ${errors[`files.${i}.sizeBytes`] ? inputError : ''}`} />}
                            </Field>
                            <Field id={`file-${row.key}-sha`} label={`File ${i + 1} SHA-256`} error={errors[`files.${i}.sha256`]} hint="Optional, 64 hexadecimal characters. Members can check their download against it.">
                                {(p) => <input {...p} type="text" spellCheck={false} autoComplete="off" value={row.sha256} onChange={(e) => set(i, { sha256: e.target.value })} className={`${input} font-mono text-xs ${errors[`files.${i}.sha256`] ? inputError : ''}`} />}
                            </Field>
                        </div>
                    </li>
                ))}
            </ul>
            <button type="button" className={`${btnSecondary} mt-4`} disabled={rows.length >= FORM_LIMITS.files} onClick={() => onChange([...rows, newFile()])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add a file
            </button>
            {rows.length >= FORM_LIMITS.files && <p className={`mt-2 text-xs ${muted}`}>At most {FORM_LIMITS.files} files.</p>}
        </div>
    );
}

/**
 * Flags are write only. The API stores a hash and never returns the flag, so an edit starts with
 * no rows and the form says so. Typing new ones replaces every flag the lab has.
 */
export function FlagsEditor({ rows, onChange, errors, flagCount }: { rows: FlagRow[]; onChange: (rows: FlagRow[]) => void; errors: Errors; flagCount: number | null }) {
    const set = (i: number, patch: Partial<FlagRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const editing = flagCount !== null;
    return (
        <div>
            <p className={`mb-3 text-sm ${muted}`} data-testid="flags-note">
                {editing
                    ? <>
                        {flagCount === 0 ? 'This lab has no flag yet.' : `This lab has ${flagCount} ${flagCount === 1 ? 'flag' : 'flags'} set.`}{' '}
                        Flags are hidden: the server keeps only a hash and never shows them again. Enter new ones to replace all of them; leave this empty to keep the current ones.
                    </>
                    : 'Flags are plain text here and hidden once saved: the server keeps only a hash and never shows them again. A lab needs at least one flag before it can be published.'}
            </p>
            {errors.flags && <p role="alert" className="mb-3 text-sm text-red-800 dark:text-red-300">{errors.flags}</p>}
            <ul className="space-y-3">
                {rows.map((row, i) => (
                    <li key={row.key} className={`${card} flex flex-wrap items-end gap-3 p-4`} data-testid="flag-row">
                        <Field id={`flag-${row.key}`} label={`Flag ${i + 1}`} required error={errors[`flags.${i}`]} className="min-w-[min(100%,16rem)] flex-1">
                            {(p) => (
                                <input
                                    {...p}
                                    type="text"
                                    value={row.value}
                                    maxLength={FORM_LIMITS.flagLength + 20}
                                    autoComplete="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    data-sentry-mask
                                    data-private="true"
                                    placeholder="flag{...}"
                                    onChange={(e) => set(i, { value: e.target.value })}
                                    className={`${input} font-mono ${errors[`flags.${i}`] ? inputError : ''}`}
                                />
                            )}
                        </Field>
                        <label className="inline-flex items-center gap-2 pb-2.5 text-sm text-gray-800 dark:text-gray-200">
                            <input type="checkbox" checked={row.caseSensitive} onChange={(e) => set(i, { caseSensitive: e.target.checked })} className="h-4 w-4 rounded border-gray-400 text-orange-700 focus:ring-orange-500" />
                            Case sensitive<span className="sr-only"> (flag {i + 1})</span>
                        </label>
                        <div className="pb-0.5"><RowActions index={i} count={rows.length} label={`flag ${i + 1}`} onRemove={() => onChange(rows.filter((_, j) => j !== i))} /></div>
                    </li>
                ))}
            </ul>
            <button type="button" className={`${btnSecondary} mt-4`} disabled={rows.length >= FORM_LIMITS.flags} onClick={() => onChange([...rows, newFlag()])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> {editing ? 'Enter new flags' : 'Add a flag'}
            </button>
            <p className={`mt-2 text-xs ${muted}`}>Up to {FORM_LIMITS.flags} flags, each up to {FORM_LIMITS.flagLength} characters. Matching ignores case and extra spaces unless a flag is case sensitive.</p>
        </div>
    );
}
