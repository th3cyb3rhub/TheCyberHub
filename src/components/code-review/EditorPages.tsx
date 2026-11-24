'use client';

import { PageShell } from '@/components/events/PageShell';
import { useAdminSnippet } from '@/hooks/queries/useCodeReview';
import { ApiError } from '@/lib/api';
import { AdminGate } from './AdminGate';
import { ErrorState, ListSkeleton } from './ListStates';
import { SnippetEditor } from './SnippetEditor';

export function NewSnippetView() {
    return (
        <AdminGate returnTo="/admin/code-review/new" write>
            {() => (
                <PageShell title="New exercise" subtitle="Write the code, mark the findings, add hints and decide whether it is live." backHref="/admin/code-review" backLabel="All exercises" wide>
                    <SnippetEditor />
                </PageShell>
            )}
        </AdminGate>
    );
}

function Editor({ slug, canWrite }: { slug: string; canWrite: boolean }) {
    // The whole snippet with its answer key: admins, owners and moderators may read it
    const query = useAdminSnippet(slug);
    const snippet = query.data;
    return (
        <PageShell
            title={snippet ? `${canWrite ? 'Edit' : 'View'} ${snippet.title}` : canWrite ? 'Edit exercise' : 'View exercise'}
            subtitle={canWrite ? 'Change only what you need: the rest stays as it is.' : 'Read-only.'}
            backHref="/admin/code-review"
            backLabel="All exercises"
            wide
        >
            {snippet ? (
                <SnippetEditor key={snippet._id} snippet={snippet} readOnly={!canWrite} />
            ) : query.isError ? (
                <ErrorState
                    error={query.error}
                    onRetry={() => void query.refetch()}
                    title={query.error instanceof ApiError && query.error.status === 404 ? 'This exercise does not exist' : 'Could not load this exercise'}
                />
            ) : (
                <ListSkeleton count={2} label="Loading exercise" />
            )}
        </PageShell>
    );
}

export function EditSnippetView({ slug }: { slug: string }) {
    return <AdminGate returnTo={`/admin/code-review/${slug}/edit`}>{(_user, canWrite) => <Editor slug={slug} canWrite={canWrite} />}</AdminGate>;
}
