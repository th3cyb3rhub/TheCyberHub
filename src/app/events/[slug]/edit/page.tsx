'use client';

import Link from 'next/link';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { EventForm } from '@/components/events/EventForm';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { btnSecondary, muted } from '@/components/events/styles';
import { useToast } from '@/context/ToastContext';
import { useEvent } from '@/hooks/queries/useEvents';
import { eventErrorMessage } from '@/lib/events/errors';
import { isAdminRole } from '@/lib/events/roles';

export default function EditEventPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params);
    const router = useRouter();
    const { addToast } = useToast();
    const { user, ready } = useRequireLogin(`/events/${slug}/edit`);
    const query = useEvent(slug);

    if (!ready || !user) return <FullPageSpinner />;
    if (query.isLoading) return <FullPageSpinner label="Loading the event" />;
    if (query.isError || !query.data) {
        return <NoAccess message={eventErrorMessage(query.error, 'This event could not be found.')} />;
    }
    const event = query.data;
    // The API answers 403 to everyone else, but there is no reason to show them a form
    if (!event.viewer?.canManage) return <NoAccess message="Only the organizer or an administrator can edit this event." href={`/events/${event.slug}`} label="Back to the event" />;

    const cancelled = event.status === 'cancelled';
    return (
        <PageShell title="Edit event" subtitle={event.title} backHref={`/events/${event.slug}`} backLabel="Back to the event">
            {cancelled ? (
                <div className="space-y-4">
                    <p className={`text-sm ${muted}`}>A cancelled event cannot be edited.</p>
                    <Link href={`/events/${event.slug}`} className={btnSecondary}>Back to the event</Link>
                </div>
            ) : (
                <EventForm
                    mode="edit"
                    admin={isAdminRole(user.role)}
                    event={event}
                    cancelHref={`/events/${event.slug}`}
                    onDone={(saved) => {
                        if (saved.status === 'pending') {
                            // A public event whose key details changed goes back to review and leaves the public lists
                            addToast({
                                variant: 'info',
                                title: 'Sent for re-review',
                                message: event.status === 'pending' || event.status === 'rejected'
                                    ? 'A moderator will review your event again.'
                                    : 'Your changes need a moderator to approve them. The event is hidden from the public until then.',
                            });
                            router.push('/my-events?tab=submitted');
                        } else {
                            addToast({ variant: 'success', message: 'Your changes were saved.' });
                            router.push(`/events/${saved.slug}`);
                        }
                    }}
                />
            )}
        </PageShell>
    );
}
