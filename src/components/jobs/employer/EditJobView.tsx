'use client';

import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { NoAccess, PageShell } from '@/components/events/PageShell';
import { btnSecondary, muted } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useJob, useMyCompany } from '@/hooks/queries/useJobs';
import { ApiError } from '@/lib/api';
import { isJobAdmin } from '@/lib/jobs/roles';
import { DetailSkeleton, ErrorState } from '../ListStates';
import { JobStatusChip } from '../StatusChips';
import { JobForm } from './JobForm';

/** Edit one job. The API answers 404 for a job that is not yours, and the page says the same. */
export function EditJobView() {
    const params = useParams<{ id: string }>();
    const id = typeof params?.id === 'string' ? params.id : '';
    const { user } = useAuth();
    const admin = isJobAdmin(user?.role);
    const query = useJob(id);
    const company = useMyCompany(!admin);
    // The form keeps what was typed when the job is read again (focus, a reviewer's decision): it is only
    // rebuilt when the person asks, so a refetch never throws their edits away
    const [version, setVersion] = useState(0);
    const openedAt = useRef<string | undefined>(undefined);
    if (openedAt.current === undefined && query.data?.updatedAt) openedAt.current = query.data.updatedAt;

    if (query.isLoading) return <PageShell title="Edit job" backHref="/employer" backLabel="Back to the dashboard"><DetailSkeleton /></PageShell>;
    if (query.isError) {
        const gone = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
        if (gone) return <NoAccess message="This job does not exist, or it is not yours to edit." href="/employer" label="Back to the dashboard" />;
        return <PageShell title="Edit job" backHref="/employer" backLabel="Back to the dashboard"><ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this job" /></PageShell>;
    }
    const job = query.data;
    if (!job) return <NoAccess message="This job does not exist, or it is not yours to edit." href="/employer" label="Back to the dashboard" />;
    if (!admin && job.viewer && !job.viewer.isOwner) return <NoAccess message="This job belongs to somebody else." href="/employer" label="Back to the dashboard" />;

    const changed = !!openedAt.current && !!job.updatedAt && job.updatedAt !== openedAt.current;
    const reload = () => { openedAt.current = job.updatedAt; setVersion((v) => v + 1); };

    return (
        <PageShell
            title="Edit job"
            subtitle={job.title}
            backHref="/employer"
            backLabel="Back to the dashboard"
            actions={job.status ? <JobStatusChip status={job.status} /> : undefined}
        >
            {changed && (
                <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="job-changed">
                    <p>This job was changed since you opened it (a reviewer may have decided, or you saved it somewhere else). What you typed is kept. Reload to see the current version: that drops your unsaved edits.</p>
                    <button type="button" className={`${btnSecondary} !px-3 !py-1.5 !text-xs ${muted}`} onClick={reload} data-testid="reload-job">Reload the job</button>
                </div>
            )}
            <JobForm key={`${job._id}-${version}`} job={job} admin={admin} accountEmail={user?.email} companyName={company.data?.name} />
        </PageShell>
    );
}
