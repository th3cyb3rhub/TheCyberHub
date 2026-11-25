'use client';

import { ResultsMissing, ResultsView } from '@/components/ctf/ResultsView';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isCtfSlug } from '@/lib/ctf/slug';

/**
 * What the results page shows when the server found no public results. The answer is a real 404 for
 * search engines and anonymous visitors. The results of a draft are still readable by staff, so the
 * browser asks again with the viewer's own token; a visitor gets the "not available" page.
 */
export default function NotFound() {
    const slug = useRouteSegment('slug').toLowerCase();
    return isCtfSlug(slug) ? <ResultsView slug={slug} initialResults={null} /> : <ResultsMissing />;
}
