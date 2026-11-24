'use client';

import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { btnSecondary, card, focusRing, input, inputError, muted } from '@/components/events/styles';
import {
    FORM_LIMITS, rowKey, type CustomFieldRow, type ShowcaseRow, type SyllabusRow,
} from '@/lib/internships/form';
import { ANSWER_TYPES, type AnswerType } from '@/types/internship';
import { Field } from './FormField';

type Errors = Record<string, string>;

const TYPE_LABELS: Record<AnswerType, string> = { text: 'Short text', textarea: 'Long text', dropdown: 'Dropdown', file: 'File link' };

function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
    const to = index + delta;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
}

const iconBtn = `inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800 ${focusRing}`;

function RowActions({ index, count, label, onMove, onRemove }: { index: number; count: number; label: string; onMove: (d: -1 | 1) => void; onRemove: () => void }) {
    return (
        <div className="flex shrink-0 gap-1">
            <button type="button" className={iconBtn} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" className={iconBtn} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" className={`${iconBtn} text-red-800 dark:text-red-300`} onClick={onRemove} aria-label={`Remove ${label}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
        </div>
    );
}

export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
    return (
        <section aria-labelledby={id} className={`${card} p-5 sm:p-6`}>
            <h2 id={id} className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            {description && <p className={`mb-4 mt-1 text-sm ${muted}`}>{description}</p>}
            <div className={description ? '' : 'mt-4'}>{children}</div>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Custom questions
// ---------------------------------------------------------------------------

export function CustomFieldsEditor({ rows, onChange, errors }: { rows: CustomFieldRow[]; onChange: (rows: CustomFieldRow[]) => void; errors: Errors }) {
    const update = (i: number, patch: Partial<CustomFieldRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    return (
        <div>
            {errors.customFields && <p className="mb-3 text-sm text-red-800 dark:text-red-300" role="alert">{errors.customFields}</p>}
            {rows.length === 0 && <p className={`mb-4 text-sm ${muted}`}>No extra questions. Applicants only send a cover letter and links.</p>}
            <ol className="space-y-4">
                {rows.map((row, i) => {
                    const name = `question ${i + 1}`;
                    const base = `customFields.${i}`;
                    return (
                        <li key={row.key} className="rounded-xl border border-gray-200 p-4 dark:border-neutral-800" data-testid="custom-field-row">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Question {i + 1}</p>
                                <RowActions index={i} count={rows.length} label={name} onMove={(d) => onChange(move(rows, i, d))} onRemove={() => onChange(rows.filter((_, j) => j !== i))} />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                                <Field id={`${row.key}-label`} label="Question" required error={errors[`${base}.label`] ?? errors[base]}>
                                    {(p) => <input {...p} type="text" value={row.label} maxLength={FORM_LIMITS.customFieldLabel} onChange={(e) => update(i, { label: e.target.value })} className={`${input} ${errors[`${base}.label`] ? inputError : ''}`} />}
                                </Field>
                                <Field id={`${row.key}-type`} label="Answer type" error={errors[`${base}.type`]}>
                                    {(p) => (
                                        <select {...p} value={row.type} onChange={(e) => update(i, { type: e.target.value as AnswerType, options: e.target.value === 'dropdown' && row.options.length === 0 ? [''] : row.options })} className={input}>
                                            {ANSWER_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                                        </select>
                                    )}
                                </Field>
                            </div>
                            <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                                <input type="checkbox" checked={row.required} onChange={(e) => update(i, { required: e.target.checked })} className="h-4 w-4 rounded border-gray-400 text-orange-700 focus:ring-orange-500" />
                                Applicants must answer
                            </label>
                            {row.type === 'dropdown' && (
                                <fieldset className="mt-4" aria-describedby={errors[`${base}.options`] ? `${row.key}-options-error` : undefined}>
                                    <legend className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">Options</legend>
                                    <ul className="space-y-2">
                                        {row.options.map((opt, k) => (
                                            <li key={k} className="flex items-center gap-2">
                                                <label className="sr-only" htmlFor={`${row.key}-opt-${k}`}>Option {k + 1}</label>
                                                <input id={`${row.key}-opt-${k}`} type="text" value={opt} maxLength={FORM_LIMITS.customFieldOptionLength} onChange={(e) => update(i, { options: row.options.map((o, m) => (m === k ? e.target.value : o)) })} className={input} />
                                                <button type="button" className={iconBtn} onClick={() => update(i, { options: row.options.filter((_, m) => m !== k) })} aria-label={`Remove option ${k + 1}`}><X className="h-4 w-4" aria-hidden="true" /></button>
                                            </li>
                                        ))}
                                    </ul>
                                    {errors[`${base}.options`] && <p id={`${row.key}-options-error`} className="mt-1 text-sm text-red-800 dark:text-red-300" role="alert">{errors[`${base}.options`]}</p>}
                                    <button type="button" className={`${btnSecondary} mt-2 !px-3 !py-1.5`} disabled={row.options.length >= FORM_LIMITS.customFieldOptions} onClick={() => update(i, { options: [...row.options, ''] })}>
                                        <Plus className="h-4 w-4" aria-hidden="true" /> Add option
                                    </button>
                                </fieldset>
                            )}
                        </li>
                    );
                })}
            </ol>
            <button type="button" className={`${btnSecondary} mt-4`} disabled={rows.length >= FORM_LIMITS.customFields} onClick={() => onChange([...rows, { key: rowKey(), label: '', type: 'text', options: [], required: false }])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add a question
            </button>
            <p className={`mt-2 text-xs ${muted}`}>{rows.length} of {FORM_LIMITS.customFields} questions. Removing or changing a question does not change answers already sent.</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Syllabus
// ---------------------------------------------------------------------------

export function SyllabusEditor({ rows, onChange, errors }: { rows: SyllabusRow[]; onChange: (rows: SyllabusRow[]) => void; errors: Errors }) {
    const update = (i: number, patch: Partial<SyllabusRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const nextWeek = Math.min(FORM_LIMITS.syllabusWeeks, rows.reduce((max, r) => Math.max(max, Number(r.week) || 0), 0) + 1);
    return (
        <div>
            {errors.syllabus && <p className="mb-3 text-sm text-red-800 dark:text-red-300" role="alert">{errors.syllabus}</p>}
            {rows.length === 0 && <p className={`mb-4 text-sm ${muted}`}>No curriculum yet. Add one row per week.</p>}
            <ol className="space-y-4">
                {rows.map((row, i) => {
                    const base = `syllabus.${i}`;
                    return (
                        <li key={row.key} className="rounded-xl border border-gray-200 p-4 dark:border-neutral-800" data-testid="syllabus-row">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Week {row.week || '?'}</p>
                                <RowActions index={i} count={rows.length} label={`week ${row.week || i + 1}`} onMove={(d) => onChange(move(rows, i, d))} onRemove={() => onChange(rows.filter((_, j) => j !== i))} />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
                                <Field id={`${row.key}-week`} label="Week" required error={errors[`${base}.week`]}>
                                    {(p) => <input {...p} type="number" min={1} max={FORM_LIMITS.syllabusWeeks} value={row.week} onChange={(e) => update(i, { week: e.target.value })} className={`${input} ${errors[`${base}.week`] ? inputError : ''}`} />}
                                </Field>
                                <Field id={`${row.key}-title`} label="Title" required error={errors[`${base}.title`]}>
                                    {(p) => <input {...p} type="text" value={row.title} maxLength={FORM_LIMITS.syllabusTitle} onChange={(e) => update(i, { title: e.target.value })} className={`${input} ${errors[`${base}.title`] ? inputError : ''}`} />}
                                </Field>
                            </div>
                            <Field className="mt-4" id={`${row.key}-description`} label="Description" error={errors[`${base}.description`]}>
                                {(p) => <textarea {...p} rows={2} value={row.description} maxLength={FORM_LIMITS.syllabusDescription} onChange={(e) => update(i, { description: e.target.value })} className={input} />}
                            </Field>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <Field id={`${row.key}-topics`} label="Topics" hint="One per line." error={errors[`${base}.topics`]}>
                                    {(p) => <textarea {...p} rows={3} value={row.topics} onChange={(e) => update(i, { topics: e.target.value })} className={`${input} ${errors[`${base}.topics`] ? inputError : ''}`} />}
                                </Field>
                                <Field id={`${row.key}-deliverables`} label="Deliverables" hint="One per line." error={errors[`${base}.deliverables`]}>
                                    {(p) => <textarea {...p} rows={3} value={row.deliverables} onChange={(e) => update(i, { deliverables: e.target.value })} className={`${input} ${errors[`${base}.deliverables`] ? inputError : ''}`} />}
                                </Field>
                            </div>
                        </li>
                    );
                })}
            </ol>
            <button type="button" className={`${btnSecondary} mt-4`} disabled={rows.length >= FORM_LIMITS.syllabusWeeks} onClick={() => onChange([...rows, { key: rowKey(), week: String(nextWeek), title: '', description: '', topics: '', deliverables: '' }])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add a week
            </button>
            <p className={`mt-2 text-xs ${muted}`}>{rows.length} of {FORM_LIMITS.syllabusWeeks} weeks.</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Showcase (completed programs)
// ---------------------------------------------------------------------------

export function ShowcaseEditor({ rows, onChange, errors }: { rows: ShowcaseRow[]; onChange: (rows: ShowcaseRow[]) => void; errors: Errors }) {
    const update = (i: number, patch: Partial<ShowcaseRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    return (
        <div>
            {errors.showcaseProjects && <p className="mb-3 text-sm text-red-800 dark:text-red-300" role="alert">{errors.showcaseProjects}</p>}
            {rows.length === 0 && <p className={`mb-4 text-sm ${muted}`}>No projects yet. Add what this cohort built.</p>}
            <ol className="space-y-4">
                {rows.map((row, i) => {
                    const base = `showcaseProjects.${i}`;
                    return (
                        <li key={row.key} className="rounded-xl border border-gray-200 p-4 dark:border-neutral-800" data-testid="showcase-row">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Project {i + 1}</p>
                                <RowActions index={i} count={rows.length} label={`project ${i + 1}`} onMove={(d) => onChange(move(rows, i, d))} onRemove={() => onChange(rows.filter((_, j) => j !== i))} />
                            </div>
                            <Field id={`${row.key}-title`} label="Title" required error={errors[`${base}.title`]}>
                                {(p) => <input {...p} type="text" value={row.title} maxLength={FORM_LIMITS.showcaseTitle} onChange={(e) => update(i, { title: e.target.value })} className={`${input} ${errors[`${base}.title`] ? inputError : ''}`} />}
                            </Field>
                            <Field className="mt-4" id={`${row.key}-description`} label="Description" error={errors[`${base}.description`]}>
                                {(p) => <textarea {...p} rows={2} value={row.description} maxLength={FORM_LIMITS.showcaseDescription} onChange={(e) => update(i, { description: e.target.value })} className={input} />}
                            </Field>
                            <Field className="mt-4" id={`${row.key}-team`} label="Team members" hint="One name per line." error={errors[`${base}.teamMembers`]}>
                                {(p) => <textarea {...p} rows={2} value={row.teamMembers} onChange={(e) => update(i, { teamMembers: e.target.value })} className={input} />}
                            </Field>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <Field id={`${row.key}-demo`} label="Demo link" error={errors[`${base}.demoLink`]}>
                                    {(p) => <input {...p} type="url" inputMode="url" value={row.demoLink} onChange={(e) => update(i, { demoLink: e.target.value })} placeholder="https://" className={`${input} ${errors[`${base}.demoLink`] ? inputError : ''}`} />}
                                </Field>
                                <Field id={`${row.key}-repo`} label="Code link" error={errors[`${base}.repoLink`]}>
                                    {(p) => <input {...p} type="url" inputMode="url" value={row.repoLink} onChange={(e) => update(i, { repoLink: e.target.value })} placeholder="https://github.com/" className={`${input} ${errors[`${base}.repoLink`] ? inputError : ''}`} />}
                                </Field>
                            </div>
                        </li>
                    );
                })}
            </ol>
            <button type="button" className={`${btnSecondary} mt-4`} disabled={rows.length >= FORM_LIMITS.showcaseProjects} onClick={() => onChange([...rows, { key: rowKey(), title: '', description: '', teamMembers: '', demoLink: '', repoLink: '', image: '' }])}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add a project
            </button>
            <p className={`mt-2 text-xs ${muted}`}>{rows.length} of {FORM_LIMITS.showcaseProjects} projects. Links must start with http:// or https://.</p>
        </div>
    );
}
