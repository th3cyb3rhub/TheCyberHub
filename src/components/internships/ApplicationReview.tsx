'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useId, useState } from 'react';
import { Loader2, Mail, ShieldAlert, X } from 'lucide-react';
import { btnDanger, btnGhost, btnPrimary, btnSecondary, focusRing, input, label as labelClass, muted } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useChangeApplicationStatus, useInternship, useStaffApplication } from '@/hooks/queries/useInternships';
import { LIMITS } from '@/lib/internships/application';
import { APPLICATION_STATUS_LABELS } from '@/lib/internships/display';
import { internshipErrorMessage } from '@/lib/internships/errors';
import { cohortIsFull, confirmCopy, isFinal, reviewActions, type ReviewAction } from '@/lib/internships/review';
import type { ApplicationStatus, StaffApplicationRow } from '@/types/internship';
import { ApplicationTimeline } from './ApplicationTimeline';
import { ErrorState } from './ListStates';
import { SubmittedDetails } from './SubmittedDetails';
import { ApplicationStatusBadge } from './StatusBadges';
import { ViewerTime } from './ViewerTime';

const toneClass: Record<ReviewAction['tone'], string> = { primary: btnPrimary, danger: btnDanger, neutral: btnSecondary };

/** The buttons of the moves the status machine allows, and the note + confirmation before one is made */
function ReviewPanel({ applicationId, cohortId, status, own }: { applicationId: string; cohortId: string; status: ApplicationStatus; own: boolean }) {
    const { addToast } = useToast();
    const cohort = useInternship(cohortId);
    const change = useChangeApplicationStatus();
    const [pending, setPending] = useState<ApplicationStatus | null>(null);
    const [note, setNote] = useState('');
    const [error, setError] = useState<string | null>(null);
    const noteId = useId();

    const actions = reviewActions({ status, own, cohortFull: cohortIsFull(cohort.data) });

    // A move picked for one status does not survive the status changing under it
    useEffect(() => { setPending(null); setNote(''); }, [status]);

    if (actions.length === 0) {
        // The reason the last move failed stays readable when the refreshed status turns the panel final
        // (somebody else decided first): the screen changing under the reviewer must not hide why
        return (
            <div className="space-y-3">
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="review-error">{error}</p>}
                <p className={`rounded-xl bg-gray-100 px-4 py-3 text-sm dark:bg-neutral-800 ${muted}`} data-testid="review-final">
                    {status === 'withdrawn' ? 'The applicant withdrew this application, so it cannot be reviewed.' : `This application is ${APPLICATION_STATUS_LABELS[status].toLowerCase()}. A decision cannot be changed.`}
                </p>
            </div>
        );
    }

    const copy = pending ? confirmCopy(pending) : null;
    const confirm = () => {
        if (!pending) return;
        setError(null);
        const to = pending;
        change.mutate({ id: applicationId, cohortId, status: to, note }, {
            onSuccess: () => {
                setPending(null);
                setNote('');
                addToast({ variant: 'success', message: `Application moved to ${APPLICATION_STATUS_LABELS[to].toLowerCase()}. The applicant was notified.` });
            },
            onError: (err) => { setError(internshipErrorMessage(err)); setPending(null); },
        });
    };

    return (
        <div className="space-y-3" data-testid="review-panel">
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="review-error">{error}</p>}
            {own && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" data-testid="self-review">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {actions[0]?.reason}
                </p>
            )}
            {!pending && (
                <ul className="space-y-2">
                    {actions.map((a) => (
                        <li key={a.to} className="flex flex-wrap items-center gap-3">
                            <button type="button" className={toneClass[a.tone]} disabled={!a.enabled} onClick={() => { setError(null); setPending(a.to); }} aria-describedby={!a.enabled && a.reason && !own ? `reason-${a.to}` : undefined} data-action={a.to}>
                                {a.label}
                            </button>
                            {!a.enabled && a.reason && !own && <span id={`reason-${a.to}`} className={`text-xs ${muted}`}>{a.reason}</span>}
                        </li>
                    ))}
                </ul>
            )}
            {pending && copy && (
                <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-neutral-700" role="group" aria-labelledby={`${noteId}-title`} data-testid="review-confirm">
                    <p id={`${noteId}-title`} className="font-medium text-gray-900 dark:text-white">{copy.title}</p>
                    <p className={`text-sm ${muted}`}>{copy.body}</p>
                    <div>
                        <label htmlFor={noteId} className={labelClass}>Note to the applicant (optional)</label>
                        <textarea id={noteId} rows={3} value={note} maxLength={LIMITS.note} onChange={(e) => setNote(e.target.value)} className={input} />
                        <p className={`mt-1 text-xs ${muted}`}>The applicant sees this note in their timeline and in the email. {note.length}/{LIMITS.note}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={pending === 'rejected' ? btnDanger : btnPrimary} onClick={confirm} disabled={change.isPending} data-testid="review-confirm-button">
                            {change.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {copy.button}
                        </button>
                        <button type="button" className={btnGhost} onClick={() => setPending(null)} disabled={change.isPending}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}

/** One application in full, with the review controls. A side sheet, closed with Escape or the button. */
export function ApplicationDrawer({ row, cohortId, onClose }: { row: StaffApplicationRow | null; cohortId: string; onClose: () => void }) {
    const { user } = useAuth();
    const query = useStaffApplication(row?._id ?? null);
    const application = query.data;
    const applicant = application?.user ?? row?.user ?? null;
    const own = !!user && !!applicant && applicant._id === user.id;
    const status = application?.status ?? row?.status;

    return (
        <Dialog.Root open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 sm:p-6" data-testid="application-drawer">
                    <Dialog.Close asChild>
                        <button type="button" aria-label="Close" className={`absolute right-4 top-4 rounded p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${focusRing}`}><X className="h-5 w-5" aria-hidden="true" /></button>
                    </Dialog.Close>
                    <Dialog.Title className="pr-8 text-xl font-semibold text-gray-900 dark:text-white">{applicant?.name ?? 'Application'}</Dialog.Title>
                    <Dialog.Description className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${muted}`}>
                        {applicant && <span>@{applicant.username}</span>}
                        {applicant?.email && <span className="inline-flex items-center gap-1 break-all"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{applicant.email}</span>}
                    </Dialog.Description>

                    {row && (
                        <div className="mt-5 space-y-6">
                            <div className="flex flex-wrap items-center gap-3">
                                {status && <ApplicationStatusBadge status={status} />}
                                <span className={`text-sm ${muted}`}>Applied <ViewerTime iso={row.appliedAt} kind="stamp" /></span>
                            </div>

                            {status && (
                                <section aria-labelledby="review-heading">
                                    <h3 id="review-heading" className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Review</h3>
                                    {status && isFinal(status) && status !== 'withdrawn' && application?.reviewedBy && typeof application.reviewedBy === 'object' && (
                                        <p className={`mb-2 text-sm ${muted}`}>Decided by {application.reviewedBy.name}{application.reviewedAt ? <> on <ViewerTime iso={application.reviewedAt} kind="stamp" /></> : null}.</p>
                                    )}
                                    <ReviewPanel applicationId={row._id} cohortId={cohortId} status={status} own={own} />
                                </section>
                            )}

                            {query.isLoading ? (
                                <div role="status" aria-label="Loading application" className="space-y-3"><div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" /><div className="h-24 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" /></div>
                            ) : query.isError ? (
                                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this application" />
                            ) : application ? (
                                <>
                                    <section aria-labelledby="sent-heading">
                                        <h3 id="sent-heading" className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">What they sent</h3>
                                        <SubmittedDetails application={{ ...application, resumeUrl: application.resumeUrl ?? row.resumeUrl }} />
                                    </section>
                                    <section aria-labelledby="history-heading">
                                        <h3 id="history-heading" className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">History</h3>
                                        <ApplicationTimeline history={application.statusHistory} status={application.status} staff />
                                    </section>
                                </>
                            ) : null}
                        </div>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
