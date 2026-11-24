'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { btnPrimary, card, input, inputError, label as labelClass, muted } from './styles';

/**
 * The input panel every server tool uses: one labelled main field, optional extra fields, a submit
 * button with a busy state, and an inline error tied to the field. Enter submits, Escape clears.
 */
export function ToolForm({
    id, label, value, onChange, onSubmit, placeholder, buttonLabel = 'Run', pending = false, disabled = false,
    error, hint, inputMode, children, multiline = false, rows = 4, autoComplete = 'off', submitDisabled = false,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder?: string;
    buttonLabel?: string;
    pending?: boolean;
    /** Greys out the whole form (tool paused, sign-in needed) */
    disabled?: boolean;
    error?: string | null;
    hint?: string;
    inputMode?: 'text' | 'url' | 'search' | 'numeric';
    children?: React.ReactNode;
    multiline?: boolean;
    rows?: number;
    autoComplete?: string;
    /** Keeps the button off without greying the fields (a confirmation is missing) */
    submitDisabled?: boolean;
}) {
    const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
    const fieldClass = `${input} ${error ? inputError : ''}`;
    return (
        <form
            className={`${card} p-5`}
            noValidate
            aria-busy={pending}
            onSubmit={(e) => { e.preventDefault(); if (!pending && !disabled && !submitDisabled) onSubmit(); }}
        >
            <fieldset disabled={disabled} className="min-w-0 border-0 p-0">
                <label htmlFor={id} className={labelClass}>{label}</label>
                <div className={multiline ? 'space-y-3' : 'flex flex-col gap-3 sm:flex-row'}>
                    {multiline ? (
                        <textarea
                            id={id}
                            value={value}
                            rows={rows}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={placeholder}
                            aria-invalid={!!error}
                            aria-describedby={describedBy}
                            className={`${fieldClass} font-mono`}
                            spellCheck={false}
                            autoComplete={autoComplete}
                        />
                    ) : (
                        <input
                            id={id}
                            type="text"
                            value={value}
                            inputMode={inputMode}
                            onChange={(e) => onChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); } }}
                            placeholder={placeholder}
                            aria-invalid={!!error}
                            aria-describedby={describedBy}
                            className={fieldClass}
                            spellCheck={false}
                            autoCapitalize="none"
                            autoCorrect="off"
                            autoComplete={autoComplete}
                        />
                    )}
                    {!children && (
                        <button type="submit" className={`${btnPrimary} shrink-0 sm:min-w-[7.5rem]`} disabled={pending || submitDisabled}>
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                            {pending ? 'Working' : buttonLabel}
                        </button>
                    )}
                </div>
                {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300">{error}</p>}
                {hint && <p id={`${id}-hint`} className={`mt-2 text-xs ${muted}`}>{hint}</p>}
                {children && (
                    <div className="mt-4 space-y-4">
                        {children}
                        <button type="submit" className={btnPrimary} disabled={pending || submitDisabled}>
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                            {pending ? 'Working' : buttonLabel}
                        </button>
                    </div>
                )}
            </fieldset>
        </form>
    );
}

/**
 * The `?target=` value of the page address, read after mount, and a way to write it back without
 * a navigation. Only the target is shared: never a result, never a secret.
 */
export function useTargetParam(key = 'target') {
    const [initial, setInitial] = useState('');
    useEffect(() => {
        try { setInitial(new URLSearchParams(window.location.search).get(key)?.slice(0, 300) ?? ''); } catch { /* no address bar to read */ }
    }, [key]);
    const save = useCallback((value: string) => {
        try {
            const url = new URL(window.location.href);
            if (value) url.searchParams.set(key, value);
            else url.searchParams.delete(key);
            window.history.replaceState(null, '', url);
        } catch { /* the address is only a convenience */ }
    }, [key]);
    return { initial, save };
}
