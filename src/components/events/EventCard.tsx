'use client';

import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, CalendarDays, CheckCircle2, MapPin, Presentation, Star, Users, Video, Hourglass } from 'lucide-react';
import { availability, safeHref } from '@/lib/events/display';
import { CATEGORY_LABELS, FORMAT_LABELS } from '@/lib/events/form';
import { effectiveStatus, toLocalParts } from '@/lib/events/time';
import type { EventSummary } from '@/types/event';
import { EventTimes } from './EventTimes';
import { StatusBadge } from './StatusBadge';
import { card, chip, muted } from './styles';

const AVAILABILITY_STYLE = {
    full: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300',
    waitlist: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
    few: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
    spots: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300',
    going: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300',
    open: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300',
} as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function DateBadge({ event }: { event: EventSummary }) {
    const { date } = toLocalParts(event.startDate, event.timezone);
    const [, month, day] = date.split('-');
    return (
        <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-center dark:border-neutral-700 dark:bg-neutral-800" aria-hidden="true">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">{MONTHS[Number(month) - 1]}</span>
            <span className="text-lg font-bold leading-none text-gray-900 dark:text-white">{Number(day)}</span>
        </div>
    );
}

interface EventCardProps {
    event: EventSummary;
    /** The current time, once mounted. Without it the status the API sent is shown. */
    now?: Date | null;
    /** Actions or notes under the card body (my events, the review queue) */
    footer?: React.ReactNode;
    featured?: boolean;
    /** Link target; defaults to the public page */
    href?: string;
}

export function EventCard({ event, now = null, footer, featured = false, href }: EventCardProps) {
    const status = now ? effectiveStatus(event, now) : event.status;
    const open = status === 'upcoming' || status === 'live';
    const avail = availability(event);
    const image = safeHref(event.image || event.bannerImage);
    const viewer = event.viewer;
    const link = href ?? `/events/${event.slug}`;

    return (
        <article className={`${card} group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md ${featured ? 'md:flex-row' : ''}`} data-testid="event-card">
            <div className={`relative shrink-0 overflow-hidden bg-gray-100 dark:bg-neutral-800 ${featured ? (image ? 'aspect-[16/9] md:aspect-auto md:w-2/5' : 'h-24 md:h-auto md:w-2/5') : (image ? 'aspect-[16/9]' : 'h-24')}`}>
                {image ? (
                    <Image src={image} alt="" fill sizes={featured ? '(min-width: 768px) 40vw, 100vw' : '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'} className="object-cover" unoptimized />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-100 to-gray-100 dark:from-orange-950 dark:to-neutral-900" aria-hidden="true">
                        <CalendarDays className="h-10 w-10 text-orange-700/60 dark:text-orange-400/50" />
                    </div>
                )}
                <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                    {(status === 'live' || status === 'cancelled' || status === 'ended') && <StatusBadge status={status} />}
                    {event.isFeatured && (
                        <span className={`${chip} bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-300`}>
                            <Star className="h-3 w-3" aria-hidden="true" /> Featured
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                    <DateBadge event={event} />
                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{CATEGORY_LABELS[event.category] ?? event.category}</span>
                            <span className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}>{FORMAT_LABELS[event.locationType]}</span>
                            {event.eventType === 'official' && (
                                <span className={`${chip} bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300`}><BadgeCheck className="h-3 w-3" aria-hidden="true" /> Official</span>
                            )}
                        </div>
                        <h3 className="text-base font-semibold leading-snug text-gray-900 dark:text-white">
                            <Link href={link} className="rounded after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
                                {event.title}
                            </Link>
                        </h3>
                    </div>
                </div>

                {event.shortDescription && <p className={`line-clamp-2 text-sm ${muted}`}>{event.shortDescription}</p>}

                <EventTimes event={event} compact />

                <p className={`flex items-center gap-1.5 text-sm ${muted}`}>
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{event.location || FORMAT_LABELS[event.locationType]}</span>
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                    {open && (
                        <span className={`${chip} ${AVAILABILITY_STYLE[avail.kind]}`} data-testid="availability">
                            <Users className="h-3 w-3" aria-hidden="true" /> {avail.label}
                        </span>
                    )}
                    {viewer?.registered && (
                        <span className={`${chip} bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300`}>
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> {viewer.attended ? 'You attended' : 'You are registered'}
                        </span>
                    )}
                    {viewer?.waitlisted && (
                        <span className={`${chip} bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300`}>
                            <Hourglass className="h-3 w-3" aria-hidden="true" /> Waitlist{viewer.position ? ` #${viewer.position}` : ''}
                        </span>
                    )}
                    {status === 'ended' && event.hasRecording && (
                        <span className={`${chip} bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300`}><Video className="h-3 w-3" aria-hidden="true" /> Recording</span>
                    )}
                    {status === 'ended' && event.hasSlides && (
                        <span className={`${chip} bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-300`}><Presentation className="h-3 w-3" aria-hidden="true" /> Slides</span>
                    )}
                    {status === 'ended' && event.ratingCount > 0 && event.averageRating !== null && (
                        <span className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}>
                            <Star className="h-3 w-3" aria-hidden="true" /> {event.averageRating.toFixed(1)} ({event.ratingCount})
                        </span>
                    )}
                </div>
            </div>
            {footer && <div className="relative z-10 border-t border-gray-200 p-3 dark:border-neutral-800">{footer}</div>}
        </article>
    );
}

export function EventCardSkeleton() {
    return (
        <div className={`${card} overflow-hidden`} aria-hidden="true">
            <div className="aspect-[16/9] animate-pulse bg-gray-200 dark:bg-neutral-800" />
            <div className="space-y-3 p-4">
                <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="h-5 w-4/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="h-4 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="h-4 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
            </div>
        </div>
    );
}
