'use client';

import { useParams } from 'next/navigation';
import { NoAccess, PageShell } from '@/components/events/PageShell';
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

    if (query.isLoading) return <PageShell title="Edit job" backHref="/employer" backLabel="Back to the dashboard"><DetailSkeleton /></PageShell>;
    if (query.isError) {
        const gone = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
        if (gone) return <NoAccess message="This job does not exist, or it is not yours to edit." href="/employer" label="Back to the dashboard" />;
        return <PageShell title="Edit job" backHref="/employer" backLabel="Back to the dashboard"><ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this job" /></PageShell>;
    }
    const job = query.data;
    if (!job) return <NoAccess message="This job does not exist, or it is not yours to edit." href="/employer" label="Back to the dashboard" />;
    if (!admin && job.viewer && !job.viewer.isOwner) return <NoAccess message="This job belongs to somebody else." href="/employer" label="Back to the dashboard" />;

    return (
        <PageShell
            title="Edit job"
            subtitle={job.title}
            backHref="/employer"
            backLabel="Back to the dashboard"
            actions={job.status ? <JobStatusChip status={job.status} /> : undefined}
        >
            <JobForm key={`${job._id}-${job.updatedAt ?? ''}`} job={job} admin={admin} accountEmail={user?.email} companyName={company.data?.name} />
        </PageShell>
    );
}
