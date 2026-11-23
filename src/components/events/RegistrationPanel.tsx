'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, BellOff, CalendarCheck, CheckCircle2, ExternalLink, Hourglass, Loader2, LogIn, Lock, Ticket, Video } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
    useJoinWaitlist, useLeaveWaitlist, useRegisterForEvent, useSetReminder, useUnregisterFromEvent,
} from '@/hooks/queries/useEvents';
import { availability } from '@/lib/events/display';
import { registrationView } from '@/lib/events/registration';
import { effectiveStatus, formatStart, serverClock } from '@/lib/events/time';
import { REMINDER_OFFSETS, type EventDetail, type ReminderOffset } from '@/types/event';
import { EventDialog } from './EventDialog';
import { btnPrimary, btnSecondary, cardPad, focusRing, muted } from './styles';

const REMINDER_LABEL: Record<ReminderOffset, string> = { 60: '1 hour before', 1440: '1 day before' };

export function RegistrationPanel({ event, now }: { event: EventDetail; now: Date | null }) {
    const { user, loading: authLoading } = useAuth();
    const register = useRegisterForEvent();
    const unregister = useUnregisterFromEvent();
    const join = useJoinWaitlist();
    const leave = useLeaveWaitlist();
    const remind = useSetReminder();
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [shareActivity, setShareActivity] = useState(true);

    // Until mounted there is no clock: show what the server said
    const clock = now ?? serverClock(event);
    const view = registrationView(event, { signedIn: !!user, authLoading, now: clock });
    const status = effectiveStatus(event, clock);
    const target = { id: event._id, slug: event.slug };
    const avail = availability(event);
    const redirect = encodeURIComponent(`/events/${event.slug}`);
    const busy = register.isPending || unregister.isPending || join.isPending || leave.isPending;
    const viewer = event.viewer;
    const online = event.locationType !== 'in-person';

    return (
        <section aria-labelledby="registration-heading" className={cardPad} data-testid="registration-panel" data-view={view.kind}>
            <h2 id="registration-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                <Ticket className="h-4 w-4 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Registration
            </h2>

            {(view.kind === 'can-register' || view.kind === 'can-waitlist' || view.kind === 'guest' || view.kind === 'closed' || view.kind === 'loading') && status !== 'ended' && (
                <p className={`mb-3 text-sm ${muted}`} data-testid="capacity-line">
                    {avail.kind === 'open' ? 'Open to everyone.' : avail.label}
                </p>
            )}

            {view.kind === 'loading' && (
                <div className="h-11 animate-pulse rounded-xl bg-gray-200 dark:bg-neutral-800" role="status" aria-label="Loading your registration" />
            )}

            {view.kind === 'cancelled' && (
                <p className="text-sm text-red-800 dark:text-red-300">This event was cancelled. Registration is closed.</p>
            )}

            {view.kind === 'ended' && (
                <div className="space-y-1 text-sm">
                    <p className="font-medium text-gray-900 dark:text-white">This event is over.</p>
                    {view.attended ? (
                        <p className="flex items-center gap-1.5 text-green-800 dark:text-green-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> You attended.</p>
                    ) : view.registered ? (
                        <p className={muted}>You were registered.</p>
                    ) : null}
                </div>
            )}

            {view.kind === 'guest' && (
                view.open ? (
                    <Link href={`/auth?redirect=${redirect}`} className={`${btnPrimary} w-full`}>
                        <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in to register
                    </Link>
                ) : (
                    <p className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"><Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{view.reason}</p>
                )
            )}

            {view.kind === 'can-register' && (
                <div className="space-y-3">
                    <label className="flex items-start gap-2.5 text-sm text-gray-800 dark:text-gray-200">
                        <input type="checkbox" checked={shareActivity} onChange={(e) => setShareActivity(e.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" />
                        <span>Share on the activity feed<span className={`block text-xs ${muted}`}>Followers see that you are going. Private profiles are never shown.</span></span>
                    </label>
                    <button type="button" className={`${btnPrimary} w-full`} disabled={busy} onClick={() => register.mutate({ ...target, shareActivity })}>
                        {register.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Register
                    </button>
                </div>
            )}

            {view.kind === 'can-waitlist' && (
                <div className="space-y-2">
                    <p className="text-sm text-amber-900 dark:text-amber-300">This event is full. You can join the waiting list and we will register you if a seat opens.</p>
                    <button type="button" className={`${btnPrimary} w-full`} disabled={busy} onClick={() => join.mutate(target)}>
                        {join.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Join the waiting list
                    </button>
                </div>
            )}

            {view.kind === 'waitlisted' && (
                <div className="space-y-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-300" data-testid="waitlist-status">
                        <Hourglass className="h-4 w-4" aria-hidden="true" />
                        {view.position ? `You are #${view.position} on the waiting list` : 'You are on the waiting list'}
                    </p>
                    <p className={`text-sm ${muted}`}>We will register you and send a notification when a seat opens.</p>
                    <button type="button" className={`${btnSecondary} w-full`} disabled={busy} onClick={() => leave.mutate(target)}>
                        {leave.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Leave the waiting list
                    </button>
                </div>
            )}

            {view.kind === 'registered' && (
                <div className="space-y-4">
                    <p className="flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-300" data-testid="registered-status">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {view.attended ? 'You attended' : 'You are registered'}
                    </p>

                    {event.joinLink ? (
                        <a href={event.joinLink} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} w-full`}>
                            <Video className="h-4 w-4" aria-hidden="true" /> Join the event <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">(opens in a new tab)</span>
                        </a>
                    ) : status !== 'ended' && online && viewer?.joinOpensAt ? (
                        <p className={`text-sm ${muted}`} data-testid="join-opens">
                            The join link appears here at {formatStart({ startDate: viewer.joinOpensAt }, event.timezone)}, 30 minutes before the start.
                        </p>
                    ) : null}

                    {status === 'upcoming' && (
                        <fieldset>
                            <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
                                {viewer?.reminder ? <Bell className="h-4 w-4" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />} Remind me
                            </legend>
                            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reminder">
                                {([null, ...REMINDER_OFFSETS] as (ReminderOffset | null)[]).map((offset) => {
                                    const active = (viewer?.reminder?.offsetMinutes ?? null) === offset;
                                    return (
                                        <button
                                            key={offset ?? 'off'}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            disabled={remind.isPending}
                                            onClick={() => !active && remind.mutate({ ...target, offsetMinutes: offset })}
                                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${focusRing} ${active
                                                ? 'border-orange-700 bg-orange-700 text-white'
                                                : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}
                                        >
                                            {offset === null ? 'Off' : REMINDER_LABEL[offset]}
                                        </button>
                                    );
                                })}
                            </div>
                            {viewer?.reminder?.sent && <p className={`mt-2 text-xs ${muted}`}>Your reminder was sent.</p>}
                        </fieldset>
                    )}

                    {!view.attended && (
                        <button type="button" className={`${btnSecondary} w-full`} disabled={busy} onClick={() => setConfirmLeave(true)}>
                            Cancel my registration
                        </button>
                    )}
                    <EventDialog
                        open={confirmLeave}
                        onOpenChange={setConfirmLeave}
                        title="Cancel your registration?"
                        description={event.maxParticipants ? 'Your seat goes to the next person on the waiting list, if there is one.' : 'You can register again while registration is open.'}
                        confirmLabel="Cancel registration"
                        destructive
                        pending={unregister.isPending}
                        onConfirm={() => unregister.mutate(target, { onSuccess: () => setConfirmLeave(false), onError: () => setConfirmLeave(false) })}
                    />
                </div>
            )}

            {view.kind === 'closed' && (
                <p className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300" data-testid="closed-reason">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {view.reason}
                </p>
            )}

            {event.registrationLink && status !== 'ended' && status !== 'cancelled' && (
                <a href={event.registrationLink} target="_blank" rel="noopener noreferrer nofollow" className={`${btnSecondary} mt-3 w-full`}>
                    <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Organizer&apos;s registration page
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                </a>
            )}
        </section>
    );
}
