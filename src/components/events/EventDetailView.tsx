'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
    AlertTriangle, ArrowLeft, BadgeCheck, CalendarX, CheckCircle2, ExternalLink, FileText, Globe, Loader2, MapPin,
    Presentation, RefreshCw, Users, Video, XCircle,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { ReportContentButton } from '@/components/ui/ReportContentButton';
import { useAuth } from '@/context/AuthContext';
import { useApproveEvent, useEvent, useRejectEvent } from '@/hooks/queries/useEvents';
import { useNow } from '@/lib/events/clock';
import { safeHref } from '@/lib/events/display';
import { eventErrorMessage } from '@/lib/events/errors';
import { CATEGORY_LABELS, FORMAT_LABELS } from '@/lib/events/form';
import { effectiveStatus, serverClock } from '@/lib/events/time';
import { isModeratorRole } from '@/lib/roles';
import type { EventDetail, Speaker } from '@/types/event';
import { Countdown } from './Countdown';
import { EventDescription } from './EventDescription';
import { EventDialog } from './EventDialog';
import { EventFeedbackSection } from './EventFeedbackSection';
import { EventTimes } from './EventTimes';
import { OrganizerPanel } from './OrganizerPanel';
import { RegistrationPanel } from './RegistrationPanel';
import { StatusBadge } from './StatusBadge';
import { btnPrimary, btnSecondary, card, cardPad, chip, muted, pageBg } from './styles';

function SpeakerCard({ speaker }: { speaker: Speaker }) {
    const links = [
        ['LinkedIn', safeHref(speaker.linkedin)],
        ['Twitter', safeHref(speaker.twitter)],
        ['GitHub', safeHref(speaker.github)],
        ['Website', safeHref(speaker.website)],
    ].filter((l): l is [string, string] => !!l[1]);
    const avatar = safeHref(speaker.avatar);
    return (
        <li className="flex gap-3 rounded-xl border border-gray-200 p-3 dark:border-neutral-800">
            {avatar ? (
                <Image src={avatar} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" unoptimized />
            ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-semibold text-orange-900 dark:bg-orange-500/15 dark:text-orange-300" aria-hidden="true">
                    {speaker.name.charAt(0).toUpperCase()}
                </span>
            )}
            <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white">{speaker.name}</p>
                {speaker.title && <p className={`text-sm ${muted}`}>{speaker.title}</p>}
                {speaker.bio && <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{speaker.bio}</p>}
                {links.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
                        {links.map(([name, href]) => (
                            <a key={name} href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-orange-800 underline hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-200">{name}</a>
                        ))}
                    </p>
                )}
            </div>
        </li>
    );
}

function ReviewBar({ event }: { event: EventDetail }) {
    const approve = useApproveEvent();
    const reject = useRejectEvent();
    const [rejecting, setRejecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <div className="flex flex-wrap gap-2" data-testid="review-bar">
            <button type="button" className={btnPrimary} disabled={approve.isPending} onClick={() => approve.mutate({ id: event._id })}>
                {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} Approve
            </button>
            <button type="button" className={btnSecondary} onClick={() => { setError(null); setRejecting(true); }}>
                <XCircle className="h-4 w-4" aria-hidden="true" /> Reject
            </button>
            <EventDialog
                open={rejecting}
                onOpenChange={setRejecting}
                title="Reject this submission?"
                description="The submitter is notified and sees your reason. They can edit and send it again."
                confirmLabel="Reject"
                destructive
                reason={{ label: 'Reason', min: 5, max: 500, placeholder: 'Tell them what to change.' }}
                pending={reject.isPending}
                error={error}
                onConfirm={(reason) => reject.mutate({ id: event._id, reason }, {
                    onSuccess: () => setRejecting(false),
                    onError: (err) => setError(eventErrorMessage(err)),
                })}
            />
        </div>
    );
}

function Banner({ tone, children }: { tone: 'amber' | 'red' | 'blue'; children: React.ReactNode }) {
    const tones = {
        amber: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
        red: 'border-red-300 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
        blue: 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100',
    };
    return <div role="status" className={`mb-6 rounded-xl border p-4 text-sm ${tones[tone]}`}>{children}</div>;
}

