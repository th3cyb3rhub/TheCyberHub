'use client';

import { useState } from 'react';
import { input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';
import { CtfMarkdown } from '../CtfMarkdown';

/** A text box with a preview that renders the markdown the way members will see it: sanitised, HTML as text */
export function MarkdownEditor({ id, label, value, onChange, error, max, rows = 12, hint, disabled }: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    max: number;
    rows?: number;
    hint?: string;
    disabled?: boolean;
}) {
    const [preview, setPreview] = useState(false);
    const tab = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-orange-700 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-800'}`;
    return (
        <div>
            <div className="mb-2 flex items-center justify-end">
                <div role="group" aria-label={`${label} view`} className="flex gap-1 rounded-xl border border-gray-200 p-1 dark:border-neutral-800">
                    <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={tab(!preview)}>Write</button>
                    <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={tab(preview)}>Preview</button>
                </div>
            </div>
            {preview ? (
                <div className="min-h-[10rem] rounded-xl border border-gray-300 p-4 dark:border-neutral-700" data-testid={`${id}-preview`}>
                    {value.trim() ? <CtfMarkdown content={value} /> : <p className={`text-sm ${muted}`}>Nothing to preview yet.</p>}
                    <p className={`mt-4 border-t border-gray-100 pt-3 text-xs dark:border-neutral-800 ${muted}`}>This is how members see it: sanitised markdown. HTML is shown as text, and only http and https links work.</p>
                </div>
            ) : (
                <Field id={id} label={label} error={error} hint={hint ?? `${value.length}/${max} characters. Markdown: headings, lists, links, code fences.`}>
                    {(p) => <textarea {...p} rows={rows} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${input} font-mono text-xs sm:text-sm ${error ? inputError : ''}`} />}
                </Field>
            )}
        </div>
    );
}
