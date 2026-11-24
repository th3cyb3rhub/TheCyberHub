'use client';

import { label as labelClass, muted } from '@/components/events/styles';

export interface ControlProps {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
    'aria-required': boolean | undefined;
}

/** A labelled control with a hint and a server or client error, wired for screen readers */
export function Field({ id, label, required = false, hint, error, children, className = '' }: {
    id: string;
    label: string;
    required?: boolean;
    hint?: string;
    error?: string;
    children: (props: ControlProps) => React.ReactNode;
    className?: string;
}) {
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
    return (
        <div className={className} data-field={id}>
            <label htmlFor={id} className={labelClass}>
                {label}
                {required && <span className="ml-0.5 text-red-700 dark:text-red-400" aria-hidden="true"> *</span>}
                {required && <span className="sr-only"> (required)</span>}
            </label>
            {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': required || undefined })}
            {hint && <p id={hintId} className={`mt-1 text-xs ${muted}`}>{hint}</p>}
            {error && <p id={errorId} className="mt-1 text-sm text-red-800 dark:text-red-300" role="alert">{error}</p>}
        </div>
    );
}
