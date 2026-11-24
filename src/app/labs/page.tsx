import { Suspense } from 'react';
import { pageBg, pageWrap } from '@/components/events/styles';
import { LabsExplorer } from '@/components/labs/LabsExplorer';
import { LabsHero } from '@/components/labs/LabsHero';
import { ServerLabList } from '@/components/labs/ServerLabList';
import { fetchLabFacets, fetchLabsPage } from '@/lib/labs/server';

// The plain list is the same for every visitor: rebuilt at most every five minutes
export const revalidate = 300;

export default async function LabsPage() {
    // Fail-soft: a slow or failing API gives null, and the browser asks again
    const [page, facets] = await Promise.all([fetchLabsPage(12), fetchLabFacets()]);
    return (
        <div className={pageBg}>
            <div className={pageWrap}>
                <LabsHero />
                <Suspense fallback={<ServerLabList labs={page ? page.data : null} />}>
                    <LabsExplorer initialPage={page} initialFacets={facets} />
                </Suspense>
            </div>
        </div>
    );
}
