'use client';

import { FullPageSpinner, NoAccess, useRequireLogin } from '@/components/events/PageShell';
import { useAuth } from '@/context/AuthContext';
import { isJobPoster, isJobReviewer } from '@/lib/jobs/roles';

/**
 * The employer area is for employers, administrators and owners. Anybody else is told where to go
 * instead (a reviewer to the queue, a member to the become-employer page). The API checks again.
 */
export function EmployerGate({ returnTo, children }: { returnTo: string; children: React.ReactNode }) {
    const { loading } = useAuth();
    const { user, ready } = useRequireLogin(returnTo);
    if (loading || !ready || !user) return <FullPageSpinner label="Loading your account" />;
    if (isJobPoster(user.role)) return <>{children}</>;
    if (isJobReviewer(user.role)) {
        return <NoAccess message="Moderators review jobs but do not post them. Open the review queue instead." href="/admin/jobs" label="Open the review queue" />;
    }
    return <NoAccess message="Posting jobs needs an employer account. You can register one with your organisation email." href="/employer/setup" label="Become an employer" />;
}
