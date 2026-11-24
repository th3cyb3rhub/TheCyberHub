'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, UserPlus, UserMinus } from 'lucide-react';
import { btnPrimary, btnSecondary, muted } from '@/components/events/styles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { useRegisterCtf, useUnregisterCtf } from '@/hooks/queries/useCtf';
import { ctfErrorMessage } from '@/lib/ctf/errors';
import { isFull } from '@/lib/ctf/display';
import type { CtfCompetition, CtfMe, CtfStatus } from '@/types/ctf';

/**
 * Registration of a solo competition. In a team competition creating or joining a team registers
 * the member, so there is nothing to press here. Registering is optional in a solo competition: the
 * first flag registers too, when the rules let the member in.
 */
export function RegisterPanel({ competition, status, me, signedIn }: { competition: CtfCompetition; status: CtfStatus; me: CtfMe | null | undefined; signedIn: boolean }) {
    const { addToast } = useToast();
    const register = useRegisterCtf();
    const unregister = useUnregisterCtf();
    const [confirm, setConfirm] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (competition.teamsEnabled || !signedIn || !me) return null;
    if (status === 'ended' || status === 'cancelled' || status === 'draft') return null;

    const busy = register.isPending || unregister.isPending;
    const doRegister = () => {
        setError(null);
        register.mutate({ slug: competition.slug }, {
            onSuccess: () => addToast({ variant: 'success', message: 'You are registered. Good luck!' }),
            onError: (err) => setError(ctfErrorMessage(err)),
        });
    };
    const doUnregister = () => {
        setConfirm(false);
        setError(null);
        unregister.mutate({ slug: competition.slug }, {
            onSuccess: () => addToast({ variant: 'info', message: 'You are no longer registered.' }),
            onError: (err) => setError(ctfErrorMessage(err)),
        });
    };

    const closed = !competition.registrationOpen;
    const full = isFull(competition);

    return (
        <div data-testid="register-panel">
            {me.registered ? (
                <div className="flex flex-wrap items-center gap-3">
                    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-green-800 dark:text-green-300">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> You are registered
                    </p>
                    <button type="button" className={`${btnSecondary} !px-3 !py-1.5`} onClick={() => setConfirm(true)} disabled={busy}>
                        {unregister.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserMinus className="h-4 w-4" aria-hidden="true" />} Unregister
                    </button>
                </div>
            ) : closed || full ? (
                <p className={`text-sm ${muted}`} data-testid="register-closed">{closed ? 'Registration is closed for this competition.' : 'This competition is full.'}</p>
            ) : (
                <button type="button" className={btnPrimary} onClick={doRegister} disabled={busy}>
                    {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />} Register
                </button>
            )}
            <div aria-live="polite">{error && <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300">{error}</p>}</div>
            <ConfirmDialog
                open={confirm}
                variant="warning"
                title="Unregister from this competition?"
                description="You will not get its reminders. A player who has already solved a challenge cannot unregister while the competition runs."
                confirmText="Unregister"
                onCancel={() => setConfirm(false)}
                onConfirm={doUnregister}
            />
        </div>
    );
}
