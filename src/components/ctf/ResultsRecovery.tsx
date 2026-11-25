'use client';

import type { ReactNode } from 'react';
import { useHasStoredToken } from '@/hooks/useHasStoredToken';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isCtfSlug } from '@/lib/ctf/slug';
import { ResultsView } from './ResultsView';

/**
 * The not-found page of the results: the server's "not available" notice stays for a visitor. A viewer
 * with a token may still read the results of a draft, so the browser asks again for those.
 */
export function ResultsRecovery({ missing }: { missing: ReactNode }) {
    const slug = useRouteSegment('slug').toLowerCase();
    const signedIn = useHasStoredToken();
    return signedIn && isCtfSlug(slug) ? <ResultsView slug={slug} initialResults={null} /> : <>{missing}</>;
}
