'use client';

import { MousePointerClick, Plus, Trash2 } from 'lucide-react';
import { btnSecondary, card, focusRing, input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';
import { CR_LIMITS, SEVERITY_LABELS, categoryLabel } from '@/lib/codeReview/constants';
import { newFinding, type FindingRow } from '@/lib/codeReview/form';
import { CR_CATEGORIES, CR_SEVERITIES, type CrSeverity } from '@/types/codeReview';

type Errors = Record<string, string>;

const iconBtn = `inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800 ${focusRing}`;

/**
 * The findings (the answer key). The lines can be typed or picked on the preview of the code;
 * every range is checked against the code as it changes (inside the code, no shared lines).
 */
export function FindingsEditor({ rows, onChange, errors, pickingIndex, onPick, lineCount, disabled = false }: {
    rows: FindingRow[];
    onChange: (rows: FindingRow[]) => void;
    errors: Errors;
    pickingIndex: number | null;
    onPick: (index: number | null) => void;
    lineCount: number;
    disabled?: boolean;
}) {
    const set = (i: number, patch: Partial<FindingRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const err = (i: number, f: string) => errors[`findings.${i}.${f}`];
    return (
        <div>
            {errors.findings && <p role="alert" className="mb-3 text-sm text-red-800 dark:text-red-300" data-testid="findings-error">{errors.findings}</p>}
            {rows.length === 0 && <p className={`mb-3 text-sm ${muted}`}>No findings yet. An exercise needs at least one before it can be graded or published.</p>}
            <ol className="space-y-4">
                {rows.map((row, i) => {
                    const picking = pickingIndex === i;
                    const rangeError = err(i, 'lineStart') || err(i, 'lineEnd');
                    return (
                        <li key={row.key} className={`${card} space-y-3 p-4 ${picking ? 'ring-2 ring-violet-600 dark:ring-violet-400' : ''}`} data-testid="finding-row" data-invalid={rangeError ? 'true' : undefined}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                    Finding {i + 1}{row.title.trim() ? `: ${row.title.trim()}` : ''}
                                </h3>
                                <div className="flex gap-1">
                                    <button type="button" className={`${btnSecondary} !px-3 !py-1.5`} disabled={disabled} aria-pressed={picking} onClick={() => onPick(picking ? null : i)}>
                                        <MousePointerClick className="h-4 w-4" aria-hidden="true" /> {picking ? 'Stop picking' : 'Pick lines on the preview'}
                                    </button>
                                    <button type="button" className={`${iconBtn} text-red-800 dark:text-red-300`} disabled={disabled} onClick={() => { if (picking) onPick(null); onChange(rows.filter((_, j) => j !== i)); }} aria-label={`Remove finding ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                                </div>
                            </div>
                            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                                <Field id={`finding-${row.key}-start`} label={`Finding ${i + 1} first line`} required error={err(i, 'lineStart')} hint={lineCount > 0 ? `The code has ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}.` : 'Write the code first.'}>
                                    {(p) => <input {...p} inputMode="numeric" value={row.lineStart} onChange={(e) => set(i, { lineStart: e.target.value })} className={`${input} ${err(i, 'lineStart') ? inputError : ''}`} />}
                                </Field>
                                <Field id={`finding-${row.key}-end`} label={`Finding ${i + 1} last line`} required error={err(i, 'lineEnd')}>
                                    {(p) => <input {...p} inputMode="numeric" value={row.lineEnd} onChange={(e) => set(i, { lineEnd: e.target.value })} className={`${input} ${err(i, 'lineEnd') ? inputError : ''}`} />}
                                </Field>
                            </div>
                            <Field id={`finding-${row.key}-title`} label={`Finding ${i + 1} title`} error={err(i, 'title')} hint={`Optional, at most ${CR_LIMITS.findingTitle} characters. Members see it only after they find it.`}>
                                {(p) => <input {...p} maxLength={CR_LIMITS.findingTitle} value={row.title} onChange={(e) => set(i, { title: e.target.value })} className={`${input} ${err(i, 'title') ? inputError : ''}`} />}
                            </Field>
                            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                                <Field id={`finding-${row.key}-type`} label={`Finding ${i + 1} vulnerability type`} required error={err(i, 'vulnerabilityType')}>
                                    {(p) => (
                                        <select {...p} value={row.vulnerabilityType} onChange={(e) => set(i, { vulnerabilityType: e.target.value })} className={input}>
                                            {CR_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                                        </select>
                                    )}
                                </Field>
                                <Field id={`finding-${row.key}-severity`} label={`Finding ${i + 1} severity`} required error={err(i, 'severity')}>
                                    {(p) => (
                                        <select {...p} value={row.severity} onChange={(e) => set(i, { severity: e.target.value as CrSeverity })} className={input}>
                                            {CR_SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
                                        </select>
                                    )}
                                </Field>
                                <Field id={`finding-${row.key}-cwe`} label={`Finding ${i + 1} CWE`} error={err(i, 'cwe')} hint="For example CWE-89.">
                                    {(p) => <input {...p} value={row.cwe} onChange={(e) => set(i, { cwe: e.target.value })} className={`${input} ${err(i, 'cwe') ? inputError : ''}`} />}
                                </Field>
                                <Field id={`finding-${row.key}-owasp`} label={`Finding ${i + 1} OWASP category`} error={err(i, 'owasp')} hint="For example A03:2021 - Injection.">
                                    {(p) => <input {...p} maxLength={CR_LIMITS.owasp} value={row.owasp} onChange={(e) => set(i, { owasp: e.target.value })} className={`${input} ${err(i, 'owasp') ? inputError : ''}`} />}
                                </Field>
                            </div>
                            <Field id={`finding-${row.key}-explanation`} label={`Finding ${i + 1} explanation`} required error={err(i, 'explanation')} hint={`${row.explanation.trim().length}/${CR_LIMITS.findingExplanation}. At least ${CR_LIMITS.findingExplanationMin} characters. Markdown or text, shown sanitised, after a member finds it.`}>
                                {(p) => <textarea {...p} rows={3} value={row.explanation} onChange={(e) => set(i, { explanation: e.target.value })} className={`${input} ${err(i, 'explanation') ? inputError : ''}`} />}
                            </Field>
                            <details className="rounded-xl border border-gray-200 p-3 dark:border-neutral-800">
                                <summary className={`cursor-pointer rounded text-sm font-medium text-gray-900 dark:text-white ${focusRing}`}>Exploit and fix notes (optional, shown in the solution)</summary>
                                <div className="mt-3 space-y-3">
                                    {err(i, 'exploit') && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{err(i, 'exploit')}</p>}
                                    {err(i, 'fix') && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{err(i, 'fix')}</p>}
                                    <Field id={`finding-${row.key}-xd`} label={`Finding ${i + 1} exploit description`}>
                                        {(p) => <textarea {...p} rows={2} value={row.exploitDescription} onChange={(e) => set(i, { exploitDescription: e.target.value })} className={input} />}
                                    </Field>
                                    <Field id={`finding-${row.key}-xp`} label={`Finding ${i + 1} exploit payload`}>
                                        {(p) => <textarea {...p} rows={2} spellCheck={false} value={row.exploitPayload} onChange={(e) => set(i, { exploitPayload: e.target.value })} className={`${input} font-mono`} />}
                                    </Field>
                                    <Field id={`finding-${row.key}-xr`} label={`Finding ${i + 1} exploit result`}>
                                        {(p) => <textarea {...p} rows={2} spellCheck={false} value={row.exploitResult} onChange={(e) => set(i, { exploitResult: e.target.value })} className={`${input} font-mono`} />}
                                    </Field>
                                    <Field id={`finding-${row.key}-fd`} label={`Finding ${i + 1} fix description`}>
                                        {(p) => <textarea {...p} rows={2} value={row.fixDescription} onChange={(e) => set(i, { fixDescription: e.target.value })} className={input} />}
                                    </Field>
                                    <Field id={`finding-${row.key}-fc`} label={`Finding ${i + 1} fix code`}>
                                        {(p) => <textarea {...p} rows={3} spellCheck={false} value={row.fixCode} onChange={(e) => set(i, { fixCode: e.target.value })} className={`${input} font-mono`} />}
                                    </Field>
                                </div>
                            </details>
                        </li>
                    );
                })}
            </ol>
            <button type="button" className={`${btnSecondary} mt-4`} disabled={disabled || rows.length >= CR_LIMITS.findings} onClick={() => onChange([...rows, newFinding()])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add a finding
            </button>
            <span className={`ml-3 text-xs ${muted}`}>{rows.length} of {CR_LIMITS.findings}</span>
        </div>
    );
}
