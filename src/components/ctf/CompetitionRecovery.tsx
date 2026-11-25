'use client';

import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useHasStoredToken } from '@/hooks/useHasStoredToken';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isCtfSlug } from '@/lib/ctf/slug';
import { CompetitionView } from './CompetitionView';

/**
 * The not-found page of a competition: the server's "not available" notice stays for a visitor. A viewer
 * with a token may still read a draft, so the browser asks again for that one, on the tab the address names.
 */
export function CompetitionRecovery({ missing }: { missing: ReactNode }) {
    const slug = useRouteSegment('slug').toLowerCase();
    const signedIn = useHasStoredToken();
    const tab = useSearchParams().get('tab') ?? undefined;
    return signedIn && isCtfSlug(slug) ? <CompetitionView slug={slug} initialCompetition={null} initialTab={tab} /> : <>{missing}</>;
}
