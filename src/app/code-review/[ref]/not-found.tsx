'use client';

import { ExerciseMissing, ExerciseView } from '@/components/code-review/ExerciseView';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isSnippetRef } from '@/lib/codeReview/slug';

/**
 * What an exercise page shows when the server found no public exercise. The answer is a real 404 for
 * search engines and anonymous visitors. A draft is still readable by staff, so the browser asks again
 * with the viewer's own token; a visitor gets the "not available" page.
 */
export default function NotFound() {
    const ref = useRouteSegment('ref').toLowerCase();
    return isSnippetRef(ref) ? <ExerciseView slug={ref} initialSnippet={null} /> : <ExerciseMissing />;
}
