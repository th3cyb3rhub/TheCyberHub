'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, ClipboardCheck, Loader2, Pencil, Users } from 'lucide-react';
import { useCancelEvent, useEventAttendees, useMarkAttendance } from '@/hooks/queries/useEvents';
import { eventErrorMessage } from '@/lib/events/errors';
import { effectiveStatus } from '@/lib/events/time';
import type { Attendee, EventDetail } from '@/types/event';
import { EventDialog } from './EventDialog';
import { TabBar } from './TabBar';
import { btnPrimary, btnSecondary, cardPad, muted } from './styles';

type Group = 'registered' | 'attended' | 'waitlisted';
const GROUPS: { id: Group; label: string; empty: string }[] = [
    { id: 'registered', label: 'Registered', empty: 'Nobody is registered right now.' },
    { id: 'attended', label: 'Attended', empty: 'Nobody has been marked as attended yet.' },
    { id: 'waitlisted', label: 'Waiting list', empty: 'Nobody is on the waiting list.' },
];

/** For the creator and administrators: who is coming, who showed up, and calling the event off */
export function OrganizerPanel({ event, now, onCancelled }: { event: EventDetail; now: Date | null; onCancelled?: () => void }) {
    const status = effectiveStatus(event, now ?? new Date(event.startDate));
    const started = status === 'live' || status === 'ended';
    const published = ['upcoming', 'live', 'ended', 'cancelled'].includes(event.status);
    const [group, setGroup] = useState<Group>('registered');
    const attendees = useEventAttendees(event._id, { status: group }, published);
    const mark = useMarkAttendance();
    const cancel = useCancelEvent();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

    const rows = useMemo<Attendee[]>(() => (attendees.data?.pages ?? []).flatMap((p) => p.data), [attendees.data]);
    const registered = group === 'registered' ? rows.filter((r) => r.user) : [];
    const total = attendees.data?.pages[0]?.pagination.total ?? rows.length;
    const current = GROUPS.find((g) => g.id === group)!;

    const toggle = (id: string) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const allSelected = registered.length > 0 && registered.every((r) => selected.has(r.user!._id));

    const canCancel = status === 'upcoming' || status === 'live';

    return (
        <section aria-labelledby="organizer-heading" className={cardPad} data-testid="organizer-panel">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id="organizer-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                    <ClipboardCheck className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Organizer tools
                </h2>
                <div className="flex flex-wrap gap-2">
                    <Link href={`/events/${event.slug}/edit`} className={btnSecondary}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit event</Link>
                    {canCancel && (
                        <button type="button" className={btnSecondary} onClick={() => { setCancelError(null); setConfirmCancel(true); }}>
                            <Ban className="h-4 w-4" aria-hidden="true" /> Cancel event
                        </button>
                    )}
                </div>
            </div>

            {!published ? (
                <p className={`text-sm ${muted}`}>The attendee list opens once the event is approved and public.</p>
            ) : (
                <>
                    <div className="mb-3">
                        <TabBar
                            tabs={GROUPS.map((g) => ({ id: g.id, label: g.label }))}
                            active={group}
                            onChange={(id) => { setGroup(id as Group); setSelected(new Set()); }}
                            label="Attendees"
                            idPrefix="attendees"
                        />
                    </div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2" id="attendees-panel" role="tabpanel" aria-labelledby={`attendees-${group}`}>
                        <p className={`flex items-center gap-1.5 text-sm ${muted}`}>
                            <Users className="h-4 w-4" aria-hidden="true" />
                            {attendees.isSuccess ? `${total} ${total === 1 ? 'person' : 'people'} ${group === 'registered' ? 'registered' : group === 'attended' ? 'attended' : 'waiting'}` : 'Attendees'}
                        </p>
                        {started && registered.length > 0 && (
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={() => setSelected(allSelected ? new Set() : new Set(registered.map((r) => r.user!._id)))}
                                        className="h-4 w-4 accent-orange-600"
                                    />
                                    Select everyone listed
                                </label>
                                <button
                                    type="button"
                                    className={btnPrimary}
                                    disabled={selected.size === 0 || mark.isPending}
                                    onClick={() => mark.mutate({ id: event._id, userIds: Array.from(selected) }, { onSuccess: () => setSelected(new Set()) })}
                                >
                                    {mark.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                    Mark {selected.size || ''} attended
                                </button>
                            </div>
                        )}
                    </div>
                    {!started && group === 'registered' && <p className={`mb-3 text-sm ${muted}`}>Attendance can be recorded once the event has started. Members earn points when you mark them.</p>}

                    {attendees.isLoading ? (
                        <div className="space-y-2" role="status" aria-label="Loading attendees">
                            {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-200 dark:bg-neutral-800" />)}
                        </div>
                    ) : attendees.isError ? (
                        <div role="alert" className="flex items-center gap-3 text-sm text-red-700 dark:text-red-400">
                            <span>{eventErrorMessage(attendees.error, 'Could not load the attendees.')}</span>
                            <button type="button" className="font-medium underline" onClick={() => void attendees.refetch()}>Try again</button>
                        </div>
                    ) : rows.length === 0 ? (
                        <p className={`rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm dark:border-neutral-700 ${muted}`}>{current.empty}</p>
                    ) : (
                        <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 dark:divide-neutral-800 dark:border-neutral-800">
                            {rows.map((r, i) => (
                                <li key={r.user?._id ?? i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                                    {started && group === 'registered' && r.user ? (
                                        <input
                                            type="checkbox"
                                            aria-label={`Mark ${r.user.name || r.user.username} as attended`}
                                            checked={selected.has(r.user._id)}
                                            onChange={() => toggle(r.user!._id)}
                                            className="h-4 w-4 accent-orange-600"
                                        />
                                    ) : <span className="w-4" aria-hidden="true" />}
                                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-white">
                                        {r.user ? (r.user.name || r.user.username) : 'Deleted account'}
                                        {r.user?.name && <span className={`ml-2 font-normal ${muted}`}>@{r.user.username}</span>}
                                    </span>
                                    <span className={`shrink-0 text-xs ${r.status === 'attended' ? 'text-green-800 dark:text-green-300' : muted}`}>
                                        {group === 'waitlisted' ? `#${i + 1}` : r.attendedAt ? 'Attended' : ''}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {rows.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <p className={`text-xs ${muted}`}>Showing {rows.length} of {total}.</p>
                            {attendees.hasNextPage && (
                                <button type="button" className={btnSecondary} disabled={attendees.isFetchingNextPage} onClick={() => void attendees.fetchNextPage()}>
                                    {attendees.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                    Load more
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            <EventDialog
                open={confirmCancel}
                onOpenChange={setConfirmCancel}
                title="Cancel this event?"
                description="Everyone who registered or is waiting is told, and the event shows as cancelled. This cannot be undone."
                confirmLabel="Cancel the event"
                destructive
                reason={{ label: 'Reason, shown on the event page', min: 3, max: 500, placeholder: 'For example: the speaker is ill, we will announce a new date.' }}
                pending={cancel.isPending}
                error={cancelError}
                onConfirm={(reason) => cancel.mutate({ id: event._id, reason }, {
                    onSuccess: () => { setConfirmCancel(false); onCancelled?.(); },
                    onError: (err) => setCancelError(eventErrorMessage(err)),
                })}
            />
        </section>
    );
}
