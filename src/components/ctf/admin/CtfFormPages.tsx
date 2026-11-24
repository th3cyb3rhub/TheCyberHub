'use client';

import { PageShell } from '@/components/events/PageShell';
import { useCtfCompetition } from '@/hooks/queries/useCtf';
import { ApiError } from '@/lib/api';
import { ErrorState, ListSkeleton } from '../ListStates';
import { CompetitionForm } from './CompetitionForm';
import { CtfAdminGate } from './CtfAdminGate';

export function CreateCtfView() {
    return (
        <CtfAdminGate returnTo="/admin/ctf/create" write>
            {() => (
                <PageShell title="New competition" subtitle="Set the dates and the rules, pick the challenges, and publish when it is ready." backHref="/admin/ctf" backLabel="All competitions" wide>
                    <CompetitionForm />
                </PageShell>
            )}
        </CtfAdminGate>
    );
}

function Editor({ slug }: { slug: string }) {
    // Staff get the detail with the challenge set, its solve counts and the admin fields, never a flag
    const query = useCtfCompetition(slug);
    const competition = query.data;
    return (
        <PageShell title={competition ? `Edit ${competition.title}` : 'Edit competition'} subtitle="Change only what you need: the rest stays as it is." backHref="/admin/ctf" backLabel="All competitions" wide>
            {competition ? (
                // The form takes a newer copy by itself while nothing was typed and keeps what was typed otherwise;
                // the key only separates one competition from another
                <CompetitionForm key={competition._id} competition={competition} />
            ) : query.isError ? (
                <ErrorState
                    error={query.error}
                    onRetry={() => void query.refetch()}
                    title={query.error instanceof ApiError && query.error.status === 404 ? 'This competition does not exist' : 'Could not load this competition'}
                />
            ) : (
                <ListSkeleton count={2} label="Loading competition" />
            )}
        </PageShell>
    );
}

export function EditCtfView({ slug }: { slug: string }) {
    return <CtfAdminGate returnTo={`/admin/ctf/${slug}/edit`} write>{() => <Editor slug={slug} />}</CtfAdminGate>;
}
