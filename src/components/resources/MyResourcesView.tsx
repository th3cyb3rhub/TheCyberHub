'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BookMarked, Library, Pencil, Plus, Trash2 } from 'lucide-react';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { TabBar } from '@/components/events/TabBar';
import { useDeleteResource, useMyResourceSubmissions, useReadingList } from '@/hooks/queries/useResources';
import { READING_LABELS } from '@/lib/learning/display';
import { READING_STATUSES, type ReadingStatus, type Resource } from '@/types/resource';
import { CardGridSkeleton, EmptyBlock, ErrorState, LoadMore, Modal } from '@/components/learning/shared';
import { btnPrimary, btnSecondary } from '@/components/events/styles';
import { ResourceCard } from './ResourceCard';

const STATUS_TABS = [{ id: 'all', label: 'All' }, { id: 'pending', label: 'Waiting' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }];

function Submissions() {
    const [status, setStatus] = useState('all');
    const [target, setTarget] = useState<Resource | null>(null);
    const query = useMyResourceSubmissions(status);
    const remove = useDeleteResource();
    const items = query.data?.pages.flatMap((p) => p.data) ?? [];
    const counts = query.data?.pages[0]?.counts ?? {};
    const tabs = STATUS_TABS.map((t) => ({ ...t, count: t.id === 'all' ? undefined : counts[t.id] }));

    return (
        <>
            <div className="mb-6"><TabBar tabs={tabs} active={status} onChange={setStatus} label="Submission status" idPrefix="my-resources" /></div>
            <div id="my-resources-panel" role="tabpanel" aria-labelledby={`my-resources-${status}`}>
                {query.isLoading ? <CardGridSkeleton count={3} label="Loading your submissions" /> : query.isError ? (
                    <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load your submissions" />
                ) : items.length === 0 ? (
                    <EmptyBlock icon={Library} title={status === 'all' ? 'You have not submitted anything yet' : 'Nothing here'} action={status === 'all' ? <Link href="/resources/submit" className={btnPrimary}>Suggest a resource</Link> : undefined}>
                        {status === 'all' ? 'Share a link you trust. A moderator reviews it and you see the decision here.' : 'No submissions with this status.'}
                    </EmptyBlock>
                ) : (
                    <>
                        <ul className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="my-submissions">
                            {items.map((r) => (
                                <li key={r.id}>
                                    <ResourceCard
                                        resource={r}
                                        showStatus
                                        footer={(
                                            <div className="flex flex-wrap gap-2">
                                                <Link href={`/resources/${r.slug}/edit`} className={`${btnSecondary} !px-3 !py-1.5 !text-xs`}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {r.status === 'rejected' ? 'Edit and resubmit' : 'Edit'}<span className="sr-only"> {r.title}</span></Link>
                                                <button type="button" onClick={() => setTarget(r)} className={`${btnSecondary} !px-3 !py-1.5 !text-xs text-red-800 dark:text-red-300`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete<span className="sr-only"> {r.title}</span></button>
                            </div>
                        )}
                    />
                                </li>
                            ))}
                        </ul>
                        <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
                    </>
                )}
            </div>
            <Modal
                open={!!target}
                onOpenChange={(o) => !o && setTarget(null)}
                title="Delete this submission?"
                description={target ? `"${target.title}" and its votes are removed. This cannot be undone.` : undefined}
                confirmLabel="Delete"
                destructive
                pending={remove.isPending}
                onConfirm={() => target && remove.mutate({ slug: target.slug }, { onSuccess: () => setTarget(null), onError: () => setTarget(null) })}
            />
        </>
    );
}

function ReadingList() {
    const [status, setStatus] = useState<ReadingStatus | 'all'>('all');
    const query = useReadingList(status);
    const items = query.data?.pages.flatMap((p) => p.data) ?? [];
    const tabs = [{ id: 'all', label: 'All' }, ...READING_STATUSES.map((s) => ({ id: s, label: READING_LABELS[s] }))];
    return (
        <>
            <div className="mb-6"><TabBar tabs={tabs} active={status} onChange={(id) => setStatus(id as ReadingStatus | 'all')} label="Reading status" idPrefix="reading-list" /></div>
            <div id="reading-list-panel" role="tabpanel" aria-labelledby={`reading-list-${status}`}>
                {query.isLoading ? <CardGridSkeleton count={3} label="Loading your reading list" /> : query.isError ? (
                    <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load your reading list" />
                ) : items.length === 0 ? (
                    <EmptyBlock icon={BookMarked} title="Your reading list is empty" action={<Link href="/resources" className={btnPrimary}>Browse the library</Link>}>Mark a resource as to read, reading or done and it shows up here.</EmptyBlock>
                ) : (
                    <>
                        <ul className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((r) => <li key={r.id}><ResourceCard resource={r} /></li>)}</ul>
                        <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
                    </>
                )}
            </div>
        </>
    );
}

export function MyResourcesView() {
    const { ready } = useRequireLogin('/resources/my');
    const [view, setView] = useState('submissions');
    if (!ready) return <FullPageSpinner />;
    return (
        <PageShell
            title="My library"
            subtitle="Your submissions with their review status, and the resources you saved to read."
            backHref="/resources"
            backLabel="Resource library"
            wide
            actions={<Link href="/resources/submit" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> Suggest a resource</Link>}
        >
            <div className="mb-4"><TabBar tabs={[{ id: 'submissions', label: 'My submissions' }, { id: 'reading', label: 'Reading list' }]} active={view} onChange={setView} label="My library" idPrefix="my-library" /></div>
            <div id="my-library-panel" role="tabpanel" aria-labelledby={`my-library-${view}`}>
                {view === 'submissions' ? <Submissions /> : <ReadingList />}
            </div>
        </PageShell>
    );
}
