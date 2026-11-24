import { Suspense } from 'react';
import { RequestsView } from '@/components/mentorship/RequestScreens';
import { FullPageSpinner } from '@/components/events/PageShell';

export default function Page() {
    return <Suspense fallback={<FullPageSpinner />}><RequestsView /></Suspense>;
}
