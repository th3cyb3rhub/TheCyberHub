import { Suspense } from 'react';
import StructuredData from '@/components/StructuredData';
import { fetchPublicList, listJsonLd } from '@/lib/learning/server';
import type { PathKind } from '@/types/learning';
import { LearningCatalog } from './LearningCatalog';
import { CardGridSkeleton } from './shared';
import { pageBg } from '@/components/events/styles';

export function CatalogLoading() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6"><CardGridSkeleton label="Loading" /></div>
        </div>
    );
}

export async function CatalogPage({ kind }: { kind: PathKind }) {
    const cards = await fetchPublicList(kind);
    const route = kind === 'roadmap' ? 'roadmaps' : 'learning-paths';
    return (
        <>
            {cards.length > 0 && <StructuredData data={JSON.parse(JSON.stringify(listJsonLd(kind === 'roadmap' ? 'Roadmaps' : 'Learning paths', route, cards)))} />}
            <Suspense fallback={<CatalogLoading />}>
                <LearningCatalog kind={kind} />
            </Suspense>
        </>
    );
}
