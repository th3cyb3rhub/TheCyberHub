'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DialogShell } from '@/components/events/DialogShell';
import { btnDanger, btnSecondary, input, inputError, muted } from '@/components/events/styles';
import { JOB_LIMITS } from '@/lib/jobs/constants';
import { formErrors, jobErrorMessage } from '@/lib/jobs/errors';

interface Props {
    open: boolean;
    onClose: () => void;
    title: string;
    description: string;
    /** What the poster will read: the reason is sent to them */
    confirmLabel: string;
    /** Resolves when the decision was made; a rejection shows its message in the dialog */
    onSubmit: (reason: string) => Promise<unknown>;
}

/**
 * The reason a reviewer gives for rejecting a job or a company. The poster reads it, so it is
 * required (3 to 500 characters, like the API) and an error from the server stays in the dialog
 * with what was typed.
 */
export function ReasonDialog({ open, onClose, title, description, confirmLabel, onSubmit }: Props) {
    const id = useId();
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);

    // A dialog opened again starts empty
    useEffect(() => {
        if (open) { setReason(''); setError(''); setPending(false); }
    }, [open]);

    const trimmed = reason.trim();
    const tooShort = trimmed.length < JOB_LIMITS.reasonMin;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pending) return;
        if (tooShort) { setError(`Give the poster a reason (at least ${JOB_LIMITS.reasonMin} characters).`); return; }
        if (trimmed.length > JOB_LIMITS.reasonMax) { setError(`The reason has at most ${JOB_LIMITS.reasonMax} characters.`); return; }
        setPending(true);
        setError('');
        try {
            await onSubmit(trimmed);
            onClose();
        } catch (err) {
            setError(formErrors(err).reason || jobErrorMessage(err));
            setPending(false);
        }
    };

    return (
        <DialogShell
            open={open}
            onOpenChange={(o) => { if (!o && !pending) onClose(); }}
            title={title}
            description={description}
            footer={(
                <>
                    <button type="button" className={btnSecondary} onClick={onClose} disabled={pending}>Cancel</button>
                    <button type="submit" form={`${id}-form`} className={btnDanger} disabled={pending} data-testid="confirm-reject">
                        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {confirmLabel}
                    </button>
                </>
            )}
        >
            <form id={`${id}-form`} onSubmit={(e) => void submit(e)} noValidate>
                <label htmlFor={`${id}-reason`} className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">Reason <span className="text-red-700 dark:text-red-400" aria-hidden="true">*</span><span className="sr-only"> (required)</span></label>
                <textarea
                    id={`${id}-reason`}
                    rows={4}
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); if (error) setError(''); }}
                    maxLength={JOB_LIMITS.reasonMax + 50}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
                    className={`${input} resize-y ${error ? inputError : ''}`}
                    placeholder="What needs to change before this can be approved?"
                    autoFocus
                />
                <p id={`${id}-hint`} className={`mt-1 flex justify-between text-xs ${muted}`}>
                    <span>The poster is notified and reads this text.</span>
                    <span aria-hidden="true">{trimmed.length}/{JOB_LIMITS.reasonMax}</span>
                </p>
                {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300" data-testid="reason-error">{error}</p>}
            </form>
        </DialogShell>
    );
}
