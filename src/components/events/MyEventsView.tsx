'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Loader2, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import {
    useLeaveWaitlist, useMyRegistrations, useMySubmissions, useSetReminder, useUnregisterFromEvent,
} from '@/hooks/queries/useEvents';
import { useNow } from '@/lib/events/clock';
import { effectiveStatus } from '@/lib/events/time';
import { REMINDER_OFFSETS, type EventPage, type EventSummary, type ReminderOffset } from '@/types/event';
import type { InfiniteData } from '@tanstack/react-query';
import { EventCard } from './EventCard';
import { EventDialog } from './EventDialog';
import { ErrorState, GridSkeleton } from './ListStates';
import { FullPageSpinner, PageShell, useRequireLogin } from './PageShell';
import { StatusBadge } from './StatusBadge';
import { TabBar } from './TabBar';
import { btnPrimary, btnSecondary, input, muted } from './styles';

const TABS = [
    { id: 'registered', label: 'Registered' },
    { id: 'waitlisted', label: 'Waitlisted' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'past', label: 'Past' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const REMINDER_LABEL: Record<ReminderOffset, string> = { 60: '1 hour before', 1440: '1 day before' };

function RegisteredActions({ event, now }: { event: EventSummary; now: Date | null }) {
    const unregister = useUnregisterFromEvent();
    const remind = useSetReminder();
    const [confirm, setConfirm] = useState(false);
    const target = { id: event._id, slug: event.slug };
    const upcoming = now ? effectiveStatus(event, now) === 'upcoming' : event.status === 'upcoming';
    const current = event.viewer?.reminder?.offsetMinutes ?? null;
    const canLeave = upcoming && !event.viewer?.attended;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {upcoming && (
                <>
                    <label htmlFor={`remind-${event._id}`} className="sr-only">Reminder for {event.title}</label>
                    <select
                        id={`remind-${event._id}`}
                        value={current ?? ''}
                        disabled={remind.isPending}
                        onChange={(e) => remind.mutate({ ...target, offsetMinutes: e.target.value ? (Number(e.target.value) as ReminderOffset) : null })}
                        className={`${input} !w-auto !py-1.5 text-xs`}
                    >
                        <option value="">No reminder</option>
                        {REMINDER_OFFSETS.map((o) => <option key={o} value={o}>Remind me {REMINDER_LABEL[o]}</option>)}
                    </select>
                </>
            )}
            {canLeave && (
                <button type="button" className={`${btnSecondary} !px-3 !py-1.5 text-xs`} onClick={() => setConfirm(true)}>Cancel registration</button>
            )}
            <EventDialog
                open={confirm}
                onOpenChange={setConfirm}
                title="Cancel your registration?"
                description={event.title}
                confirmLabel="Cancel registration"
                destructive
                pending={unregister.isPending}
                onConfirm={() => unregister.mutate(target, { onSettled: () => setConfirm(false) })}
            />
        </div>
    );
}

function WaitlistActions({ event }: { event: EventSummary }) {
    const leave = useLeaveWaitlist();
    return (
        <button type="button" className={`${btnSecondary} !px-3 !py-1.5 text-xs`} disabled={leave.isPending} onClick={() => leave.mutate({ id: event._id, slug: event.slug })}>
            {leave.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />} Leave the waiting list
        </button>
    );
}

function SubmissionFooter({ event }: { event: EventSummary }) {
    const editable = event.status === 'pending' || event.status === 'rejected' || event.status === 'upcoming';
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={event.status} />
                {event.status === 'pending' && <span className={`text-xs ${muted}`}>A moderator will review it soon.</span>}
            </div>
            {event.status === 'rejected' && (
                <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-950 dark:bg-red-500/10 dark:text-red-100" data-testid="rejection-reason">
                    <span className="font-medium">Why: </span>{event.rejectionReason || 'No reason was given.'}
                </p>
            )}
            {editable && (
                <Link href={`/events/${event.slug}/edit`} className={`${event.status === 'rejected' ? btnPrimary : btnSecondary} !px-3 !py-1.5 text-xs`}>
                    {event.status === 'rejected' ? 'Edit and send again' : 'Edit'}
                </Link>
            )}
        </div>
    );
}

