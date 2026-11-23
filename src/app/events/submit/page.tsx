'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { EventForm } from '@/components/events/EventForm';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { btnPrimary, btnSecondary, cardPad, muted, pageBg } from '@/components/events/styles';
import { isAdminRole } from '@/lib/events/roles';
import type { EventDetail } from '@/types/event';

export default function SubmitEventPage() {
    const { user, ready } = useRequireLogin('/events/submit');
    const [created, setCreated] = useState<EventDetail | null>(null);

    if (!ready || !user) return <FullPageSpinner />;
    const admin = isAdminRole(user.role);

    if (created) {
        const pending = created.status === 'pending';
        return (
            <div className={pageBg}>
                <div className="mx-auto max-w-xl px-4 pb-16 pt-28 sm:px-6">
                    <div className={`${cardPad} text-center`} role="status" data-testid="submitted">
                        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-700 dark:text-green-400" aria-hidden="true" />
                        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{pending ? 'Submitted for review' : 'Event published'}</h1>
                        <p className={`mb-6 text-sm ${muted}`}>
                            {pending
                                ? 'A moderator will review it, usually within 48 hours. You will get a notification when there is a decision, and you can follow its status in My events.'
                                : 'It is live on the events page.'}
                        </p>
                        <div className="flex flex-wrap justify-center gap-3">
                            <Link href={pending ? '/my-events?tab=submitted' : `/events/${created.slug}`} className={btnPrimary}>{pending ? 'See my submissions' : 'View the event'}</Link>
                            <Link href="/events" className={btnSecondary}>Back to events</Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <PageShell title="Host an event" subtitle="Share a CTF night, workshop, webinar or meetup with the community." backHref="/events" backLabel="All events">
            <EventForm mode="create" admin={admin} verified={user.isVerified !== false} cancelHref="/events" onDone={setCreated} />
        </PageShell>
    );
}
