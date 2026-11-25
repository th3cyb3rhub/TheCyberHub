'use client';

import type { ReactNode } from 'react';
import { useHasStoredToken } from '@/hooks/useHasStoredToken';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isLabSlug } from '@/lib/labs/slug';
import { LabDetailView } from './LabDetailView';

/**
 * The not-found page of a lab: the server's "not available" notice stays for a visitor. A viewer with
 * a token may still read a draft or an archived lab, so the browser asks again for that one.
 */
export function LabRecovery({ missing }: { missing: ReactNode }) {
    const slug = useRouteSegment('slug').toLowerCase();
    const signedIn = useHasStoredToken();
    return signedIn && isLabSlug(slug) ? <LabDetailView slug={slug} initialLab={null} /> : <>{missing}</>;
}
