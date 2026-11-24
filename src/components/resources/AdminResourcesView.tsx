'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Link2, ShieldCheck, Star, XCircle } from 'lucide-react';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { TabBar } from '@/components/events/TabBar';
import { useApproveResource, useFeatureResource, useRejectResource, useResourceReviewQueue, useSetLinkStatus } from '@/hooks/queries/useResources';
import { EXTERNAL_REL, LINK_LABELS, REJECT_LABELS, RESOURCE_TYPE_LABELS, ageText, label, plural, safeHref } from '@/lib/learning/display';
import { learningErrorMessage } from '@/lib/learning/errors';
import { LIMITS, rejectSchema } from '@/lib/learning/schemas';
import { isModeratorRole } from '@/lib/roles';
import { isAdminRole } from '@/lib/events/roles';
import { LINK_STATUSES_LIST } from './constants';
import { REJECT_REASONS, type LinkStatus, type RejectReason, type Resource, type ReviewQueue } from '@/types/resource';
import { Chip, EmptyBlock, ErrorState, LoadMore, Modal, Skeleton, type Tone } from '@/components/learning/shared';
import { btnPrimary, btnSecondary, card, input, label as labelClass, muted } from '@/components/events/styles';
import { ResourceStatusChip } from './ResourceCard';
import { useAuth } from '@/context/AuthContext';

const QUEUES: { id: ReviewQueue; label: string }[] = [
    { id: 'pending', label: 'Pending' }, { id: 'reported', label: 'Reported' }, { id: 'broken', label: 'Broken links' }, { id: 'rejected', label: 'Rejected' }, { id: 'all', label: 'All' },
];

const LINK_TONE: Record<LinkStatus, Tone> = { unknown: 'gray', ok: 'green', broken: 'red' };

function RejectDialog({ resource, onClose }: { resource: Resource; onClose: () => void }) {
    const reject = useRejectResource();
    const [reason, setReason] = useState<RejectReason | ''>('');
    const [note, setNote] = useState('');
    const [problem, setProblem] = useState<string | null>(null);
    return (
        <Modal
            open
            onOpenChange={(o) => !o && onClose()}
            title="Reject this resource"
            description={`${resource.title}. The reason and note are shown to the person who submitted it.`}
            confirmLabel="Reject"
            destructive
            pending={reject.isPending}
            confirmDisabled={!reason}
            error={problem ?? (reject.error ? learningErrorMessage(reject.error) : null)}
            onConfirm={() => {
                const parsed = rejectSchema.safeParse({ reason, note });
                if (!parsed.success) { setProblem(parsed.error.issues[0]?.message ?? 'Check the form'); return; }
                setProblem(null);
                reject.mutate({ slug: resource.slug, reason: parsed.data.reason, note: parsed.data.note }, { onSuccess: onClose });
            }}
        >
            <label htmlFor="reject-reason" className={labelClass}>Reason</label>
            <select id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value as RejectReason | '')} className={input}>
                <option value="">Choose a reason</option>
                {REJECT_REASONS.map((r) => <option key={r} value={r}>{REJECT_LABELS[r]}</option>)}
            </select>
            <label htmlFor="reject-note" className={`${labelClass} mt-4`}>Note{reason === 'other' ? '' : ' (optional)'}</label>
            <textarea id="reject-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.rejectNote} className={`${input} resize-none`} />
            <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{note.trim().length}/{LIMITS.rejectNote}</p>
        </Modal>
    );
}

