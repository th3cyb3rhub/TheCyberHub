'use client';

import { useSearchParams } from 'next/navigation';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { ResourceForm } from './ResourceForm';

export function SubmitView() {
    const { ready } = useRequireLogin('/resources/submit');
    const from = useSearchParams().get('from');
    // The slug only picks a link target, so it is held to the slug alphabet
    const slug = from && /^[a-z0-9][a-z0-9-]{0,119}$/.test(from) ? from : null;
    if (!ready) return <FullPageSpinner />;
    return (
        <PageShell title="Suggest a resource" subtitle="Share a course, write-up, tool or video you trust. A moderator reviews it before it appears." backHref="/resources" backLabel="Resource library">
            <ResourceForm from={slug} />
        </PageShell>
    );
}
