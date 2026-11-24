'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Flag, Pencil } from 'lucide-react';
import { btnSecondary, focusRing } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useJob } from '@/hooks/queries/useJobs';
import { isJobAdmin } from '@/lib/jobs/roles';
import type { Job } from '@/types/job';
import { ApplyPanel } from './ApplyPanel';
import { ReportJobDialog } from './ReportJobDialog';
import { SaveJobButton } from './SaveJobButton';
import { ShareButton } from './ShareButton';

interface Props {
    /** The reference the page was opened with: an id or a slug */
    jobRef: string;
    /** The copy rendered on the server, or the one the browser fetched for a poster's own preview */
    initialJob: Job;
    initialUpdatedAt?: number;
    /** A job that is not public: nothing to apply to, save or report, only the poster's tools */
    preview?: boolean;
}

/**
 * The interactive part of a job page: apply, save, share, report. The page around it is rendered on
 * the server; this island asks again with the member's token, so the saved state and who owns the
 * job are the signed-in member's own. Until that answer is here the save button waits.
 */
export function JobActions({ jobRef, initialJob, initialUpdatedAt, preview = false }: Props) {
    const { user } = useAuth();
    const query = useJob(jobRef, initialJob, initialUpdatedAt);
    const job = query.data ?? initialJob;
    const known = !!job.viewer && !query.isPlaceholderData;
    const owner = !!job.viewer?.isOwner;
    const canEdit = owner || isJobAdmin(user?.role);
    const [reporting, setReporting] = useState(false);

    return (
        <div className="flex flex-wrap items-start gap-3" data-testid="job-actions">
            {!preview && <ApplyPanel id={job._id} title={job.title} />}
            {!preview && (user ? (
                <SaveJobButton id={job._id} title={job.title} saved={!!job.viewer?.saved} pending={!known} />
            ) : (
                <SaveJobButton id={job._id} title={job.title} saved={false} />
            ))}
            {!preview && <ShareButton title={job.title} company={job.company} slug={job.slug} />}
            {canEdit && (
                <Link href={`/employer/edit/${job._id}`} className={btnSecondary}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</Link>
            )}
            {!preview && user && !owner && (
                <>
                    <button type="button" onClick={() => setReporting(true)} data-testid="report-job"
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 hover:text-red-800 dark:text-gray-300 dark:hover:bg-neutral-800 dark:hover:text-red-300 ${focusRing}`}>
                        <Flag className="h-4 w-4" aria-hidden="true" /> Report<span className="sr-only"> {job.title}</span>
                    </button>
                    <ReportJobDialog open={reporting} onOpenChange={setReporting} job={job} />
                </>
            )}
        </div>
    );
}

/** The apply call to action of the sidebar: the same flow, as a wide button */
export function SidebarApply({ id, title }: { id: string; title: string }) {
    return <ApplyPanel id={id} title={title} variant="block" />;
}
