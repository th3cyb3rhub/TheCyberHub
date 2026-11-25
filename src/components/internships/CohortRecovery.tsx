'use client';

import type { ReactNode } from 'react';
import { useHasStoredToken } from '@/hooks/useHasStoredToken';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isCohortId } from '@/lib/internships/id';
import { CohortDetailView } from './CohortDetailView';

/**
 * The not-found page of a program: the server's "not available" notice stays for a visitor. A viewer
 * with a token may still read a draft, so the browser asks again for that one.
 */
export function CohortRecovery({ missing }: { missing: ReactNode }) {
    const id = useRouteSegment('id');
    const signedIn = useHasStoredToken();
    return signedIn && isCohortId(id) ? <CohortDetailView id={id} initialCohort={null} /> : <>{missing}</>;
}
