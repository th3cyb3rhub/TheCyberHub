'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ExternalLink, Eye, Library, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBookmarkResource, useDeleteResource, useResource, useSetReading } from '@/hooks/queries/useResources';
import { EXTERNAL_REL, READING_LABELS, REJECT_LABELS, RESOURCE_TOPIC_LABELS, RESOURCE_TYPE_LABELS, formatDate, label, pathHref, safeHref } from '@/lib/learning/display';
import { isNotFound } from '@/lib/learning/errors';
import { READING_STATUSES, type ReadingStatus, type Resource } from '@/types/resource';
import { BookmarkToggle, Chip, DifficultyChip, EmptyBlock, ErrorState, Modal, Skeleton } from '@/components/learning/shared';
import { btnPrimary, btnSecondary, cardPad, focusRing, input, muted, pageBg } from '@/components/events/styles';
import { ResourceStatusChip } from './ResourceCard';
import { ReportButton } from './ReportDialog';
import { VoteButtons } from './VoteButtons';
import { useGoToSignIn } from '@/components/learning/shared';

function Frame({ children }: { children: React.ReactNode }) {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6">
                <Link href="/resources" className={`mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${focusRing}`}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Resource library
                </Link>
                {children}
            </div>
        </div>
    );
}

export function ResourceDetailSkeleton() {
    return (
        <Frame>
            <div role="status" aria-label="Loading" className="space-y-4">
                <Skeleton className="h-9 w-3/4" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-10 w-40" />
            </div>
        </Frame>
    );
}

function ReadingSelect({ resource }: { resource: Resource }) {
    const setReading = useSetReading();
    const current = resource.viewer?.reading ?? '';
    return (
        <div>
            <label htmlFor="reading-status" className="sr-only">Reading status</label>
            <select
                id="reading-status"
                value={current}
                disabled={setReading.isPending}
                onChange={(e) => setReading.mutate({ id: resource.id, slug: resource.slug, status: (e.target.value || null) as ReadingStatus | null })}
                className={`${input} !w-auto !py-2`}
            >
                <option value="">Not on my reading list</option>
                {READING_STATUSES.map((s) => <option key={s} value={s}>{READING_LABELS[s]}</option>)}
            </select>
        </div>
    );
}

