'use client';

import { PageShell } from '@/components/events/PageShell';
import { useLab } from '@/hooks/queries/useLabs';
import { ApiError } from '@/lib/api';
import { AdminGate } from './AdminGate';
import { LabForm } from './LabForm';
import { ErrorState, ListSkeleton } from './ListStates';

export function CreateLabView() {
    return (
        <AdminGate returnTo="/admin/labs/create">
            {() => (
                <PageShell title="New lab" subtitle="Write the brief, add hints and files, and set the flags." backHref="/admin/labs" backLabel="All labs" wide>
                    <LabForm />
                </PageShell>
            )}
        </AdminGate>
    );
}

function Editor({ slug }: { slug: string }) {
    // The detail an admin gets carries the `admin` block and every hint's text, but never a flag
    const query = useLab(slug);
    const lab = query.data;
    return (
        <PageShell title={lab ? `Edit ${lab.title}` : 'Edit lab'} subtitle="Change only what you need: the rest stays as it is." backHref="/admin/labs" backLabel="All labs" wide>
            {lab ? (
                // The form takes a newer copy of the lab by itself while nothing was typed, and
                // keeps what was typed otherwise; the key only separates one lab from another
                <LabForm key={lab._id} lab={lab} />
            ) : query.isError ? (
                <ErrorState
                    error={query.error}
                    onRetry={() => void query.refetch()}
                    title={query.error instanceof ApiError && query.error.status === 404 ? 'This lab does not exist' : 'Could not load this lab'}
                />
            ) : (
                <ListSkeleton count={2} label="Loading lab" />
            )}
        </PageShell>
    );
}

export function EditLabView({ slug }: { slug: string }) {
    return <AdminGate returnTo={`/admin/labs/${slug}/edit`}>{() => <Editor slug={slug} />}</AdminGate>;
}
