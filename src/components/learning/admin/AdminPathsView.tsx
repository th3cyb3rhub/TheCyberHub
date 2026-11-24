'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FileText, Plus, Route } from 'lucide-react';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { TabBar } from '@/components/events/TabBar';
import { useAuth } from '@/context/AuthContext';
import { useAdminPaths } from '@/hooks/queries/useLearningPaths';
import { CATEGORY_LABELS, KIND_LABELS, STATUS_LABELS, ageText, label, plural } from '@/lib/learning/display';
import { isModeratorRole } from '@/lib/roles';
import { PATH_KINDS, type LearningCard, type PathKind, type PathStatus } from '@/types/learning';
import { Chip, EmptyBlock, ErrorState, LoadMore, Skeleton, type Tone } from '../shared';
import { btnPrimary, btnSecondary, card, input, muted } from '@/components/events/styles';

const STATUS_TONE: Record<PathStatus, Tone> = { draft: 'gray', in_review: 'amber', published: 'green', archived: 'red' };

type StatusTab = PathStatus | 'all';
const TABS: { id: StatusTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Drafts' },
    { id: 'in_review', label: 'In review' },
    { id: 'published', label: 'Published' },
    { id: 'archived', label: 'Archived' },
];

function Row({ path, now }: { path: LearningCard; now: Date }) {
    const status = path.status ?? 'draft';
    return (
        <li className={`${card} p-5`} data-testid="admin-path-row" data-status={status}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="break-words font-semibold text-gray-900 dark:text-white">
                        <Link href={`/admin/learning-paths/${path.id}`} className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{path.title}</Link>
                    </h3>
                    <p className={`mt-0.5 text-xs ${muted}`}>
                        {label(KIND_LABELS, path.kind)} · {label(CATEGORY_LABELS, path.category)} · {plural(path.moduleCount, 'step')}
                        {path.updatedAt && <> · edited {ageText(path.updatedAt, now)}</>}
                        {path.createdBy?.username && <> · by @{path.createdBy.username}</>}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Chip>
                    {path.isFeatured && <Chip tone="orange">Featured</Chip>}
                </div>
            </div>
            {path.shortDescription && <p className="mt-3 line-clamp-2 break-words text-sm text-gray-800 dark:text-gray-200">{path.shortDescription}</p>}
            {status === 'published' && <p className={`mt-2 text-xs ${muted}`}>{plural(path.enrollmentCount, 'learner')} enrolled, {path.completionCount} finished</p>}
            {path.reviewNote && status === 'draft' && <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">Changes requested: {path.reviewNote}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/admin/learning-paths/${path.id}`} className={btnPrimary}><FileText className="h-4 w-4" aria-hidden="true" /> Edit<span className="sr-only"> {path.title}</span></Link>
                {status === 'published' && <Link href={path.kind === 'roadmap' ? `/roadmaps/${path.slug}` : `/learning-paths/${path.slug}`} className={btnSecondary}>View live</Link>}
            </div>
        </li>
    );
}

export function AdminPathsView() {
    const { user, ready } = useRequireLogin('/admin/learning-paths');
    const { loading } = useAuth();
    const [status, setStatus] = useState<StatusTab>('all');
    const [kind, setKind] = useState<PathKind | ''>('');
    const [draft, setDraft] = useState('');
    const [q, setQ] = useState('');
    const [now, setNow] = useState(() => new Date());
    useEffect(() => { setNow(new Date()); }, []);
    useEffect(() => {
        const id = window.setTimeout(() => setQ(draft.trim().length >= 2 ? draft.trim() : ''), 300);
        return () => window.clearTimeout(id);
    }, [draft]);

    const allowed = isModeratorRole(user?.role);
    const query = useAdminPaths({ status: status === 'all' ? '' : status, kind, q }, { enabled: ready && allowed });
    if (loading || !ready) return <FullPageSpinner />;
    if (!allowed) return <NoAccess message="Only moderators can manage roadmaps and learning paths." href="/roadmaps" label="Back to roadmaps" />;

    const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
    const counts = query.data?.pages[0]?.counts ?? {};
    const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
    const tabs = TABS.map((t) => ({ ...t, count: t.id === 'all' ? (Object.keys(counts).length ? total : undefined) : counts[t.id] }));

    return (
        <PageShell
            title="Roadmaps and paths"
            subtitle="Draft, review and publish the learning content."
            backHref="/admin"
            backLabel="Admin"
            wide
            actions={<Link href="/admin/learning-paths/new" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> New</Link>}
        >
            <div className="mb-4"><TabBar tabs={tabs} active={status} onChange={(id) => setStatus(id as StatusTab)} label="Status" idPrefix="admin-paths" /></div>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row">
                <div className="flex-1 sm:max-w-sm">
                    <label htmlFor="admin-paths-q" className="sr-only">Search by title</label>
                    <input id="admin-paths-q" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search by title" maxLength={100} className={input} />
                </div>
                <div>
                    <label htmlFor="admin-paths-kind" className="sr-only">Type</label>
                    <select id="admin-paths-kind" value={kind} onChange={(e) => setKind(e.target.value as PathKind | '')} className={input}>
                        <option value="">Roadmaps and paths</option>
                        {PATH_KINDS.map((k) => <option key={k} value={k}>{label(KIND_LABELS, k)}</option>)}
                    </select>
                </div>
            </div>
            <div id="admin-paths-panel" role="tabpanel" aria-labelledby={`admin-paths-${status}`}>
                {query.isLoading ? (
                    <div className="space-y-3" role="status" aria-label="Loading the list">{[0, 1, 2].map((i) => <div key={i} className={`${card} p-5`}><Skeleton className="h-4 w-1/3" /><Skeleton className="mt-3 h-3 w-full" /></div>)}</div>
                ) : query.isError ? (
                    <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the list" />
                ) : rows.length === 0 ? (
                    <EmptyBlock icon={Route} title="Nothing here yet">
                        {status === 'all' && !q ? 'Start the first roadmap.' : 'No roadmaps or paths match these filters.'}{' '}
                        <Link href="/admin/learning-paths/new" className="font-medium underline">Create a new one</Link>
                    </EmptyBlock>
                ) : (
                    <>
                        <ul className="list-none space-y-4" data-testid="admin-paths">{rows.map((p) => <Row key={p.id} path={p} now={now} />)}</ul>
                        <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
                    </>
                )}
            </div>
        </PageShell>
    );
}