function PastFooter({ event }: { event: EventSummary }) {
    const v = event.viewer;
    if (!v) return null;
    if (v.canFeedback && !v.hasFeedback) {
        return <Link href={`/events/${event.slug}#feedback-heading`} className={`${btnSecondary} !px-3 !py-1.5 text-xs`}>Leave feedback</Link>;
    }
    return <p className={`text-xs ${muted}`}>{v.attended ? 'You attended.' : v.hasFeedback ? 'Thanks for your feedback.' : 'You were registered.'}</p>;
}

function Panel({ query, tab, now }: {
    query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown; data?: InfiniteData<EventPage>; hasNextPage?: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
    tab: TabId;
    now: Date | null;
}) {
    const events = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? []).filter((e) => !seen.has(e._id) && !!seen.add(e._id));
    }, [query.data]);

    if (query.isLoading) return <GridSkeleton count={3} />;
    if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load your events" />;

    if (events.length === 0) {
        const copy: Record<TabId, { title: string; description: string; cta?: { label: string; href: string } }> = {
            registered: { title: 'No upcoming events yet', description: 'Register for an event and it shows up here, with a reminder if you want one.', cta: { label: 'Browse events', href: '/events' } },
            waitlisted: { title: 'You are not on any waiting list', description: 'When an event is full you can join its waiting list and we register you if a seat opens.' },
            submitted: { title: 'You have not submitted an event', description: 'Host a CTF night, workshop or meetup. A moderator reviews it before it goes public.', cta: { label: 'Host an event', href: '/events/submit' } },
            past: { title: 'No past events yet', description: 'Events you attended or registered for appear here once they are over.' },
        };
        const c = copy[tab];
        return <EmptyState icon={CalendarDays} title={c.title} description={c.description} actionLabel={c.cta?.label} actionHref={c.cta?.href} />;
    }

    return (
        <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => (
                    <EventCard
                        key={event._id}
                        event={event}
                        now={now}
                        footer={tab === 'registered' ? <RegisteredActions event={event} now={now} />
                            : tab === 'waitlisted' ? <WaitlistActions event={event} />
                                : tab === 'submitted' ? <SubmissionFooter event={event} />
                                    : <PastFooter event={event} />}
                    />
                ))}
            </div>
            {query.hasNextPage && (
                <div className="mt-8 text-center">
                    <button type="button" className={btnSecondary} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                        {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                    </button>
                </div>
            )}
        </>
    );
}

export function MyEventsView() {
    const { user, ready } = useRequireLogin('/my-events');
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const now = useNow();
    const requested = search.get('tab');
    const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : 'registered';

    const registered = useMyRegistrations({ status: 'registered', scope: 'upcoming' }, tab === 'registered');
    const waitlisted = useMyRegistrations({ status: 'waitlisted', scope: 'upcoming' }, tab === 'waitlisted');
    const past = useMyRegistrations({ scope: 'past' }, tab === 'past');
    const submitted = useMySubmissions(tab === 'submitted');
    const queries = { registered, waitlisted, past, submitted };

    if (!ready || !user) return <FullPageSpinner />;

    const setTab = (id: string) => {
        const params = new URLSearchParams(search.toString());
        params.set('tab', id);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return (
        <PageShell
            wide
            title="My events"
            subtitle="Events you registered for, wait for or submitted."
            actions={<Link href="/events/submit" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> Host an event</Link>}
        >
            <div className="mb-6"><TabBar tabs={[...TABS]} active={tab} onChange={setTab} label="My events" idPrefix="my-events" /></div>
            <div id="my-events-panel" role="tabpanel" aria-labelledby={`my-events-${tab}`} tabIndex={0}>
                <Panel query={queries[tab]} tab={tab} now={now} />
            </div>
        </PageShell>
    );
}
