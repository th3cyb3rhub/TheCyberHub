'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DialogShell } from '@/components/events/DialogShell';
import { btnDanger, btnSecondary, input, label as labelClass, muted } from '@/components/events/styles';
import { useWithdrawApplication } from '@/hooks/queries/useInternships';
import { LIMITS } from '@/lib/internships/application';

/** Confirm a withdrawal, with an optional reason that stays in the timeline */
export function WithdrawDialog({ open, onClose, applicationId, cohortId, cohortTitle, accepted = false }: {
    open: boolean;
    onClose: () => void;
    applicationId: string;
    cohortId?: string;
    cohortTitle?: string;
    /** Withdrawing an accepted application gives the seat back */
    accepted?: boolean;
}) {
    const [reason, setReason] = useState('');
    const withdraw = useWithdrawApplication();
    const id = useId();

    useEffect(() => { if (open) setReason(''); }, [open]);

    const submit = () => withdraw.mutate({ id: applicationId, cohortId, reason }, { onSuccess: onClose });

    return (
        <DialogShell
            open={open}
            onOpenChange={(o) => { if (!o && !withdraw.isPending) onClose(); }}
            title="Withdraw your application?"
            description={cohortTitle ? `You are withdrawing from ${cohortTitle}.` : undefined}
            footer={(
                <>
                    <button type="button" className={btnSecondary} onClick={onClose} disabled={withdraw.isPending}>Keep my application</button>
                    <button type="button" className={btnDanger} onClick={submit} disabled={withdraw.isPending}>
                        {withdraw.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Withdraw
                    </button>
                </>
            )}
        >
            <p className={`mb-4 text-sm ${muted}`}>
                {accepted ? 'Your seat goes back to the program. ' : ''}You cannot apply to this program again after withdrawing.
            </p>
            <label htmlFor={id} className={labelClass}>Reason (optional)</label>
            <textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={LIMITS.withdrawReason} rows={3} className={input} placeholder="Anything the team should know" />
            <p className={`mt-1 text-xs ${muted}`}>{reason.length}/{LIMITS.withdrawReason}</p>
        </DialogShell>
    );
}
