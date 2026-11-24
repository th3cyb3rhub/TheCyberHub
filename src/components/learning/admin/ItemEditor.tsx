'use client';

import { useEffect, useId, useState } from 'react';
import { ArrowDown, ArrowUp, Search, Trash2 } from 'lucide-react';
import { useResourceList } from '@/hooks/queries/useResources';
import { ITEM_KIND_LABELS } from '@/lib/learning/display';
import { CHEATSHEETS, TOOL_TARGETS } from '@/lib/learning/targets';
import { ITEM_KINDS, type EditorItem, type ItemKind } from '@/types/learning';
import { fieldClass } from '../shared';
import { btnGhost, input, muted } from '@/components/events/styles';

/** Find an approved library resource and pick it. The step stores the resource id. */
function ResourcePicker({ id, value, title, error, onPick }: { id: string; value: string; title: string; error?: string; onPick: (ref: string, title: string) => void }) {
    const [text, setText] = useState('');
    const [q, setQ] = useState('');
    useEffect(() => {
        const t = window.setTimeout(() => setQ(text.trim().length >= 2 ? text.trim() : ''), 300);
        return () => window.clearTimeout(t);
    }, [text]);
    const results = useResourceList({ q: q || undefined, sort: q ? 'relevance' : 'top' });
    const items = q ? (results.data?.pages[0]?.data ?? []).slice(0, 6) : [];
    return (
        <div className="min-w-0 flex-1">
            {value && <p className="mb-1 text-sm text-gray-900 dark:text-white" data-testid="picked">Selected: <strong>{title || value}</strong></p>}
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                <input id={id} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search the library" aria-label="Search library resources" className={`${fieldClass(error)} pl-9`} aria-invalid={!!error} />
            </div>
            {q && (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900" aria-label="Search results">
                    {results.isLoading && <li className={`px-3 py-2 text-sm ${muted}`}>Searching</li>}
                    {!results.isLoading && items.length === 0 && <li className={`px-3 py-2 text-sm ${muted}`}>No approved resources match.</li>}
                    {items.map((r) => (
                        <li key={r.id}>
                            <button type="button" className="block w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none dark:text-gray-100 dark:hover:bg-neutral-800 dark:focus-visible:bg-neutral-800" onClick={() => { onPick(r.id, r.title); setText(''); }}>
                                {r.title} <span className={`text-xs ${muted}`}>{r.domain}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function emptyItem(kind: ItemKind = 'resource'): EditorItem {
    return { kind, ref: '', title: '', optional: false };
}

interface ItemEditorProps {
    item: EditorItem;
    index: number;
    count: number;
    /** Error for the link field, from the form check or from the API */
    error?: string;
    onChange: (item: EditorItem) => void;
    onMove: (delta: -1 | 1) => void;
    onRemove: () => void;
}

/** One link of a step: what kind, where it points, an optional title and an "optional" mark */
export function ItemEditor({ item, index, count, error, onChange, onMove, onRemove }: ItemEditorProps) {
    const uid = useId();
    const n = index + 1;
    const change = (changes: Partial<EditorItem>) => onChange({ ...item, ...changes });
    const ref = `${uid}-ref`;
    return (
        <li className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/40" data-testid="item-editor">
            <div className="flex flex-wrap items-start gap-3">
                <div>
                    <label htmlFor={`${uid}-kind`} className="sr-only">Link {n} type</label>
                    <select id={`${uid}-kind`} value={item.kind} onChange={(e) => onChange({ ...emptyItem(e.target.value as ItemKind), optional: item.optional })} className={`${input} !w-auto`}>
                        {ITEM_KINDS.map((k) => <option key={k} value={k}>{ITEM_KIND_LABELS[k]}</option>)}
                    </select>
                </div>
                {item.kind === 'resource' ? (
                    <ResourcePicker id={ref} value={item.ref} title={item.title} error={error} onPick={(r, title) => change({ ref: r, title })} />
                ) : (
                    <div className="min-w-0 flex-1">
                        <label htmlFor={ref} className="sr-only">Link {n} target</label>
                        {item.kind === 'tool' || item.kind === 'cheatsheet' ? (
                            <select id={ref} value={item.ref} onChange={(e) => change({ ref: e.target.value })} className={fieldClass(error)} aria-invalid={!!error}>
                                <option value="">{item.kind === 'tool' ? 'Choose a tool' : 'Choose a cheatsheet'}</option>
                                {(item.kind === 'tool' ? TOOL_TARGETS : CHEATSHEETS).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                            </select>
                        ) : (
                            <input id={ref} value={item.ref} onChange={(e) => change({ ref: e.target.value.trim() })} placeholder={item.kind === 'external' ? 'https://' : `${ITEM_KIND_LABELS[item.kind]} slug`} className={fieldClass(error)} aria-invalid={!!error} inputMode={item.kind === 'external' ? 'url' : 'text'} autoComplete="off" />
                        )}
                    </div>
                )}
            </div>
            {error && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <label htmlFor={`${uid}-title`} className="sr-only">Link {n} title (optional)</label>
                    <input id={`${uid}-title`} value={item.title} onChange={(e) => change({ title: e.target.value })} placeholder="Title shown on the page (optional)" maxLength={200} className={input} />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"><input type="checkbox" checked={item.optional} onChange={(e) => change({ optional: e.target.checked })} className="h-4 w-4 accent-orange-600" /> Optional</label>
                <div className="flex gap-1">
                    <button type="button" className={btnGhost} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Move link {n} up</span></button>
                    <button type="button" className={btnGhost} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Move link {n} down</span></button>
                    <button type="button" className={`${btnGhost} text-red-800 dark:text-red-300`} onClick={onRemove}><Trash2 className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Remove link {n}</span></button>
                </div>
            </div>
        </li>
    );
}
