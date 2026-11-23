'use client';

import { useRouter } from 'next/navigation';
import { EventForm } from '@/components/events/EventForm';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { isAdminRole } from '@/lib/events/roles';

export default function NewEventPage() {
    const router = useRouter();
    const { user, ready } = useRequireLogin('/admin/events/new');
    if (!ready || !user) return <FullPageSpinner />;
    if (!isAdminRole(user.role)) return <NoAccess message="Only administrators can publish events directly." href="/admin/events" label="Back to the review queue" />;

    return (
        <PageShell title="New event" subtitle="Published at once. Members can register right away." backHref="/admin/events" backLabel="All events">
            <EventForm mode="create" admin cancelHref="/admin/events" onDone={() => router.push('/admin/events')} />
        </PageShell>
    );
}
