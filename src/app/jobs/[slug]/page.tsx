import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import StructuredData from '@/components/StructuredData';
import { JobActions, SidebarApply } from '@/components/jobs/JobActions';
import { JobClientView } from '@/components/jobs/JobClientView';
import { JobDetailContent } from '@/components/jobs/JobDetailContent';
import { JobViewerBanner } from '@/components/jobs/JobViewerBanner';
import { jobMoveTarget, jobReference } from '@/lib/jobs/canonical';
import { jobMetadata, jobPostingJsonLd } from '@/lib/jobs/metadata';
import { fetchPublicJob } from '@/lib/jobs/server';

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    // The same request as the page below: `fetchPublicJob` is cached per render.
    // A job that is not public or an unknown reference stays out of search results; a failing API says nothing about indexing.
    const result = await fetchPublicJob(slug);
    return jobMetadata(result.state === 'ok' ? result.job : null, result.state === 'error');
}

export default async function JobPage({ params }: PageProps) {
    const { slug } = await params;
    const result = await fetchPublicJob(slug);

    // A reference that cannot be a job, or a job a visitor may not see, is a real 404. Its poster and
    // the reviewers can still read it: `not-found.tsx` asks again in the browser, with their token.
    if (result.state === 'invalid' || result.state === 'missing') notFound();

    // The API was slow or failed: the browser asks again
    if (result.state === 'error') return <JobClientView slug={slug} />;

    const { job, meta, fetchedAt } = result;
    // An old address, an id or another spelling lands on the one canonical address
    // (the reference comes from the API: only a well formed one is followed, encoded, and never to the same address)
    const candidate = meta.canonicalSlug ?? job.slug;
    const moved = jobMoveTarget(slug, candidate);
    if (moved) permanentRedirect(moved);
    const canonical = jobReference(slug, candidate);

    return (
        <>
            <StructuredData data={jobPostingJsonLd(job)} />
            <JobDetailContent
                job={job}
                banner={<JobViewerBanner jobRef={canonical} initialJob={job} initialUpdatedAt={fetchedAt} />}
                actions={<JobActions jobRef={canonical} initialJob={job} initialUpdatedAt={fetchedAt} />}
                sidebarAction={<SidebarApply id={job._id} title={job.title} />}
            />
        </>
    );
}
