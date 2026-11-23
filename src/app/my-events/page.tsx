import { Suspense } from 'react';
import { MyEventsView } from '@/components/events/MyEventsView';
import { FullPageSpinner } from '@/components/events/PageShell';

export default function MyEventsPage() {
    return (
        <Suspense fallback={<FullPageSpinner />}>
            <MyEventsView />
        </Suspense>
    );
}
