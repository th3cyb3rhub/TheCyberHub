'use client';

import { PageShell } from '@/components/events/PageShell';
import { useInternship } from '@/hooks/queries/useInternships';
import { ApiError } from '@/lib/api';
import { CohortForm } from './CohortForm';
import { ErrorState, ListSkeleton } from './ListStates';
import { StaffGate } from './StaffGate';

export function CreateCohortView() {
    return (
        <StaffGate returnTo="/admin/internships/create">
            {() => (
                <PageShell title="New program" subtitle="Create an internship or mentorship cohort." backHref="/admin/internships" backLabel="All programs" wide>
                    <CohortForm />
                </PageShell>
            )}
        </StaffGate>
    );
}

function Editor({ id }: { id: string }) {
    const query = useInternship(id);
    const cohort = query.data;
    return (
        <PageShell title={cohort ? `Edit ${cohort.title}` : 'Edit program'} subtitle="Change only what you need: the rest stays as it is." backHref="/admin/internships" backLabel="All programs" wide>
            {cohort ? (
                // The form takes a newer copy of the program by itself while nothing was typed, and
                // keeps what was typed otherwise; the key only separates one program from another
                <CohortForm key={cohort._id} cohort={cohort} />
            ) : query.isError ? (
                <ErrorState
                    error={query.error}
                    onRetry={() => void query.refetch()}
                    title={query.error instanceof ApiError && query.error.status === 404 ? 'This program does not exist' : 'Could not load this program'}
                />
            ) : (
                <ListSkeleton count={2} label="Loading program" />
            )}
        </PageShell>
    );
}

export function EditCohortView({ id }: { id: string }) {
    return <StaffGate returnTo={`/admin/internships/${id}/edit`}>{() => <Editor id={id} />}</StaffGate>;
}
