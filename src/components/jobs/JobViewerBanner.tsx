'use client';

import Link from 'next/link';
import { Eye, MousePointerClick, Pencil, ShieldAlert } from 'lucide-react';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { btnSecondary, card } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useJob } from '@/hooks/queries/useJobs';
import { countText, effectiveStatus } from '@/lib/jobs/display';
import { isJobAdmin, isJobReviewer } from '@/lib/jobs/roles';
import type { Job, JobPoster } from '@/types/job';
import { JobStatusChip } from './StatusChips';

const posterName = (poster: Job['postedBy']): string | null => {
    if (!poster || typeof poster === 'string') return null;
    const p = poster as JobPoster;
    return p.name || p.username || null;
};

/**
 * What only the poster and the reviewers are told about a job: its status, the reviewer's reason,
 * when it ends, the counters, and for a reviewer the open reports. A visitor, and a member who is
 * neither, see nothing here (the API does not send these fields to them).
 */
export function JobViewerBanner({ jobRef, initialJob, initialUpdatedAt }: { jobRef: string; initialJob: Job; initialUpdatedAt?: number }) {
    const { user } = useAuth();
    const query = useJob(jobRef, initialJob, initialUpdatedAt);
    const job = query.data ?? initialJob;
    if (!job.status || query.isPlaceholderData) return null;

    const status = effectiveStatus(job);
    const reviewer = isJobReviewer(user?.role);
    const owner = !!job.viewer?.isOwner;
    const reason = job.moderation?.reason?.trim();

    return (
        <section className={`${card} mb-6 border-l-4 border-l-orange-600 p-4 sm:p-5`} aria-label="About this posting" data-testid="viewer-banner">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <JobStatusChip status={status} audience={owner ? 'poster' : 'reviewer'} />
                    <span className="text-sm text-gray-800 dark:text-gray-200">
                        {status === 'approved' && <>Public until <ViewerTime iso={job.expiresAt} />.</>}
                        {status === 'pending' && (job.heldForReports ? 'Held after reports: a reviewer is deciding.' : 'Waiting for a reviewer. Only you and the reviewers can see it until then.')}
                        {status === 'draft' && 'Not sent for review yet. Only you can see it.'}
                        {status === 'rejected' && 'A reviewer did not approve it. Only you and the reviewers can see it.'}
                        {status === 'closed' && 'Closed. It is no longer public.'}
                        {status === 'expired' && <>Ended <ViewerTime iso={job.expiresAt} />. It is no longer public.</>}
                    </span>
                </div>
                {(owner || isJobAdmin(user?.role)) && (
                    <Link href={`/employer/edit/${job._id}`} className={`${btnSecondary} !px-3 !py-2`}><Pencil className="h-4 w-4" aria-hidden="true" /> {status === 'rejected' ? 'Fix and resubmit' : 'Edit'}</Link>
                )}
            </div>
            {reason && status !== 'approved' && (
                <p className="mt-3 rounded-lg bg-gray-100 p-3 text-sm text-gray-900 dark:bg-neutral-800 dark:text-gray-100" data-testid="moderation-reason">
                    <span className="font-medium">Reviewer note: </span>{reason}
                </p>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" aria-hidden="true" />{countText(job.viewCount ?? 0, 'view')}</span>
                {typeof job.applicationCount === 'number' && <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-4 w-4" aria-hidden="true" />{countText(job.applicationCount, 'apply click')}</span>}
                {reviewer && (
                    <>
                        <span className="inline-flex items-center gap-1.5"><ShieldAlert className="h-4 w-4" aria-hidden="true" />{countText(job.reportCount ?? 0, 'open report')}</span>
                        {posterName(job.postedBy) && <span>Posted by {posterName(job.postedBy)}</span>}
                    </>
                )}
            </p>
        </section>
    );
}
