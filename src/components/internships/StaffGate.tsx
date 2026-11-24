'use client';

import { FullPageSpinner, NoAccess, useRequireLogin } from '@/components/events/PageShell';
import { isModeratorRole } from '@/lib/roles';

/** Moderators, admins and owners only, like the other admin screens. Everybody else gets a clear no. */
export function StaffGate({ returnTo, children }: { returnTo: string; children: (user: NonNullable<ReturnType<typeof useRequireLogin>['user']>) => React.ReactNode }) {
    const { user, ready } = useRequireLogin(returnTo);
    if (!ready || !user) return <FullPageSpinner />;
    if (!isModeratorRole(user.role)) return <NoAccess message="Only moderators and administrators can manage internship programs." href="/internships" label="Back to internships" />;
    return <>{children(user)}</>;
}
