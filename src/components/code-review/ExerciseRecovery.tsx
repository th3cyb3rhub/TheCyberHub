'use client';

import type { ReactNode } from 'react';
import { useHasStoredToken } from '@/hooks/useHasStoredToken';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isSnippetRef } from '@/lib/codeReview/slug';
import { ExerciseView } from './ExerciseView';

/**
 * The not-found page of an exercise: the server's "not available" notice stays for a visitor. A viewer
 * with a token may still read a draft, so the browser asks again for that one.
 */
export function ExerciseRecovery({ missing }: { missing: ReactNode }) {
    const ref = useRouteSegment('ref').toLowerCase();
    const signedIn = useHasStoredToken();
    return signedIn && isSnippetRef(ref) ? <ExerciseView slug={ref} initialSnippet={null} /> : <>{missing}</>;
}
