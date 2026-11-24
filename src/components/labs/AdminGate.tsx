'use client';

import { FullPageSpinner, NoAccess, useRequireLogin } from '@/components/events/PageShell';
import { isLabStaff } from '@/lib/labs/roles';

/** Admins and owners only, like the API: moderators are not lab staff. Everybody else gets a clear no. */
export function AdminGate({ returnTo, children }: { returnTo: string; children: (user: NonNullable<ReturnType<typeof useRequireLogin>['user']>) => React.ReactNode }) {
    const { user, ready } = useRequireLogin(returnTo);
    if (!ready || !user) return <FullPageSpinner />;
    if (!isLabStaff(user.role)) return <NoAccess message="Only administrators and owners can manage labs." href="/labs" label="Back to labs" />;
    return <>{children(user)}</>;
}
