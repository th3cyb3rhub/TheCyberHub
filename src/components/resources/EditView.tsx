'use client';

import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { useResource } from '@/hooks/queries/useResources';
import { isNotFound, learningErrorMessage } from '@/lib/learning/errors';
import { ErrorState } from '@/components/learning/shared';
import { ResourceForm } from './ResourceForm';

export function EditView({ slug }: { slug: string }) {
    const { ready } = useRequireLogin(`/resources/${slug}/edit`);
    const query = useResource(slug);
    if (!ready || query.isLoading) return <FullPageSpinner />;
    if (query.isError) {
        return isNotFound(query.error)
            ? <NoAccess message={learningErrorMessage(query.error)} href="/resources" label="Back to the library" />
            : <PageShell title="Edit resource" backHref="/resources/my" backLabel="My submissions"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></PageShell>;
    }
    const resource = query.data;
    if (!resource || !resource.viewer?.canEdit) return <NoAccess message="Only the person who submitted this resource, or a moderator, can change it." href="/resources" label="Back to the library" />;
    return (
        <PageShell title="Edit resource" subtitle={resource.title} backHref={`/resources/${resource.slug}`} backLabel="Back to the resource">
            <ResourceForm resource={resource} />
        </PageShell>
    );
}
