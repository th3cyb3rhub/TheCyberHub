'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DialogShell } from '@/components/events/DialogShell';
import { btnDanger, btnSecondary, input, label as labelClass, muted } from '@/components/events/styles';
import { useReportJob } from '@/hooks/queries/useJobs';
import { JOB_LIMITS, REPORT_LABELS } from '@/lib/jobs/constants';
import { isAlreadyReported, reportErrorMessage } from '@/lib/jobs/errors';
import { JOB_REPORT_REASONS, type JobReportReason } from '@/types/job';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    job: { _id: string; title: string };
}

/**
 * Report a job: a reason from the list and optional details. The dialog keeps what was typed when
 * the call fails. A job the member already reported, their own job and a job that is gone each say
 * so in plain words; a member who reached the daily limit is told to wait.
 */
export function ReportJobDialog({ open, onOpenChange, job }: Props) {
    const report = useReportJob();
    const [reason, setReason] = useState<JobReportReason | ''>('');
    const [details, setDetails] = useState('');
    const [problem, setProblem] = useState<string | null>(null);
    const [already, setAlready] = useState(false);
    const group = useId();

    useEffect(() => {
        if (open) {
            setReason('');
            setDetails('');
            setProblem(null);
            setAlready(false);
            report.reset();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const submit = () => {
        if (!reason) {
            setProblem('Choose what is wrong with this job');
            return;
        }
        setProblem(null);
        report.mutate({ id: job._id, reason, details }, {
            onSuccess: () => onOpenChange(false),
            onError: (err) => {
                setProblem(reportErrorMessage(err));
                // The report already stands: there is nothing more to send
                if (isAlreadyReported(err)) setAlready(true);
            },
        });
    };

    return (
        <DialogShell
            open={open}
            onOpenChange={(o) => { if (!o && !report.isPending) onOpenChange(false); }}
            title="Report this job"
            description={`A moderator will look at "${job.title}" against the community guidelines. Tell us what is wrong.`}
            wide
            footer={(
                <>
                    <button type="button" className={btnSecondary} onClick={() => onOpenChange(false)} disabled={report.isPending}>{already ? 'Close' : 'Cancel'}</button>
                    {!already && (
                        <button type="button" className={btnDanger} onClick={submit} disabled={report.isPending || !reason}>
                            {report.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Send report
                        </button>
                    )}
                </>
            )}
        >
            <fieldset disabled={already}>
                <legend className={labelClass}>Reason</legend>
                <div className="space-y-2">
                    {JOB_REPORT_REASONS.map((r) => (
                        <label key={r} className="flex cursor-pointer items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
                            <input type="radio" name={group} value={r} checked={reason === r} onChange={() => { setReason(r); setProblem(null); }} className="h-4 w-4 accent-orange-600" />
                            {REPORT_LABELS[r]}
                        </label>
                    ))}
                </div>
                <div className="mt-4">
                    <label htmlFor={`${group}-details`} className={labelClass}>Details (optional)</label>
                    <textarea id={`${group}-details`} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={JOB_LIMITS.reportDetails} className={`${input} resize-none`} />
                    <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{details.length}/{JOB_LIMITS.reportDetails}</p>
                </div>
            </fieldset>
            {problem && <p role="alert" className="mt-3 text-sm text-red-800 dark:text-red-300" data-testid="report-error">{problem}</p>}
            <p className={`mt-3 text-xs ${muted}`}>See the <Link href="/community-guidelines" className="text-orange-800 underline dark:text-orange-400" target="_blank" rel="noopener noreferrer">community guidelines</Link>. We never tell the poster who reported.</p>
        </DialogShell>
    );
}