export function ResourceDetailView({ slug, initialResource }: { slug: string; initialResource?: Resource | null }) {
    const router = useRouter();
    const { user } = useAuth();
    const query = useResource(slug, initialResource);
    const bookmark = useBookmarkResource();
    const remove = useDeleteResource();
    const goToSignIn = useGoToSignIn();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const resource = query.data;

    if (!resource) {
        if (query.isError) {
            return (
                <Frame>
                    {isNotFound(query.error)
                        ? <EmptyBlock icon={Library} title="Resource not found" action={<Link href="/resources" className={btnPrimary}>Browse the library</Link>}>It may have been removed, or it is still waiting for review.</EmptyBlock>
                        : <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this resource" />}
                </Frame>
            );
        }
        return <ResourceDetailSkeleton />;
    }

    const viewer = resource.viewer;
    const isPublic = !resource.status || resource.status === 'approved';
    // Only http(s) links become links: anything else is shown as text
    const href = safeHref(resource.url);

    return (
        <Frame>
            {resource.status === 'pending' && <p role="note" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">This submission is waiting for review. Only you and moderators can see it.</p>}
            {resource.status === 'rejected' && (
                <div role="note" className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="rejection">
                    <p className="font-medium">This submission was rejected{resource.rejectionCode ? `: ${REJECT_LABELS[resource.rejectionCode] ?? resource.rejectionCode}` : ''}.</p>
                    {resource.rejectionReason && <p className="mt-1">{resource.rejectionReason}</p>}
                    {viewer?.canEdit && <p className="mt-2">Fix the problem and send it again from <Link href={`/resources/${resource.slug}/edit`} className="font-medium underline">Edit and resubmit</Link>.</p>}
                </div>
            )}

            <header className="mb-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    {resource.status && resource.status !== 'approved' && <ResourceStatusChip status={resource.status} />}
                    <Chip tone="blue">{label(RESOURCE_TYPE_LABELS, resource.type)}</Chip>
                    <DifficultyChip difficulty={resource.difficulty} />
                    <Chip>{resource.isFree ? 'Free' : 'Paid'}</Chip>
                    {resource.linkStatus === 'broken' && <Chip tone="amber">Link may be broken</Chip>}
                </div>
                <h1 className="break-words text-3xl font-bold text-gray-900 dark:text-white">{resource.title}</h1>
                <p className={`mt-1 text-sm ${muted}`}>{resource.domain} · {label(RESOURCE_TOPIC_LABELS, resource.topic)}</p>
            </header>

            <p className="whitespace-pre-line break-words text-base text-gray-800 dark:text-gray-200" data-testid="description">{resource.description}</p>

            {resource.tags.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tags">
                    {resource.tags.map((t) => (
                        <li key={t}><Link href={`/resources?tag=${encodeURIComponent(t)}`} className={`rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-800 hover:bg-gray-300 dark:bg-neutral-800 dark:text-gray-200 dark:hover:bg-neutral-700 ${focusRing}`}>#{t}</Link></li>
                    ))}
                </ul>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
                {href ? (
                    <a href={href} target="_blank" rel={EXTERNAL_REL} className={btnPrimary} data-testid="visit">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> Visit resource<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                ) : (
                    <p className="text-sm text-red-700 dark:text-red-400">This link is not a web address, so it is not shown.</p>
                )}
                <p className={`text-xs ${muted}`}>Opens {resource.domain}, a site we do not control.</p>
            </div>

            <div className={`${cardPad} mt-8 flex flex-wrap items-center justify-between gap-4`}>
                <div className="flex flex-wrap items-center gap-4">
                    {isPublic && <VoteButtons resource={resource} isOwner={viewer?.isOwner} />}
                    {isPublic && user && viewer && (
                        <BookmarkToggle label={resource.title} bookmarked={viewer.bookmarked} pending={bookmark.isPending} onToggle={() => bookmark.mutate({ id: resource.id, bookmarked: !viewer.bookmarked })} />
                    )}
                    {isPublic && user && viewer && <ReadingSelect resource={resource} />}
                    {isPublic && !user && <button type="button" onClick={goToSignIn} className={btnSecondary}>Sign in to vote and save</button>}
                </div>
                <span className={`inline-flex items-center gap-1 text-sm ${muted}`}><Eye className="h-4 w-4" aria-hidden="true" />{resource.views.toLocaleString('en')} views</span>
            </div>

            <dl className={`mt-6 grid gap-3 text-sm sm:grid-cols-2 ${muted}`}>
                {resource.submittedBy && <div><dt className="font-medium text-gray-900 dark:text-white">Shared by</dt><dd>@{resource.submittedBy.username}</dd></div>}
                <div><dt className="font-medium text-gray-900 dark:text-white">Added</dt><dd>{formatDate(resource.approvedAt ?? resource.createdAt)}</dd></div>
            </dl>

            {resource.usedIn && resource.usedIn.length > 0 && (
                <section aria-labelledby="used-heading" className="mt-8">
                    <h2 id="used-heading" className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Used in</h2>
                    <ul className="flex flex-wrap gap-2">
                        {resource.usedIn.map((p) => (
                            <li key={p.id}><Link href={pathHref(p.kind, p.slug)} className={`inline-flex rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 hover:border-orange-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 ${focusRing}`}>{p.title}</Link></li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-neutral-800">
                {viewer?.canEdit && <Link href={`/resources/${resource.slug}/edit`} className={btnSecondary}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit{resource.status === 'rejected' ? ' and resubmit' : ''}</Link>}
                {viewer?.canModerate && <Link href="/admin/resources" className={btnSecondary}><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Review queue</Link>}
                {viewer?.canDelete && <button type="button" onClick={() => setConfirmDelete(true)} className={`${btnSecondary} text-red-800 dark:text-red-300`}><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete</button>}
                {isPublic && <ReportButton slug={resource.slug} title={resource.title} isOwner={viewer?.isOwner} />}
            </div>

            <Modal
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete this resource?"
                description="Its votes, bookmarks and reading marks are removed too. This cannot be undone."
                confirmLabel="Delete resource"
                destructive
                pending={remove.isPending}
                onConfirm={() => remove.mutate({ slug: resource.slug }, { onSuccess: () => router.replace(viewer?.isOwner ? '/resources/my' : '/resources') })}
            />
        </Frame>
    );
}
