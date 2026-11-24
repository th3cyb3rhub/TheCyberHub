import { Suspense } from 'react';
import { CardGridSkeleton } from '@/components/learning/shared';
import { ResourceExplorer } from '@/components/resources/ResourceExplorer';
import { pageBg } from '@/components/events/styles';

export default function ResourcesPage() {
    return (
        <Suspense fallback={<div className={pageBg}><div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6"><CardGridSkeleton /></div></div>}>
            <ResourceExplorer />
        </Suspense>
    );
}
