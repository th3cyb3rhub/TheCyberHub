'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { Flag } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useReportResource } from '@/hooks/queries/useResources';
import { learningErrorMessage } from '@/lib/learning/errors';
import { REPORT_LABELS } from '@/lib/learning/display';
import { LIMITS, reportSchema } from '@/lib/learning/schemas';
import { REPORT_REASONS, type ReportReason } from '@/types/resource';
import { Modal } from '@/components/learning/shared';
import { focusRing, input, label as labelClass, muted } from '@/components/events/styles';

/** Report a library entry: a reason from the list and optional details. The dialog keeps what was typed if the call fails. */
export function ReportButton({ slug, title, isOwner = false }: { slug: string; title: string; isOwner?: boolean }) {
    const { user } = useAuth();
    const report = useReportResource();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState<ReportReason | ''>('');
    const [details, setDetails] = useState('');
    const [problem, setProblem] = useState<string | null>(null);
    const group = useId();

    useEffect(() => {
        if (!open) {
            setReason('');
            setDetails('');
            setProblem(null);
            report.reset();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Signed out visitors cannot report, and nobody reports their own submission
    if (!user || isOwner) return null;

    const submit = () => {
        const parsed = reportSchema.safeParse({ reason, details });
        if (!parsed.success) {
            setProblem(parsed.error.issues[0]?.message ?? 'Check the form');
            return;
        }
        setProblem(null);
        report.mutate({ slug, reason: parsed.data.reason, details: parsed.data.details }, { onSuccess: () => setOpen(false) });
    };

    return (
        <>
            <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 hover:text-red-800 dark:text-gray-300 dark:hover:bg-neutral-800 dark:hover:text-red-300 ${focusRing}`}>
                <Flag className="h-4 w-4" aria-hidden="true" /> Report<span className="sr-only"> {title}</span>
            </button>
            <Modal
                open={open}
                onOpenChange={setOpen}
                title="Report this resource"
                description="A moderator will review it against the community guidelines. Tell us what is wrong."
                confirmLabel="Send report"
                destructive
                pending={report.isPending}
                confirmDisabled={!reason}
                error={problem ?? (report.error ? learningErrorMessage(report.error) : null)}
                onConfirm={submit}
            >
                <fieldset>
                    <legend className={labelClass}>Reason</legend>
                    <div className="space-y-2">
                        {REPORT_REASONS.map((r) => (
                            <label key={r} className="flex cursor-pointer items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
                                <input type="radio" name={group} value={r} checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-orange-600" />
                                {REPORT_LABELS[r]}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div className="mt-4">
                    <label htmlFor={`${group}-details`} className={labelClass}>Details (optional)</label>
                    <textarea id={`${group}-details`} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={LIMITS.reportDetails} className={`${input} resize-none`} />
                    <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{details.length}/{LIMITS.reportDetails}</p>
                </div>
                <p className={`mt-2 text-xs ${muted}`}>See the <Link href="/community-guidelines" className="text-orange-800 underline dark:text-orange-400" target="_blank">community guidelines</Link>.</p>
            </Modal>
        </>
    );
}
