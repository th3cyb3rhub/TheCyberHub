'use client';

import { useEffect, useId, useState } from 'react';
import { mentorshipErrorMessage } from '@/lib/mentorship/errors';
import { feedbackSchema, issuesByField, LIMITS, REPORT_REASONS, reportSchema } from '@/lib/mentorship/schemas';
import type { ReportTarget } from '@/types/mentorship';
import { Modal, RatingInput, fieldClass } from './shared';
import { label as labelClass, muted } from './styles';

export interface FeedbackResult { rating: number; comment: string; shareName: boolean }

/** Stars and an optional comment. `shareName` is offered to a mentee, whose first name can sit next to a public review. */
export function FeedbackDialog({ open, onOpenChange, title, description, confirmLabel = 'Send feedback', ratingRequired = true, offerShareName = false, pending, error, onSubmit }: {
    open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; confirmLabel?: string;
    ratingRequired?: boolean; offerShareName?: boolean; pending?: boolean; error?: unknown; onSubmit: (value: FeedbackResult) => void;
}) {
    const id = useId();
    const [rating, setRating] = useState<number | null>(null);
    const [comment, setComment] = useState('');
    const [share, setShare] = useState(false);
    const [problems, setProblems] = useState<Record<string, string>>({});
    useEffect(() => { if (!open) { setRating(null); setComment(''); setShare(false); setProblems({}); } }, [open]);

    const submit = () => {
        if (!ratingRequired && rating === null && !comment.trim()) { onSubmit({ rating: 0, comment: '', shareName: false }); return; }
        const parsed = feedbackSchema.safeParse({ rating: rating ?? undefined, comment, shareName: share });
        if (!parsed.success) { setProblems(issuesByField(parsed.error)); return; }
        setProblems({});
        onSubmit(parsed.data);
    };

    return (
        <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} confirmLabel={confirmLabel} pending={pending} error={error ? mentorshipErrorMessage(error) : null} onConfirm={submit}>
            <div className="space-y-4">
                <RatingInput value={rating} onChange={setRating} error={problems.rating} label={ratingRequired ? 'Rating' : 'Rating (optional)'} />
                <div>
                    <label htmlFor={`${id}-comment`} className={labelClass}>Comment (optional)</label>
                    <textarea id={`${id}-comment`} rows={4} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={LIMITS.comment + 50} className={`${fieldClass(problems.comment)} resize-none`} aria-invalid={!!problems.comment} />
                    <p className={`mt-1 flex justify-between text-xs ${problems.comment ? 'text-red-700 dark:text-red-400' : muted}`}><span>{problems.comment ?? ''}</span><span aria-hidden="true">{comment.trim().length}/{LIMITS.comment}</span></p>
                </div>
                {offerShareName && (
                    <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" />
                        <span>Show my first name next to this review on the mentor&apos;s profile. Off by default, so reviews stay anonymous.</span>
                    </label>
                )}
            </div>
        </Modal>
    );
}

/** Report a mentorship, a message or the mentor; the report goes to the moderators */
export function ReportDialog({ open, onOpenChange, target, messageId, pending, error, onSubmit }: {
    open: boolean; onOpenChange: (open: boolean) => void; target: ReportTarget; messageId?: string;
    pending?: boolean; error?: unknown; onSubmit: (value: { target: ReportTarget; reason: string; details: string; messageId?: string }) => void;
}) {
    const id = useId();
    const [reason, setReason] = useState('');
    const [details, setDetails] = useState('');
    const [problems, setProblems] = useState<Record<string, string>>({});
    useEffect(() => { if (!open) { setReason(''); setDetails(''); setProblems({}); } }, [open]);
    const what = target === 'message' ? 'this message' : target === 'mentor' ? 'the mentor' : 'this mentorship';

    const submit = () => {
        const parsed = reportSchema.safeParse({ reason: reason || undefined, details });
        if (!parsed.success) { setProblems(issuesByField(parsed.error)); return; }
        setProblems({});
        onSubmit({ target, reason: parsed.data.reason, details: parsed.data.details, messageId });
    };

    return (
        <Modal open={open} onOpenChange={onOpenChange} title={`Report ${what}`} description="A moderator reviews the report. The other person is not told who reported." confirmLabel="Send report" destructive pending={pending} error={error ? mentorshipErrorMessage(error) : null} onConfirm={submit}>
            <fieldset>
                <legend className={labelClass}>Reason</legend>
                <div className="space-y-2">
                    {REPORT_REASONS.map((r) => (
                        <label key={r.value} className="flex cursor-pointer items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
                            <input type="radio" name={`${id}-reason`} value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="h-4 w-4 accent-orange-600" /> {r.label}
                        </label>
                    ))}
                </div>
                {problems.reason && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{problems.reason}</p>}
            </fieldset>
            <div className="mt-4">
                <label htmlFor={`${id}-details`} className={labelClass}>Details (optional)</label>
                <textarea id={`${id}-details`} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={LIMITS.reportDetails + 50} className={`${fieldClass(problems.details)} resize-none`} />
                <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{details.trim().length}/{LIMITS.reportDetails}</p>
                {problems.details && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{problems.details}</p>}
            </div>
        </Modal>
    );
}