function LinkDialog({ resource, onClose }: { resource: Resource; onClose: () => void }) {
    const set = useSetLinkStatus();
    const [status, setStatus] = useState<LinkStatus>(resource.linkStatus);
    const [note, setNote] = useState(resource.linkNote ?? '');
    return (
        <Modal
            open
            onOpenChange={(o) => !o && onClose()}
            title="Record a link check"
            description="Open the link yourself and record what you found. The server never visits submitted links."
            confirmLabel="Save"
            pending={set.isPending}
            error={set.error ? learningErrorMessage(set.error) : null}
            onConfirm={() => set.mutate({ slug: resource.slug, status, note: note.trim() }, { onSuccess: onClose })}
        >
            <label htmlFor="link-status" className={labelClass}>Link status</label>
            <select id="link-status" value={status} onChange={(e) => setStatus(e.target.value as LinkStatus)} className={input}>
                {LINK_STATUSES_LIST.map((s) => <option key={s} value={s}>{LINK_LABELS[s]}</option>)}
            </select>
            <label htmlFor="link-note" className={`${labelClass} mt-4`}>Note (optional)</label>
            <textarea id="link-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.linkNote} className={`${input} resize-none`} />
        </Modal>
    );
}

type Dialog = { kind: 'reject' | 'link'; resource: Resource } | null;

