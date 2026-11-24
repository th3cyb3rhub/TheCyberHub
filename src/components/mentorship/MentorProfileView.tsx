'use client';

import Link from 'next/link';
import { CalendarClock, Globe2, GraduationCap, Hourglass, ShieldCheck, Sparkles, Star, UserX } from 'lucide-react';
import { PageShell } from '@/components/events/PageShell';
import { useAuth } from '@/context/AuthContext';
import { useMentor, useMentorReviews, useMentorshipSummary } from '@/hooks/queries/useMentorship';
import { useViewerZone } from '@/lib/events/clock';
import { displayName, formatDate, requestBlockReason, spotsLabel } from '@/lib/mentorship/display';
import { isNotFound } from '@/lib/mentorship/errors';
import { slotView, sortSlots } from '@/lib/mentorship/time';
import type { Mentor } from '@/types/mentorship';
import { MentorshipNav } from './MentorshipNav';
import { Avatar, EmptyBlock, ErrorState, ExpertiseChips, LoadMore, MentorStatusChip, RatingStars, Skeleton } from './shared';
import { btnPrimary, btnSecondary, cardPad, muted } from './styles';

export function ProfileSkeleton() {
    return (
        <PageShell title="Mentor" backHref="/mentorship" backLabel="All mentors">
            <div className="space-y-4" role="status" aria-label="Loading the mentor">
                <div className={`${cardPad} flex gap-4`}><Skeleton className="h-16 w-16 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-1/3" /></div></div>
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
            </div>
        </PageShell>
    );
}

/** When the mentor is free, in the mentor's zone and in the viewer's */
export function AvailabilityList({ mentor, zone, now }: { mentor: Pick<Mentor, 'availability'>; zone: string | null; now: Date }) {
    const slots = sortSlots(mentor.availability.preferredTimes ?? []);
    if (slots.length === 0) {
        return <p className={`text-sm ${muted}`}>No fixed hours. Agree on times in the chat.</p>;
    }
    return (
        <ul className="space-y-2" data-testid="availability">
            {slots.map((slot, i) => {
                const v = slotView(slot, mentor.availability.timezone, zone, now);
                return (
                    <li key={`${slot.dayOfWeek}-${slot.startHour}-${i}`} className="text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">{v.mentor}</span>
                        {v.viewer && <span className={`block text-xs ${muted}`}>Your time: {v.viewer}</span>}
                    </li>
                );
            })}
        </ul>
    );
}

