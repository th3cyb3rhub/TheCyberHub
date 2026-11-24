'use client';

import { useId } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { moveNode } from '@/lib/learning/editor';
import type { EditorNodeValues } from '@/lib/learning/editor';
import { LIMITS } from '@/lib/learning/schemas';
import { Field, fieldClass } from '../shared';
import { btnGhost, btnSecondary, card, focusRing, muted } from '@/components/events/styles';
import { emptyItem, ItemEditor } from './ItemEditor';

interface NodeEditorProps {
    node: EditorNodeValues;
    index: number;
    count: number;
    /** Keys of the other steps, for "requires" */
    otherKeys: { key: string; title: string }[];
    stages: string[];
    errors: Record<string, string>;
    expanded: boolean;
    onToggle: () => void;
    onChange: (node: EditorNodeValues) => void;
    onMove: (delta: -1 | 1) => void;
    onRemove: () => void;
}

/** One step of a roadmap: its text, advice on order, and the links it carries */
export function NodeEditor({ node, index, count, otherKeys, stages, errors, expanded, onToggle, onChange, onMove, onRemove }: NodeEditorProps) {
    const uid = useId();
    const n = index + 1;
    const err = (field: string) => errors[`modules.${index}.${field}`];
    const set = <K extends keyof EditorNodeValues>(key: K, value: EditorNodeValues[K]) => onChange({ ...node, [key]: value });
    const hasError = Object.keys(errors).some((k) => k.startsWith(`modules.${index}.`));

    return (
        <li className={`${card} p-4 ${hasError ? 'border-red-400 dark:border-red-500/60' : ''}`} data-testid="node-editor">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 text-base font-semibold text-gray-900 dark:text-white">
                    <button type="button" aria-expanded={expanded} aria-controls={`${uid}-body`} onClick={onToggle} className={`inline-flex items-center gap-2 rounded text-left ${focusRing}`}>
                        <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        <span>Step {n}{node.title ? `: ${node.title}` : ''}</span>
                    </button>
                    {hasError && <span className="ml-2 text-xs font-normal text-red-700 dark:text-red-400">Needs attention</span>}
                </h3>
                <div className="flex gap-1">
                    <button type="button" className={btnGhost} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Move step {n} up</span></button>
                    <button type="button" className={btnGhost} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Move step {n} down</span></button>
                    <button type="button" className={`${btnGhost} text-red-800 dark:text-red-300`} onClick={onRemove}><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Remove step {n}</span></button>
                </div>
            </div>

            <div id={`${uid}-body`} hidden={!expanded} className="mt-4 space-y-4">
                {node.id && <p className={`text-xs ${muted}`}>This step is saved. Keep it (do not delete and re-add it) so members keep their progress on it.</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field id={`${uid}-title`} label="Title" error={err('title')}>
                        <input id={`${uid}-title`} value={node.title} onChange={(e) => set('title', e.target.value)} maxLength={LIMITS.path.nodeTitle.max + 20} className={fieldClass(err('title'))} aria-invalid={!!err('title')} />
                    </Field>
                    <Field id={`${uid}-key`} label="Key" hint="Lower case letters, numbers and dashes. Other steps refer to it." error={err('key')}>
                        <input id={`${uid}-key`} value={node.key} onChange={(e) => set('key', e.target.value.toLowerCase())} className={fieldClass(err('key'))} aria-invalid={!!err('key')} />
                    </Field>
                    <Field id={`${uid}-stage`} label="Stage" hint="Steps with the same stage are grouped." error={err('stage')}>
                        <input id={`${uid}-stage`} list={`${uid}-stages`} value={node.stage} onChange={(e) => set('stage', e.target.value)} maxLength={LIMITS.path.stage + 10} className={fieldClass(err('stage'))} />
                        <datalist id={`${uid}-stages`}>{stages.map((s) => <option key={s} value={s} />)}</datalist>
                    </Field>
                    <Field id={`${uid}-duration`} label="Time needed" hint="For example 1 week" error={err('duration')}>
                        <input id={`${uid}-duration`} value={node.duration} onChange={(e) => set('duration', e.target.value)} maxLength={LIMITS.path.nodeDuration + 10} className={fieldClass(err('duration'))} />
                    </Field>
                </div>
                <Field id={`${uid}-desc`} label="Description" error={err('description')}>
                    <textarea id={`${uid}-desc`} rows={3} value={node.description} onChange={(e) => set('description', e.target.value)} maxLength={LIMITS.path.nodeDescription + 50} className={`${fieldClass(err('description'))} resize-y`} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"><input type="checkbox" checked={node.optional} onChange={(e) => set('optional', e.target.checked)} className="h-4 w-4 accent-orange-600" /> Optional step (does not count toward completion)</label>

                {otherKeys.length > 0 && (
                    <fieldset>
                        <legend className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">Best done after <span className={`font-normal ${muted}`}>(advice only, never blocks)</span></legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {otherKeys.map((o) => (
                                <label key={o.key} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                                    <input type="checkbox" checked={node.requires.includes(o.key)} onChange={(e) => set('requires', e.target.checked ? [...node.requires, o.key] : node.requires.filter((k) => k !== o.key))} className="h-4 w-4 accent-orange-600" />
                                    {o.title || o.key}
                                </label>
                            ))}
                        </div>
                        {err('requires') && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">{err('requires')}</p>}
                    </fieldset>
                )}

                <div>
                    <h4 className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">Links ({node.items.length}/{LIMITS.path.items})</h4>
                    {err('items') && <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">{err('items')}</p>}
                    {node.items.length > 0 && (
                        <ul className="mb-3 list-none space-y-2">
                            {node.items.map((item, i) => (
                                <ItemEditor
                                    key={i}
                                    item={item}
                                    index={i}
                                    count={node.items.length}
                                    error={err(`items.${i}.ref`)}
                                    onChange={(next) => set('items', node.items.map((x, j) => (j === i ? next : x)))}
                                    onMove={(d) => set('items', moveNode(node.items, i, d))}
                                    onRemove={() => set('items', node.items.filter((_, j) => j !== i))}
                                />
                            ))}
                        </ul>
                    )}
                    <button type="button" className={btnSecondary} disabled={node.items.length >= LIMITS.path.items} onClick={() => set('items', [...node.items, emptyItem()])}><Plus className="h-4 w-4" aria-hidden="true" /> Add a link<span className="sr-only"> to step {n}</span></button>
                </div>
            </div>
        </li>
    );
}
