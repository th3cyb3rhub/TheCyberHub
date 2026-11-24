'use client';

import { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { btnPrimary, muted } from '@/components/events/styles';
import { useResubmitCompany } from '@/hooks/queries/useJobs';
import { jobErrorMessage } from '@/lib/jobs/errors';

/**
 * "Ask for a new review" for a rejected company. Saving the profile does not do it: a rejected company
 * stays rejected until its owner asks. The API allows it once the profile changed since the decision,
 * or after a wait; when it is too soon the answer says when, and that is shown here, in the viewer's own time zone.
 */
export function ResubmitCompany({ compact = false }: { compact?: boolean }) {
    const resubmit = useResubmitCompany();
    const [error, setError] = useState('');
    const ask = () => {
        setError('');
        resubmit.mutate(undefined, { onError: (err) => setError(jobErrorMessage(err, 'The request could not be sent. Please try again.')) });
    };
    return (
        <div>
            <button type="button" className={`${btnPrimary} ${compact ? '!px-3 !py-1.5 !text-xs' : ''}`} onClick={ask} disabled={resubmit.isPending} data-testid="resubmit-company">
                {resubmit.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />} Ask for a new review
            </button>
            {error && <p role="alert" className={`mt-2 text-sm text-red-900 dark:text-red-300`} data-testid="resubmit-error">{error}</p>}
            {!error && !compact && <p className={`mt-2 text-xs ${muted}`}>Update the profile first: a change lets you ask at once. Otherwise you can ask again a few days after the decision.</p>}
        </div>
    );
}