function Reviews({ id }: { id: string }) {
    const reviews = useMentorReviews(id);
    const rows = reviews.data?.pages.flatMap((p) => p.data) ?? [];
    return (
        <section aria-labelledby="reviews-heading" className={cardPad}>
            <h2 id="reviews-heading" className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Reviews</h2>
            {reviews.isLoading ? (
                <div className="space-y-3" role="status" aria-label="Loading reviews"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : reviews.isError ? (
                <ErrorState error={reviews.error} onRetry={() => reviews.refetch()} title="Could not load reviews" />
            ) : rows.length === 0 ? (
                <p className={`text-sm ${muted}`} data-testid="no-reviews">No reviews yet. Mentees can leave one when a mentorship ends.</p>
            ) : (
                <>
                    <ul className="space-y-4">
                        {rows.map((r, i) => (
                            <li key={`${r.createdAt}-${i}`} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0 dark:border-neutral-800">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <RatingStars rating={r.rating} />
                                    <span className={`text-xs ${muted}`}>{r.menteeFirstName ? `${r.menteeFirstName}, ` : ''}{formatDate(r.createdAt)}</span>
                                </div>
                                {r.comment && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">{r.comment}</p>}
                            </li>
                        ))}
                    </ul>
                    <LoadMore hasNext={!!reviews.hasNextPage} loading={reviews.isFetchingNextPage} onClick={() => reviews.fetchNextPage()} label="Show more reviews" />
                </>
            )}
        </section>
    );
}

function RequestPanel({ mentor }: { mentor: Mentor }) {
    const { user, loading } = useAuth();
    const summary = useMentorshipSummary();
    const own = !!user && mentor.user._id === user.id;
    const reason = requestBlockReason(mentor, user?.id ?? null, !!summary.data?.openRequest);
    const href = `/mentorship/request?mentor=${mentor._id}`;
    return (
        <aside className={cardPad} aria-label="Request mentorship" data-testid="request-panel">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{spotsLabel(mentor)} <span className={`font-normal ${muted}`}>of {mentor.maxMentees}</span></p>
            {loading ? <Skeleton className="mt-4 h-10 w-full" /> : !user ? (
                <Link href={`/auth?redirect=${encodeURIComponent(`/mentorship/mentor/${mentor._id}`)}`} className={`${btnPrimary} mt-4 w-full`}>Sign in to request</Link>
            ) : own ? (
                <Link href="/mentorship/my-profile" className={`${btnSecondary} mt-4 w-full`}>Edit my mentor profile</Link>
            ) : reason ? (
                <>
                    <button type="button" className={`${btnPrimary} mt-4 w-full`} disabled aria-describedby="request-reason">Request mentorship</button>
                    <p id="request-reason" className={`mt-2 text-sm ${muted}`} data-testid="request-reason">{reason}</p>
                    {summary.data?.openRequest && <Link href="/mentorship/requests" className="mt-2 inline-block text-sm font-medium text-orange-800 underline dark:text-orange-400">See your request</Link>}
                </>
            ) : (
                <Link href={href} className={`${btnPrimary} mt-4 w-full`}><Sparkles className="h-4 w-4" aria-hidden="true" /> Request mentorship</Link>
            )}
            <p className={`mt-3 text-xs ${muted}`}>The mentor sees your goals and username, and your name once they accept.</p>
        </aside>
    );
}

export function MentorProfileView({ id, initial }: { id: string; initial?: Mentor | null }) {
    const query = useMentor(id, initial);
    const zone = useViewerZone();
    const now = new Date();

    if (query.isLoading) return <ProfileSkeleton />;
    if (query.isError) {
        return (
            <PageShell title="Mentor" backHref="/mentorship" backLabel="All mentors">
                {isNotFound(query.error)
                    ? <EmptyBlock icon={UserX} title="This mentor is not available" action={<Link href="/mentorship" className={btnPrimary}>Find another mentor</Link>}>The profile may not be listed, or it may have been removed.</EmptyBlock>
                    : <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load this mentor" />}
            </PageShell>
        );
    }
    const mentor = query.data;
    if (!mentor) return <ProfileSkeleton />;
    const name = displayName(mentor.user);

    return (
        <PageShell title={name} subtitle={`@${mentor.user.username}`} backHref="/mentorship" backLabel="All mentors" wide>
            <MentorshipNav />
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
                <div className="space-y-6">
                    <section className={`${cardPad} flex flex-wrap items-center gap-4`}>
                        <Avatar person={mentor.user} size={64} />
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <RatingStars rating={mentor.rating} total={mentor.totalRatings} size="md" />
                                {mentor.status && mentor.status !== 'approved' && <MentorStatusChip status={mentor.status} />}
                                {mentor.isPaused && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">Paused</span>}
                                {mentor.isVerified && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-500/15 dark:text-green-300"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verified</span>}
                                {mentor.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-900 dark:bg-yellow-500/15 dark:text-yellow-300"><Star className="h-3 w-3" aria-hidden="true" /> Featured</span>}
                            </div>
                            <ExpertiseChips areas={mentor.expertiseAreas} className="mt-3" />
                        </div>
                    </section>

                    <section aria-labelledby="about-heading" className={cardPad}>
                        <h2 id="about-heading" className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">About</h2>
                        <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">{mentor.bio}</p>
                        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                            <div><dt className={`flex items-center gap-1.5 text-xs ${muted}`}><GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> Mentorships completed</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{mentor.completedMentorships}</dd></div>
                            <div><dt className={`flex items-center gap-1.5 text-xs ${muted}`}><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Sessions held</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{mentor.totalSessionsCompleted}</dd></div>
                            <div><dt className={`flex items-center gap-1.5 text-xs ${muted}`}><Hourglass className="h-3.5 w-3.5" aria-hidden="true" /> Hours per week</dt><dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{mentor.availability.hoursPerWeek}</dd></div>
                        </dl>
                    </section>

                    <section aria-labelledby="availability-heading" className={cardPad}>
                        <h2 id="availability-heading" className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Availability</h2>
                        <p className={`mb-3 flex items-center gap-1.5 text-sm ${muted}`}><Globe2 className="h-4 w-4" aria-hidden="true" /> Hours are in the mentor&apos;s time zone ({mentor.availability.timezone}){zone ? `, shown in yours (${zone}) when they differ` : ''}.</p>
                        <AvailabilityList mentor={mentor} zone={zone} now={now} />
                    </section>

                    <Reviews id={mentor._id} />
                </div>
                <div className="lg:sticky lg:top-24 lg:self-start"><RequestPanel mentor={mentor} /></div>
            </div>
        </PageShell>
    );
}
