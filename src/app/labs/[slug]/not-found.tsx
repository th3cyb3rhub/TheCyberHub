'use client';

import { LabDetailView, LabMissing } from '@/components/labs/LabDetailView';
import { useRouteSegment } from '@/hooks/useRouteSegment';
import { isLabSlug } from '@/lib/labs/slug';

/**
 * What a lab page shows when the server found no public lab. The answer is a real 404 for search
 * engines and anonymous visitors. A draft or an archived lab is still readable by staff, so the
 * browser asks again with the viewer's own token; a visitor gets the "not available" page.
 */
export default function NotFound() {
    const slug = useRouteSegment('slug').toLowerCase();
    return isLabSlug(slug) ? <LabDetailView slug={slug} initialLab={null} /> : <LabMissing />;
}
