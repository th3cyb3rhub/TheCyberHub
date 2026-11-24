'use client';

import Link from 'next/link';
import { AlertTriangle, BookmarkCheck, CheckCircle2, Clock, Eye, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBookmarkResource } from '@/hooks/queries/useResources';
import { RESOURCE_STATUS_LABELS, RESOURCE_TOPIC_LABELS, RESOURCE_TYPE_LABELS, label, REJECT_LABELS } from '@/lib/learning/display';
import type { Resource, ResourceStatus } from '@/types/resource';
import { BookmarkToggle, Chip, DifficultyChip, type Tone } from '@/components/learning/shared';
import { card, muted } from '@/components/events/styles';
import { VoteButtons } from './VoteButtons';

const STATUS_TONE: Record<ResourceStatus, Tone> = { pending: 'amber', approved: 'green', rejected: 'red' };
const STATUS_ICON = { pending: Clock, approved: CheckCircle2, rejected: XCircle } as const;

export function ResourceStatusChip({ status }: { status: ResourceStatus }) {
    return <Chip tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>{RESOURCE_STATUS_LABELS[status]}</Chip>;
}

interface ResourceCardProps {
    resource: Resource;
    /** Actions or notes under the body (my submissions) */
    footer?: React.ReactNode;
    /** Hide the vote control (entries that are not public yet cannot be voted on) */
    showVotes?: boolean;
    /** Show the status chip even for approved entries (the member's own list) */
    showStatus?: boolean;
}

export function ResourceCard({ resource, footer, showVotes = true, showStatus = false }: ResourceCardProps) {
    const { user } = useAuth();
    const bookmark = useBookmarkResource();
    const viewer = resource.viewer;
    const broken = resource.linkStatus === 'broken';

    return (
        <article className={`${card} group relative flex h-full flex-col p-5 transition-shadow focus-within:ring-2 focus-within:ring-orange-500 hover:shadow-md`} data-testid="resource-card">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold leading-snug text-gray-900 dark:text-white">
                        <Link href={`/resources/${resource.slug}`} className="rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{resource.title}</Link>
                    </h3>
                    <p className={`mt-0.5 truncate text-xs ${muted}`}>{resource.domain}</p>
                </div>
                {user && viewer && resource.status !== 'rejected' && resource.status !== 'pending' && (
                    <BookmarkToggle
                        className="relative z-10 shrink-0"
                        label={resource.title}
                        bookmarked={viewer.bookmarked}
                        pending={bookmark.isPending && bookmark.variables?.id === resource.id}
                        onToggle={() => bookmark.mutate({ id: resource.id, bookmarked: !viewer.bookmarked })}
                    />
                )}
            </div>

            <p className={`mt-3 line-clamp-3 break-words text-sm ${muted}`}>{resource.description}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {resource.status && (showStatus || resource.status !== 'approved') && <ResourceStatusChip status={resource.status} />}
                <Chip tone="blue">{label(RESOURCE_TYPE_LABELS, resource.type)}</Chip>
                <DifficultyChip difficulty={resource.difficulty} />
                <Chip>{resource.isFree ? 'Free' : 'Paid'}</Chip>
                {resource.isFeatured && <Chip tone="orange">Featured</Chip>}
                {broken && <Chip tone="amber" icon={AlertTriangle}>Link may be broken</Chip>}
                {viewer?.reading && <Chip tone="gray" icon={BookmarkCheck}>{viewer.reading === 'to-read' ? 'To read' : viewer.reading === 'reading' ? 'Reading' : 'Read'}</Chip>}
            </div>
            <p className={`mt-2 text-xs ${muted}`}>{label(RESOURCE_TOPIC_LABELS, resource.topic)}{resource.tags.length > 0 ? ` · ${resource.tags.slice(0, 4).map((t) => `#${t}`).join(' ')}` : ''}</p>

            {resource.status === 'rejected' && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-950 dark:bg-red-500/10 dark:text-red-100" data-testid="rejection">
                    <span className="font-medium">{resource.rejectionCode ? `${REJECT_LABELS[resource.rejectionCode] ?? resource.rejectionCode}. ` : 'Rejected. '}</span>
                    {resource.rejectionReason && resource.rejectionReason !== REJECT_LABELS[resource.rejectionCode ?? 'other'] ? resource.rejectionReason : ''}
                </p>
            )}

            <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                {showVotes && (!resource.status || resource.status === 'approved') ? (
                    <div className="relative z-10"><VoteButtons resource={resource} /></div>
                ) : <span />}
                <span className={`inline-flex items-center gap-1 text-xs ${muted}`}><Eye className="h-3.5 w-3.5" aria-hidden="true" />{resource.views.toLocaleString('en')}<span className="sr-only"> views</span></span>
            </div>
            {footer && <div className="relative z-10 mt-3 border-t border-gray-200 pt-3 dark:border-neutral-800">{footer}</div>}
        </article>
    );
}