export function EventDetailSkeleton() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6" role="status" aria-label="Loading the event">
                <div className="mb-4 h-4 w-48 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="mb-3 h-9 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="mb-8 h-5 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="grid gap-6 lg:grid-cols-3">
                    <div className="h-72 animate-pulse rounded-2xl bg-gray-200 dark:bg-neutral-800 lg:col-span-2" />
                    <div className="h-56 animate-pulse rounded-2xl bg-gray-200 dark:bg-neutral-800" />
                </div>
            </div>
        </div>
    );
}

interface EventDetailViewProps {
    slug: string;
    /** Rendered on the server, without a login. Absent for events only the creator and reviewers can see. */
    initialEvent?: EventDetail | null;
}

export function EventDetailView({ slug, initialEvent }: EventDetailViewProps) {
    const { user } = useAuth();
    const query = useEvent(slug, initialEvent);
    const now = useNow();
    const event = query.data;

    if (!event) {
        if (query.isError) {
            const status = (query.error as { status?: number } | null)?.status;
            const missing = status === 404;
            return (
                <div className={pageBg}>
                    <div className="mx-auto flex max-w-xl flex-col items-center px-4 pb-16 pt-32 text-center">
                        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-500/10">
                            {missing ? <CalendarX className="h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" /> : <AlertTriangle className="h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" />}
                        </div>
                        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{missing ? 'Event not found' : 'Could not load this event'}</h1>
                        <p className={`mb-6 text-sm ${muted}`} role="alert">
                            {missing ? 'It may have been removed, or it is not public yet.' : eventErrorMessage(query.error, 'Please try again.')}
                        </p>
                        <div className="flex gap-3">
                            {!missing && <button type="button" className={btnPrimary} onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>}
                            <Link href="/events" className={btnSecondary}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All events</Link>
                        </div>
                    </div>
                </div>
            );
        }
        return <EventDetailSkeleton />;
    }

    const clock = now ?? serverClock(event);
    const status = effectiveStatus(event, clock);
    const viewer = event.viewer;
    const image = safeHref(event.bannerImage || event.image);
    const hasRegistration = event.status !== 'pending' && event.status !== 'rejected';
    const ended = status === 'ended';
    const recording = safeHref(event.recordingLink);
    const slides = safeHref(event.slidesLink);
    const canReview = !!user && isModeratorRole(user.role) && event.status === 'pending' && !(viewer?.canManage && user.role === 'moderator');

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
                <Breadcrumbs items={[{ label: 'Events', href: '/events' }, { label: event.title }]} />

                {event.status === 'pending' && (
                    <Banner tone="amber">
                        <p className="font-medium">This event is waiting for review.</p>
                        <p className="mt-1">Only you and the reviewers can see this page. Members see it once it is approved.</p>
                        {canReview && <div className="mt-3"><ReviewBar event={event} /></div>}
                    </Banner>
                )}
                {event.status === 'rejected' && (
                    <Banner tone="red">
                        <p className="font-medium">This submission was not approved.</p>
                        {event.rejectionReason && <p className="mt-1">Reason: {event.rejectionReason}</p>}
                        {viewer?.canManage && <p className="mt-2"><Link href={`/events/${event.slug}/edit`} className="font-medium underline">Edit and send it again</Link></p>}
                    </Banner>
                )}
                {status === 'cancelled' && (
                    <Banner tone="red">
                        <p className="flex items-center gap-2 font-medium"><CalendarX className="h-4 w-4" aria-hidden="true" /> This event was cancelled.</p>
                        {event.cancelReason && <p className="mt-1">{event.cancelReason}</p>}
                    </Banner>
                )}

                <header className="mb-8">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <StatusBadge status={status} />
                        <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{CATEGORY_LABELS[event.category] ?? event.category}</span>
                        <span className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}>{FORMAT_LABELS[event.locationType]}</span>
                        {event.eventType === 'official' && <span className={`${chip} bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300`}><BadgeCheck className="h-3 w-3" aria-hidden="true" /> Official</span>}
                    </div>
                    <h1 className="text-3xl font-bold leading-tight text-gray-900 dark:text-white sm:text-4xl">{event.title}</h1>
                    {event.shortDescription && <p className={`mt-2 max-w-3xl text-lg ${muted}`}>{event.shortDescription}</p>}
                    <p className={`mt-2 text-sm ${muted}`}>Hosted by <span className="font-medium text-gray-900 dark:text-white">{event.organizer}</span></p>
                    <div className="mt-3"><Countdown event={event} now={now} /></div>
                </header>

                <div className="grid gap-6 lg:grid-cols-3 lg:grid-rows-[auto_1fr]">
                    {hasRegistration && (
                        <div className="lg:col-start-3 lg:row-start-1">
                            <RegistrationPanel event={event} now={now} />
                        </div>
                    )}

                    <div className="space-y-6 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                        {image && (
                            <div className={`${card} relative aspect-[16/9] overflow-hidden`}>
                                <Image src={image} alt="" fill sizes="(min-width: 1024px) 66vw, 100vw" className="object-cover" priority unoptimized />
                            </div>
                        )}

                        <section aria-labelledby="about-heading" className={cardPad}>
                            <h2 id="about-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">About this event</h2>
                            {event.description ? <EventDescription content={event.description} /> : <p className={`text-sm ${muted}`}>The organizer has not added a description yet.</p>}
                        </section>

                        {event.speakers.length > 0 && (
                            <section aria-labelledby="speakers-heading" className={cardPad}>
                                <h2 id="speakers-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Speakers</h2>
                                <ul className="grid gap-3 sm:grid-cols-2">{event.speakers.map((s, i) => <SpeakerCard key={`${s.name}-${i}`} speaker={s} />)}</ul>
                            </section>
                        )}

                        {ended && (recording || slides || event.summaryNotes) && (
                            <section aria-labelledby="after-heading" className={cardPad} data-testid="after-event">
                                <h2 id="after-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Recording and slides</h2>
                                <div className="flex flex-wrap gap-3">
                                    {recording && <a href={recording} target="_blank" rel="noopener noreferrer nofollow" className={btnPrimary}><Video className="h-4 w-4" aria-hidden="true" /> Watch the recording <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>}
                                    {slides && <a href={slides} target="_blank" rel="noopener noreferrer nofollow" className={btnSecondary}><Presentation className="h-4 w-4" aria-hidden="true" /> View the slides <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>}
                                </div>
                                {event.summaryNotes && (
                                    <div className="mt-4">
                                        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white"><FileText className="h-4 w-4" aria-hidden="true" /> Notes</h3>
                                        <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{event.summaryNotes}</p>
                                    </div>
                                )}
                            </section>
                        )}

                        {ended && <EventFeedbackSection event={event} />}
                    </div>

                    <section aria-labelledby="details-heading" className={`${cardPad} lg:col-start-3 ${hasRegistration ? 'lg:row-start-2' : 'lg:row-start-1'} lg:self-start`}>
                        <h2 id="details-heading" className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Details</h2>
                        <div className="space-y-4">
                            <EventTimes event={event} />
                            <div className="flex items-start gap-2.5">
                                {event.locationType === 'online' ? <Globe className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" /> : <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />}
                                <div className="min-w-0 text-sm">
                                    <p className="font-medium text-gray-900 dark:text-white">{event.location || FORMAT_LABELS[event.locationType]}</p>
                                    {event.venue && <p className={muted}>{event.venue}</p>}
                                </div>
                            </div>
                            {!ended && status !== 'cancelled' && (
                                <div className="flex items-start gap-2.5">
                                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                                    <p className="text-sm text-gray-900 dark:text-white">
                                        {event.maxParticipants ? `${event.registeredCount} of ${event.maxParticipants} seats taken` : `${event.registeredCount} going`}
                                        {event.waitlistCount > 0 && <span className={`block ${muted}`}>{event.waitlistCount} on the waiting list</span>}
                                        {event.isFull && <span className="block font-medium text-red-800 dark:text-red-300">Full</span>}
                                    </p>
                                </div>
                            )}
                            {event.tags.length > 0 && (
                                <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                                    {event.tags.map((t) => <li key={t} className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}>#{t}</li>)}
                                </ul>
                            )}
                        </div>
                        <div className="mt-5 border-t border-gray-200 pt-3 dark:border-neutral-800">
                            <ReportContentButton contentType="event" contentId={event._id} />
                        </div>
                    </section>
                </div>

                {viewer?.canManage && <div className="mt-6"><OrganizerPanel event={event} now={now} /></div>}
            </div>
        </div>
    );
}
