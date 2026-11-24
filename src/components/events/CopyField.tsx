'use client';

import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { btnSecondary, input } from './styles';

/**
 * A read-only address with a copy button. Falls back to selecting the text when the clipboard is not
 * available. `sensitive` keeps the value out of session recordings.
 */
export function CopyField({ id, label, value, sensitive = false }: { id: string; label: string; value: string; sensitive?: boolean }) {
    const ref = useRef<HTMLInputElement>(null);
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setState('copied');
        } catch {
            ref.current?.select();
            setState('failed');
        }
        window.setTimeout(() => setState('idle'), 2500);
    };

    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</label>
            <div className="flex gap-2">
                <input
                    ref={ref}
                    id={id}
                    type="text"
                    readOnly
                    value={value}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`${input} min-w-0 font-mono text-xs`}
                    {...(sensitive ? { 'data-sentry-mask': true, 'data-private': 'true' } : {})}
                />
                <button type="button" className={`${btnSecondary} shrink-0`} onClick={() => void copy()}>
                    {state === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {state === 'copied' ? 'Copied' : 'Copy'}
                    <span className="sr-only"> {label}</span>
                </button>
            </div>
            <p className="sr-only" role="status">{state === 'copied' ? 'Copied to the clipboard' : state === 'failed' ? 'Could not copy. The text is selected, press Control C.' : ''}</p>
            {state === 'failed' && <p className="mt-1 text-xs text-amber-900 dark:text-amber-300" aria-hidden="true">Could not copy. The text is selected: press Ctrl+C.</p>}
        </div>
    );
}
