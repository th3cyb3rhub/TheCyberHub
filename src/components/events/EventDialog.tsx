'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import { btnDanger, btnPrimary, btnSecondary, input, inputError, label as labelClass } from './styles';

interface EventDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    confirmLabel: string;
    destructive?: boolean;
    /** Ask for a reason; the confirm button waits until it is long enough */
    reason?: { label: string; min: number; max: number; placeholder?: string; /** May be left empty; if something is written it still needs `min` characters */ optional?: boolean };
    pending?: boolean;
    /** Shown inside the dialog, so a failed call keeps what was typed */
    error?: string | null;
    onConfirm: (reason: string) => void;
}

/** A confirmation, optionally asking for a reason. Radix handles focus, Escape and the backdrop. */
export function EventDialog({ open, onOpenChange, title, description, confirmLabel, destructive = false, reason, pending = false, error, onConfirm }: EventDialogProps) {
    const [text, setText] = useState('');
    useEffect(() => {
        if (!open) setText('');
    }, [open]);

    const trimmed = text.trim();
    const tooShort = !!reason && trimmed.length < reason.min && !(reason.optional && trimmed.length === 0);
    const fieldId = 'event-dialog-reason';

    return (
        <Dialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
                    <Dialog.Close asChild>
                        <button type="button" aria-label="Close" className="absolute right-4 top-4 rounded p-1 text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:hover:text-white">
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </Dialog.Close>
                    <Dialog.Title className="pr-6 text-lg font-semibold text-gray-900 dark:text-white">{title}</Dialog.Title>
                    {description ? (
                        <Dialog.Description className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</Dialog.Description>
                    ) : (
                        <Dialog.Description className="sr-only">{title}</Dialog.Description>
                    )}

                    {reason && (
                        <div className="mt-4">
                            <label htmlFor={fieldId} className={labelClass}>{reason.label}</label>
                            <textarea
                                id={fieldId}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                rows={4}
                                maxLength={reason.max}
                                placeholder={reason.placeholder}
                                aria-describedby={`${fieldId}-hint`}
                                className={`${input} resize-none ${error ? inputError : ''}`}
                            />
                            <p id={`${fieldId}-hint`} className="mt-1 flex justify-between text-xs text-gray-600 dark:text-gray-400">
                                <span>{reason.optional ? `Optional. If you write one, at least ${reason.min} characters` : `At least ${reason.min} characters`}</span>
                                <span aria-hidden="true">{trimmed.length}/{reason.max}</span>
                            </p>
                        </div>
                    )}

                    {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}

                    <div className="mt-6 flex justify-end gap-3">
                        <Dialog.Close asChild>
                            <button type="button" className={btnSecondary} disabled={pending}>Go back</button>
                        </Dialog.Close>
                        <button
                            type="button"
                            className={destructive ? btnDanger : btnPrimary}
                            disabled={pending || tooShort}
                            onClick={() => onConfirm(trimmed)}
                        >
                            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            {confirmLabel}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
