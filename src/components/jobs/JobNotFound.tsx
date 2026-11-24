'use client';

import { useParams } from 'next/navigation';
import { pageBg } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { isJobRef } from '@/lib/jobs/server';
import { JobClientView, JobMissing } from './JobClientView';
import { DetailSkeleton } from './ListStates';

/**
 * What a job page shows when the server could not find the job for a visitor. The answer is a real
 * 404 for search engines and anonymous visitors. A job that is a draft, waiting for review, rejected,
 * closed or ended is still readable by its poster and by the reviewers, so a signed-in visitor is
 * asked again with their own token and sees the job, with its status, instead of this page.
 */
export function JobNotFound() {
    const params = useParams<{ slug?: string | string[] }>();
    const raw = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
    const { user, loading } = useAuth();
    const slug = raw && isJobRef(raw) ? raw : '';

    if (loading) return <div className={pageBg}><div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6"><DetailSkeleton /></div></div>;
    if (!user || !slug) return <JobMissing />;
    return <JobClientView slug={slug} />;
}
