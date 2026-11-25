'use client';

import { CohortDetailView, CohortMissing } from '@/components/internships/CohortDetailView';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isCohortId } from '@/lib/internships/id';

/**
 * What a program page shows when the server found no public program. The answer is a real 404 for
 * search engines and anonymous visitors. A draft is still readable by staff, so the browser asks again
 * with the viewer's own token; a visitor gets the "not available" page.
 */
export default function NotFound() {
    const id = useRouteSegment('id');
    return isCohortId(id) ? <CohortDetailView id={id} initialCohort={null} /> : <CohortMissing />;
}
