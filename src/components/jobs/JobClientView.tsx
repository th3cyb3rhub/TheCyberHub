'use client';

import { pageBg } from '@/components/events/styles';
import { MissingPage } from '@/components/ui/MissingNotice';
import { useJob } from '@/hooks/queries/useJobs';
import { ApiError } from '@/lib/api';
import { JobActions, SidebarApply } from './JobActions';
import { JobDetailContent } from './JobDetailContent';
import { JobViewerBanner } from './JobViewerBanner';
import { DetailSkeleton, ErrorState } from './ListStates';

export function JobMissing() {
    return <MissingPage kind="job" />;
}

/**
 * A job page drawn in the browser. The server renders the page when it can; this takes over when it
 * could not (the API was slow), and for a job that is not public, which only its poster and the
 * reviewers can read, so it needs their token. The same page, asked for again.
 */
export function JobClientView({ slug }: { slug: string }) {
    // This page is drawn in the browser, so this read is also the one that counts the view
    const query = useJob(slug, undefined, undefined, true, { pageView: true });
    if (query.isLoading || query.isPending) {
        return <div className={pageBg}><div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6"><DetailSkeleton /></div></div>;
    }
    const job = query.data;
    if (!job) {
        if (query.error instanceof ApiError && query.error.status === 404) return <JobMissing />;
        return (
            <div className={pageBg}>
                <div className="mx-auto max-w-2xl px-4 pb-16 pt-28 sm:px-6">
                    <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this job" />
                </div>
            </div>
        );
    }
    const hidden = job.status !== undefined && job.status !== 'approved';
    return (
        <JobDetailContent
            job={job}
            banner={<JobViewerBanner jobRef={slug} initialJob={job} />}
            actions={<JobActions jobRef={slug} initialJob={job} preview={hidden} />}
            sidebarAction={hidden ? undefined : <SidebarApply id={job._id} title={job.title} />}
        />
    );
}
