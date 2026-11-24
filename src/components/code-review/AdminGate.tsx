'use client';

import { FullPageSpinner, NoAccess, useRequireLogin } from '@/components/events/PageShell';
import { isCrReader, isCrWriter } from '@/lib/codeReview/roles';

type User = NonNullable<ReturnType<typeof useRequireLogin>['user']>;

/**
 * Admins and owners write, moderators read, everybody else gets a clear no. The API refuses what a
 * role may not do whatever this page shows: the gate only decides what to draw.
 */
export function AdminGate({ returnTo, write = false, children }: { returnTo: string; write?: boolean; children: (user: User, canWrite: boolean) => React.ReactNode }) {
    const { user, ready } = useRequireLogin(returnTo);
    if (!ready || !user) return <FullPageSpinner />;
    if (!isCrReader(user.role)) return <NoAccess message="Only staff can manage code review exercises." href="/code-review" label="Back to the exercises" />;
    const canWrite = isCrWriter(user.role);
    if (write && !canWrite) {
        return <NoAccess message="Only administrators and owners can create exercises. Moderators can read the list and open an exercise to see its answers." href="/admin/code-review" label="Back to the list" />;
    }
    return <>{children(user, canWrite)}</>;
}
