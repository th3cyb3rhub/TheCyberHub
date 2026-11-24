'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Eye, Loader2, Pencil, Plus, Repeat, Search, Star, Trash2, XCircle, Ban } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import {
    useApproveEvent, useCancelEvent, useDeleteEvent, useEventPage, useRejectEvent, useReviewQueue, useToggleFeatured,
} from '@/hooks/queries/useEvents';
import { eventErrorCode, eventErrorMessage } from '@/lib/events/errors';
import { CATEGORY_LABELS } from '@/lib/events/form';
import { isAdminRole } from '@/lib/events/roles';
import { effectiveStatus, formatStart } from '@/lib/events/time';
import { isModeratorRole } from '@/lib/roles';
import type { EventSummary } from '@/types/event';
import { EventDialog } from './EventDialog';
import { ErrorState } from './ListStates';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from './PageShell';
import { SeriesChip } from './SeriesChip';
import { StatusBadge } from './StatusBadge';
import { TabBar } from './TabBar';
import { btnPrimary, btnSecondary, card, input, muted } from './styles';

const FILTERS = [
    { id: 'pending', label: 'Pending' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'live', label: 'Live' },
    { id: 'ended', label: 'Ended' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'all', label: 'All' },
];

type Action = { kind: 'reject' | 'cancel' | 'delete'; event: EventSummary } | null;