function Row({ resource, viewer, onDialog, now }: { resource: Resource; viewer: { username?: string; role?: string }; onDialog: (d: Dialog) => void; now: Date }) {
    const approve = useApproveResource();
    const feature = useFeatureResource();
    const href = safeHref(resource.url);
    const own = !!viewer.username && resource.submittedBy?.username === viewer.username;
    const rec = resource.submitterRecord;
    return (
        <li className={`${card} p-5`} data-testid="queue-row" data-status={resource.status}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="break-words font-semibold text-gray-900 dark:text-white"><Link href={`/resources/${resource.slug}`} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded">{resource.title}</Link></h3>
                    <p className={`mt-0.5 text-xs ${muted}`}>{resource.domain} · {label(RESOURCE_TYPE_LABELS, resource.type)} · {ageText(resource.createdAt, now)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {resource.status && <ResourceStatusChip status={resource.status} />}
                    <Chip tone={LINK_TONE[resource.linkStatus]}>{LINK_LABELS[resource.linkStatus]}</Chip>
                    {resource.isFeatured && <Chip tone="orange">Featured</Chip>}
                </div>
            </div>
            <p className="mt-3 line-clamp-3 break-words text-sm text-gray-800 dark:text-gray-200">{resource.description}</p>
            <p className={`mt-3 text-xs ${muted}`}>
                {resource.submittedBy ? <>By @{resource.submittedBy.username}</> : 'Unknown submitter'}
                {rec && <> · {rec.approved} approved, {rec.rejected} rejected</>}
                {typeof resource.sameDomainCount === 'number' && resource.sameDomainCount > 0 && <> · {plural(resource.sameDomainCount, 'other link')} from {resource.domain}</>}
                {!!resource.openReports && <> · <strong className="text-red-800 dark:text-red-300">{plural(resource.openReports, 'open report')}</strong></>}
            </p>
            {resource.linkNote && <p className={`mt-1 text-xs ${muted}`}>Link note: {resource.linkNote}</p>}
            {resource.status === 'rejected' && resource.rejectionReason && <p className="mt-2 text-sm text-red-900 dark:text-red-200">Rejected: {resource.rejectionReason}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
                {href && <a href={href} target="_blank" rel={EXTERNAL_REL} className={btnSecondary}><ExternalLink className="h-4 w-4" aria-hidden="true" /> Open link<span className="sr-only"> for {resource.title} (new tab)</span></a>}
                {own ? <span className={`text-xs ${muted}`} data-testid="own-submission">Your own submission: another moderator reviews it.</span> : (
                    <>
                        {resource.status !== 'approved' && (
                            <button type="button" className={btnPrimary} disabled={approve.isPending} onClick={() => approve.mutate({ slug: resource.slug, title: resource.title })}>
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve<span className="sr-only"> {resource.title}</span>
                            </button>
                        )}
                        {resource.status !== 'rejected' && (
                            <button type="button" className={btnSecondary} onClick={() => onDialog({ kind: 'reject', resource })}>
                                <XCircle className="h-4 w-4" aria-hidden="true" /> Reject<span className="sr-only"> {resource.title}</span>
                            </button>
                        )}
                    </>
                )}
                <button type="button" className={btnSecondary} onClick={() => onDialog({ kind: 'link', resource })}><Link2 className="h-4 w-4" aria-hidden="true" /> Link status<span className="sr-only"> for {resource.title}</span></button>
                {isAdminRole(viewer.role) && resource.status === 'approved' && (
                    <button type="button" className={btnSecondary} aria-pressed={resource.isFeatured} disabled={feature.isPending} onClick={() => feature.mutate({ slug: resource.slug, featured: !resource.isFeatured })}>
                        <Star className="h-4 w-4" aria-hidden="true" /> {resource.isFeatured ? 'Unfeature' : 'Feature'}<span className="sr-only"> {resource.title}</span>
                    </button>
                )}
            </div>
            {approve.isError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{learningErrorMessage(approve.error)}</p>}
        </li>
    );
}

export function AdminResourcesView() {
    const { user, ready } = useRequireLogin('/admin/resources');
    const { loading } = useAuth();
    const [queue, setQueue] = useState<ReviewQueue>('pending');
    const [draft, setDraft] = useState('');
    const [q, setQ] = useState('');
    const [dialog, setDialog] = useState<Dialog>(null);
    const [now, setNow] = useState(() => new Date());
    useEffect(() => { setNow(new Date()); }, []);
    useEffect(() => {
        const id = window.setTimeout(() => setQ(draft.trim().length >= 2 ? draft.trim() : ''), 300);
        return () => window.clearTimeout(id);
    }, [draft]);

    const allowed = isModeratorRole(user?.role);
    const query = useResourceReviewQueue(queue, q, { enabled: ready && allowed });
    if (loading || !ready) return <FullPageSpinner />;
    if (!allowed) return <NoAccess message="Only moderators can review the resource library." href="/resources" label="Back to the library" />;

    const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
    const counts = query.data?.pages[0]?.counts ?? {};
    const tabs = QUEUES.map((t) => ({ ...t, count: counts[t.id] }));

    return (
        <PageShell title="Resource review" subtitle="Open each link yourself, then approve or reject with a reason." backHref="/admin" backLabel="Admin" wide actions={<ShieldCheck className="hidden h-8 w-8 text-orange-700 dark:text-orange-400 sm:block" aria-hidden="true" />}>
            <div className="mb-4"><TabBar tabs={tabs} active={queue} onChange={(id) => setQueue(id as ReviewQueue)} label="Review queue" idPrefix="review-queue" /></div>
            <div className="mb-6">
                <label htmlFor="queue-q" className="sr-only">Search the queue</label>
                <input id="queue-q" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search by title or domain" maxLength={100} className={`${input} sm:max-w-sm`} />
            </div>
            <div id="review-queue-panel" role="tabpanel" aria-labelledby={`review-queue-${queue}`}>
                {query.isLoading ? (
                    <div className="space-y-3" role="status" aria-label="Loading the queue">{[0, 1, 2].map((i) => <div key={i} className={`${card} p-5`}><Skeleton className="h-4 w-1/3" /><Skeleton className="mt-3 h-3 w-full" /><Skeleton className="mt-2 h-3 w-2/3" /></div>)}</div>
                ) : query.isError ? (
                    <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the queue" />
                ) : rows.length === 0 ? (
                    <EmptyBlock icon={CheckCircle2} title={queue === 'pending' ? 'Queue clear' : 'Nothing here'}>{queue === 'pending' ? 'No submissions are waiting for review.' : 'No resources in this queue.'}</EmptyBlock>
                ) : (
                    <>
                        <ul className="list-none space-y-4" data-testid="queue">
                            {rows.map((r) => <Row key={r.id} resource={r} viewer={{ username: user?.username, role: user?.role }} onDialog={setDialog} now={now} />)}
                        </ul>
                        <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} />
                    </>
                )}
            </div>
            {dialog?.kind === 'reject' && <RejectDialog resource={dialog.resource} onClose={() => setDialog(null)} />}
            {dialog?.kind === 'link' && <LinkDialog resource={dialog.resource} onClose={() => setDialog(null)} />}
        </PageShell>
    );
}
