import { Suspense } from 'react';
import { EventsCalendar } from '@/components/events/EventsCalendar';
import { GridSkeleton } from '@/components/events/ListStates';
import { pageBg } from '@/components/events/styles';

export default function CalendarPage() {
    return (
        <Suspense fallback={<div className={pageBg}><div className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6"><GridSkeleton count={3} /></div></div>}>
            <EventsCalendar />
        </Suspense>
    );
}
