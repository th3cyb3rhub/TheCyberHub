'use client';

import type { ReactNode } from 'react';
import { useHasStoredToken } from '@/hooks/useHasStoredToken';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isJobRef } from '@/lib/jobs/server';
import { JobClientView } from './JobClientView';

/**
 * What a job page shows when the server could not find the job for a visitor. The answer is a real
 * 404 for search engines and anonymous visitors, and the server's "not available" notice stays for
 * them, with no further request. A job that is a draft, waiting for review, rejected, closed or ended
 * is still readable by its poster and by the reviewers, so a viewer with a token is asked again with it
 * and sees the job, with its status, instead of the notice.
 */
export function JobNotFound({ missing }: { missing: ReactNode }) {
    const slug = useRouteSegment('slug');
    const signedIn = useHasStoredToken();
    return signedIn && isJobRef(slug) ? <JobClientView slug={slug} /> : <>{missing}</>;
}
