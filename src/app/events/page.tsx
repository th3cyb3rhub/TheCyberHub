import { Suspense } from 'react';
import { EventsExplorer } from '@/components/events/EventsExplorer';
import { GridSkeleton } from '@/components/events/ListStates';
import { pageBg } from '@/components/events/styles';

export default function EventsPage() {
    return (
        <Suspense
            fallback={(
                <div className={pageBg}>
                    <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6"><GridSkeleton /></div>
                </div>
            )}
        >
            <EventsExplorer />
        </Suspense>
    );
}
