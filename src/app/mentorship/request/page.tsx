import { Suspense } from 'react';
import { RequestMentorView } from '@/components/mentorship/RequestScreens';
import { FullPageSpinner } from '@/components/events/PageShell';

export default function Page() {
    return <Suspense fallback={<FullPageSpinner />}><RequestMentorView /></Suspense>;
}