function Row({ event, admin, onAction }: { event: EventSummary; admin: boolean; onAction: (a: NonNullable<Action>) => void }) {
    const approve = useApproveEvent();
    const feature = useToggleFeatured();
    const status = effectiveStatus(event, new Date());
    const open = status === 'upcoming' || status === 'live';
    // A moderator does not approve their own submission; for a moderator the viewer block marks it as theirs
    const own = !admin && !!event.viewer?.canManage;

    return (
        <li className={`${card} p-4`} data-testid="queue-row" data-status={event.status}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={event.status === 'pending' || event.status === 'rejected' || event.status === 'cancelled' ? event.status : status} />
                        <span className={`text-xs ${muted}`}>{CATEGORY_LABELS[event.category]} · {event.eventType}</span>
                        {event.isFeatured && <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-800 dark:text-yellow-300"><Star className="h-3 w-3" aria-hidden="true" /> Featured</span>}
                        <SeriesChip seriesId={event.seriesId} />
                    </div>
                    <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                        <Link href={`/events/${event.slug}`} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{event.title}</Link>
                    </h3>
                    <p className={`text-sm ${muted}`}>{formatStart(event, event.timezone)} · {event.organizer}</p>
                    {event.createdAt && event.status === 'pending' && <p className={`text-xs ${muted}`}>Submitted {new Date(event.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                    {event.status === 'rejected' && event.rejectionReason && <p className="mt-1 text-sm text-red-900 dark:text-red-300">Reason: {event.rejectionReason}</p>}
                    {event.status === 'cancelled' && event.cancelReason && <p className="mt-1 text-sm text-red-900 dark:text-red-300">Reason: {event.cancelReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/events/${event.slug}`} className={`${btnSecondary} !px-3 !py-2`}><Eye className="h-4 w-4" aria-hidden="true" /> View</Link>
                    {event.status === 'pending' && (
                        <>
                            {own ? (
                                <span className={`text-xs ${muted}`} data-testid="own-submission">Your own event: another reviewer approves it.</span>
                            ) : (
                                <button type="button" className={`${btnPrimary} !px-3 !py-2`} disabled={approve.isPending} onClick={() => approve.mutate({ id: event._id })}>
                                    {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} Approve
                                </button>
                            )}
                            <button type="button" className={`${btnSecondary} !px-3 !py-2`} onClick={() => onAction({ kind: 'reject', event })}>
                                <XCircle className="h-4 w-4" aria-hidden="true" /> Reject
                            </button>
                        </>
                    )}
                    {admin && (
                        <>
                            <Link href={`/admin/events/${event._id}/edit`} className={`${btnSecondary} !px-3 !py-2`}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</Link>
                            {open && event.status !== 'pending' && (
                                <button type="button" className={`${btnSecondary} !px-3 !py-2`} aria-pressed={event.isFeatured} disabled={feature.isPending} onClick={() => feature.mutate({ id: event._id, featured: !event.isFeatured })}>
                                    <Star className="h-4 w-4" aria-hidden="true" /> {event.isFeatured ? 'Unfeature' : 'Feature'}
                                </button>
                            )}
                            {open && (
                                <button type="button" className={`${btnSecondary} !px-3 !py-2`} onClick={() => onAction({ kind: 'cancel', event })}><Ban className="h-4 w-4" aria-hidden="true" /> {event.seriesId ? 'Cancel this occurrence' : 'Cancel'}</button>
                            )}
                            {!event.seriesId && (
                                <button type="button" className={`${btnSecondary} !px-3 !py-2 text-red-800 dark:text-red-300`} onClick={() => onAction({ kind: 'delete', event })} aria-label={`Delete ${event.title}`}>
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </li>
    );
}

export function AdminEventsView() {
    const { user, ready } = useRequireLogin('/admin/events');
    const [filter, setFilter] = useState('pending');
    const [draft, setDraft] = useState('');
    const [q, setQ] = useState('');
    const [action, setAction] = useState<Action>(null);
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [seriesHint, setSeriesHint] = useState(false);

    useEffect(() => {
        const id = window.setTimeout(() => setQ(draft.trim()), 300);
        return () => window.clearTimeout(id);
    }, [draft]);

    const allowed = !!user && isModeratorRole(user.role);
    const admin = !!user && isAdminRole(user.role);
    const queue = useReviewQueue(filter === 'all' ? '' : filter, ready && allowed, q ? { q } : {});
    const pendingCount = useEventPage({ status: 'pending', limit: 1 }, { enabled: ready && allowed, key: 'pending-count' });
    const reject = useRejectEvent();
    const cancel = useCancelEvent();
    const remove = useDeleteEvent();

    const events = useMemo(() => {
        const seen = new Set<string>();
        return (queue.data?.pages.flatMap((p) => p.data) ?? []).filter((e) => !seen.has(e._id) && !!seen.add(e._id));
    }, [queue.data]);
    const waiting = pendingCount.data?.pagination.total ?? 0;

    if (!ready || !user) return <FullPageSpinner />;
    if (!allowed) return <NoAccess message="Only moderators and administrators can review events." />;

    const close = () => { setAction(null); setDialogError(null); setSeriesHint(false); };
    const fail = (err: unknown) => setDialogError(eventErrorMessage(err));
    // A date of a series cannot be deleted: say so and move to the cancel dialog for the same date
    const failDelete = (err: unknown) => {
        if (eventErrorCode(err) === 'EVENT_IN_SERIES' && action) {
            setSeriesHint(true);
            setAction({ kind: 'cancel', event: action.event });
        }
        fail(err);
    };
    const inSeries = !!action?.event.seriesId || seriesHint;

    return (
        <PageShell
            wide
            title="Event review"
            subtitle={admin ? 'Review submissions and manage every event.' : 'Review community submissions.'}
            actions={(
                <div className="flex flex-wrap gap-2">
                    <Link href="/admin/events/series" className={btnSecondary}><Repeat className="h-4 w-4" aria-hidden="true" /> Recurring series</Link>
                    {admin && <Link href="/admin/events/new" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> New event</Link>}
                </div>
            )}
        >
            <div className="mb-4"><TabBar tabs={FILTERS.map((f) => ({ ...f, count: f.id === 'pending' ? waiting : undefined }))} active={filter} onChange={setFilter} label="Filter by status" idPrefix="queue" /></div>

            <div className="relative mb-6 max-w-md">
                <label htmlFor="queue-q" className="sr-only">Search events</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                <input id="queue-q" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search by title" className={`${input} pl-9`} />
            </div>

            <div id="queue-panel" role="tabpanel" aria-labelledby={`queue-${filter}`}>
                {queue.isLoading ? (
                    <div className="space-y-3" role="status" aria-label="Loading events">
                        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-200 dark:bg-neutral-800" />)}
                    </div>
                ) : queue.isError ? (
                    <ErrorState error={queue.error} onRetry={() => void queue.refetch()} title="Could not load the events" />
                ) : events.length === 0 ? (
                    <EmptyState
                        icon={CalendarDays}
                        title={filter === 'pending' ? 'Nothing waiting for review' : 'No events here'}
                        description={q ? 'No event matches that search.' : filter === 'pending' ? 'New submissions show up here.' : 'Try another filter.'}
                    />
                ) : (
                    <>
                        <ul className="space-y-3">{events.map((e) => <Row key={e._id} event={e} admin={admin} onAction={(a) => { setDialogError(null); setSeriesHint(false); setAction(a); }} />)}</ul>
                        {queue.hasNextPage && (
                            <div className="mt-6 text-center">
                                <button type="button" className={btnSecondary} disabled={queue.isFetchingNextPage} onClick={() => void queue.fetchNextPage()}>
                                    {queue.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <EventDialog
                open={action?.kind === 'reject'}
                onOpenChange={(o) => !o && close()}
                title={`Reject "${action?.event.title ?? ''}"?`}
                description="The submitter is notified and sees your reason. They can edit and send it again."
                confirmLabel="Reject"
                destructive
                reason={{ label: 'Reason', min: 5, max: 500, placeholder: 'Tell them what to change.' }}
                pending={reject.isPending}
                error={dialogError}
                onConfirm={(reason) => action && reject.mutate({ id: action.event._id, reason }, { onSuccess: close, onError: fail })}
            />
            <EventDialog
                open={action?.kind === 'cancel'}
                onOpenChange={(o) => !o && close()}
                title={`Cancel "${action?.event.title ?? ''}"?`}
                description={inSeries ? 'Only this date is cancelled and the series goes on. Everyone who registered or is waiting is notified. This cannot be undone.' : 'Everyone who registered or is waiting is notified. This cannot be undone.'}
                confirmLabel={inSeries ? 'Cancel this occurrence' : 'Cancel the event'}
                destructive
                reason={{ label: 'Reason, shown on the event page', min: 3, max: 500 }}
                pending={cancel.isPending}
                error={dialogError}
                onConfirm={(reason) => action && cancel.mutate({ id: action.event._id, reason }, { onSuccess: close, onError: fail })}
            />
            <EventDialog
                open={action?.kind === 'delete'}
                onOpenChange={(o) => !o && close()}
                title={`Delete "${action?.event.title ?? ''}"?`}
                description="The event and its registrations are removed for good. Cancel it instead if people already registered."
                confirmLabel="Delete"
                destructive
                pending={remove.isPending}
                error={dialogError}
                onConfirm={() => action && remove.mutate({ id: action.event._id }, { onSuccess: close, onError: failDelete })}
            />
        </PageShell>
    );
}
