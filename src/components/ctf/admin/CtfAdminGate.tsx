'use client';

import { FullPageSpinner, NoAccess, useRequireLogin } from '@/components/events/PageShell';
import { isCtfReader, isCtfWriter } from '@/lib/ctf/roles';

type User = NonNullable<ReturnType<typeof useRequireLogin>['user']>;

/**
 * Admins, owners and moderators may read the competitions (drafts and private ones too); only admins and
 * owners write, like the API. A page that writes asks for `write`: a moderator gets a clear no there,
 * the list gives them a read-only view. Everybody else is sent away.
 */
export function CtfAdminGate({ returnTo, write = false, children }: {
    returnTo: string;
    write?: boolean;
    children: (user: User, canWrite: boolean) => React.ReactNode;
}) {
    const { user, ready } = useRequireLogin(returnTo);
    if (!ready || !user) return <FullPageSpinner />;
    if (!isCtfReader(user.role)) {
        return <NoAccess message="Only administrators, owners and moderators can open the competition manager." href="/ctf/competitions" label="Back to competitions" />;
    }
    const canWrite = isCtfWriter(user.role);
    if (write && !canWrite) {
        return <NoAccess message="Only administrators and owners can create or change competitions. Moderators can read them." href="/admin/ctf" label="Back to the list" />;
    }
    return <>{children(user, canWrite)}</>;
}
