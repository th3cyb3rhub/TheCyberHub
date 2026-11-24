'use client';

import { useState } from 'react';
import { ExternalLink, Loader2, Mail } from 'lucide-react';
import { btnPrimary, muted } from '@/components/events/styles';
import { useApplyJob } from '@/hooks/queries/useJobs';
import { applyTarget, openOutbound, type ApplyTarget } from '@/lib/jobs/apply';
import { jobErrorMessage } from '@/lib/jobs/errors';
import { LINK_REL } from '@/lib/jobs/display';

interface Props {
    id: string;
    title: string;
    /** `block` is the full width call to action of the sidebar */
    variant?: 'inline' | 'block';
}

/**
 * Apply happens on the employer's own site. The button counts the click (`POST /jobs/:id/apply`),
 * then opens what the API returned: its link when it is http or https, else a mailto link to the
 * address. The link is also written out, so a blocked pop-up never leaves the visitor stuck. The
 * page never opens an address it was not given by that call.
 */
export function ApplyPanel({ id, title, variant = 'inline' }: Props) {
    const apply = useApplyJob();
    const [target, setTarget] = useState<ApplyTarget | null>(null);
    const [failure, setFailure] = useState<string | null>(null);

    const run = () => {
        setFailure(null);
        apply.mutate({ id }, {
            onSuccess: (details) => {
                const next = applyTarget(details, title);
                setTarget(next);
                if (next.kind === 'url') openOutbound(next.href);
            },
            onError: (err) => setFailure(jobErrorMessage(err, 'Could not open the application. Please try again.')),
        });
    };

    return (
        <div className={variant === 'block' ? 'w-full' : ''}>
            <button type="button" onClick={run} disabled={apply.isPending} data-testid="apply" className={`${btnPrimary} ${variant === 'block' ? 'w-full' : 'px-8'}`}>
                {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
                Apply on the employer&apos;s site
            </button>
            <div aria-live="polite" className="mt-2 text-sm">
                {failure && <p role="alert" className="text-red-800 dark:text-red-300">{failure}</p>}
                {target?.kind === 'url' && (
                    <p className={muted} data-testid="apply-result">
                        Opening {target.host} in a new tab. If nothing opened, <a href={target.href} target="_blank" rel={LINK_REL} className="font-medium text-orange-800 underline dark:text-orange-300">go to {target.host}</a>.
                    </p>
                )}
                {target?.kind === 'email' && (
                    <p className={muted} data-testid="apply-result">
                        This employer takes applications by email: <a href={target.href} className="inline-flex items-center gap-1 font-medium text-orange-800 underline dark:text-orange-300"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{target.address}</a>
                    </p>
                )}
                {target?.kind === 'none' && (
                    <p className={muted} data-testid="apply-result">The employer has not given a way to apply. Look for their contact details on their company page.</p>
                )}
            </div>
        </div>
    );
}
