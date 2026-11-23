'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { EventForm } from '@/components/events/EventForm';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { useEvent } from '@/hooks/queries/useEvents';
import { eventErrorMessage } from '@/lib/events/errors';
import { isAdminRole } from '@/lib/events/roles';

export default function AdminEditEventPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { user, ready } = useRequireLogin(`/admin/events/${id}/edit`);
    // The API loads an event by slug or by id; the list links by id
    const query = useEvent(id);

    if (!ready || !user) return <FullPageSpinner />;
    if (!isAdminRole(user.role)) return <NoAccess message="Only administrators can edit any event." href="/admin/events" label="Back to the review queue" />;
    if (query.isLoading) return <FullPageSpinner label="Loading the event" />;
    if (query.isError || !query.data) return <NoAccess message={eventErrorMessage(query.error, 'This event could not be found.')} href="/admin/events" label="Back to the review queue" />;

    return (
        <PageShell title="Edit event" subtitle={query.data.title} backHref="/admin/events" backLabel="All events">
            <EventForm mode="edit" admin event={query.data} cancelHref="/admin/events" onDone={() => router.push('/admin/events')} />
        </PageShell>
    );
}
