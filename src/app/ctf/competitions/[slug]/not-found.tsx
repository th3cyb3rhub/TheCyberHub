'use client';

import { CompetitionMissing, CompetitionView } from '@/components/ctf/CompetitionView';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isCtfSlug } from '@/lib/ctf/slug';

/**
 * What a competition page shows when the server found no public competition. The answer is a real
 * 404 for search engines and anonymous visitors. A draft is still readable by staff, so the browser
 * asks again with the viewer's own token; a visitor gets the "not available" page.
 */
export default function NotFound() {
    const slug = useRouteSegment('slug').toLowerCase();
    return isCtfSlug(slug) ? <CompetitionView slug={slug} initialCompetition={null} /> : <CompetitionMissing />;
}
