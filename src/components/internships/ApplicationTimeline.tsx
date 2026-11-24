'use client';

import { muted } from '@/components/events/styles';
import { APPLICATION_STATUS_HINTS } from '@/lib/internships/display';
import { progressSteps, timelineItems } from '@/lib/internships/review';
import type { ApplicationStatus, HistoryEntry, StaffHistoryEntry } from '@/types/internship';
import { ApplicationStatusBadge } from './StatusBadges';
import { ViewerTime } from './ViewerTime';
import { CheckCircle2, Circle } from 'lucide-react';

/** Sent, in review, decision: where an application stands. A withdrawn one has no bar. */
export function ApplicationProgress({ status }: { status: ApplicationStatus }) {
    if (status === 'withdrawn') return null;
    const steps = progressSteps(status);
    return (
        <ol className="flex items-center" aria-label="Application progress" data-testid="application-progress">
            {steps.map((step, i) => (
                <li key={step.key} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`} aria-current={step.state === 'current' ? 'step' : undefined} data-state={step.state}>
                    <span className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${step.state === 'upcoming'
                            ? 'border-gray-300 text-gray-500 dark:border-neutral-700'
                            : status === 'rejected' && step.key === 'decision'
                                ? 'border-red-700 bg-red-100 text-red-900 dark:border-red-500 dark:bg-red-500/15 dark:text-red-300'
                                : 'border-green-700 bg-green-100 text-green-900 dark:border-green-500 dark:bg-green-500/15 dark:text-green-300'}`}>
                            {step.state === 'upcoming' ? <Circle className="h-3 w-3" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                        </span>
                        <span className={`text-sm ${step.state === 'upcoming' ? muted : 'font-medium text-gray-900 dark:text-white'}`}>
                            {step.label}
                            <span className="sr-only">{step.state === 'done' ? ' (done)' : step.state === 'current' ? ' (current step)' : ' (not reached yet)'}</span>
                        </span>
                    </span>
                    {i < steps.length - 1 && <span className={`mx-2 h-0.5 flex-1 ${step.state === 'done' ? 'bg-green-700 dark:bg-green-500' : 'bg-gray-300 dark:bg-neutral-700'}`} aria-hidden="true" />}
                </li>
            ))}
        </ol>
    );
}

/**
 * The status history, oldest first. Notes are plain text: a reviewer's note to the applicant, or
 * the applicant's own reason for withdrawing.
 */
export function ApplicationTimeline({ history, status, staff = false }: {
    history: (HistoryEntry | StaffHistoryEntry)[];
    status: ApplicationStatus;
    /** Staff see who made each move; the applicant never does */
    staff?: boolean;
}) {
    const items = timelineItems(history, status);
    if (items.length === 0) return <p className={`text-sm ${muted}`}>No history yet.</p>;
    return (
        <ol className="space-y-4" aria-label="Status timeline" data-testid="status-timeline">
            {items.map((item, i) => {
                const entry = history[i] as StaffHistoryEntry;
                return (
                    <li key={`${item.status}-${item.at}-${i}`} className="relative pl-6" aria-current={item.current ? 'step' : undefined} data-current={item.current ? 'true' : 'false'}>
                        <span className={`absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 ${item.current ? 'border-orange-700 bg-orange-700 dark:border-orange-400 dark:bg-orange-400' : 'border-gray-400 bg-white dark:border-neutral-600 dark:bg-neutral-900'}`} aria-hidden="true" />
                        {i < items.length - 1 && <span className="absolute left-[5px] top-5 h-[calc(100%+0.5rem)] w-0.5 bg-gray-300 dark:bg-neutral-700" aria-hidden="true" />}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <ApplicationStatusBadge status={item.status} />
                            <ViewerTime iso={item.at} kind="stamp" className={`text-sm ${muted}`} />
                            {staff && entry.actor && <span className={`text-xs ${muted}`}>{entry.actor === 'staff' ? 'by a reviewer' : 'by the applicant'}</span>}
                        </div>
                        {item.current && !staff && <p className={`mt-1 text-sm ${muted}`}>{APPLICATION_STATUS_HINTS[item.status]}</p>}
                        {item.note && (
                            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 dark:bg-neutral-800 dark:text-gray-100" data-testid="timeline-note">
                                <span className="block text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
                                    {staff ? (entry.actor === 'staff' ? 'Note to the applicant' : 'Reason') : item.noteBy === 'you' ? 'Your reason' : 'Reviewer note'}
                                </span>
                                {item.note}
                            </p>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
