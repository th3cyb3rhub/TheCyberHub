import { Suspense } from 'react';
import { GridSkeleton } from '@/components/internships/ListStates';
import { InternshipsExplorer } from '@/components/internships/InternshipsExplorer';
import { pageBg } from '@/components/events/styles';

export default function InternshipsPage() {
    return (
        <Suspense
            fallback={(
                <div className={pageBg}>
                    <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6"><GridSkeleton /></div>
                </div>
            )}
        >
            <InternshipsExplorer />
        </Suspense>
    );
}
