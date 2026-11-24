'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarClock, GraduationCap, MessageSquare, Sparkles, Star, Users } from 'lucide-react';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { useAuth } from '@/context/AuthContext';
import { useMentorships, useMentorshipSummary, usePendingFeedback } from '@/hooks/queries/useMentorship';
import { useViewerZone } from '@/lib/events/clock';
import { displayName } from '@/lib/mentorship/display';
import { formatMoment } from '@/lib/mentorship/time';
import type { Mentorship } from '@/types/mentorship';
import { MentorshipNav } from './MentorshipNav';
import { NeedsYou } from './NeedsYou';
import { Avatar, EmptyBlock, ErrorState, ExpertiseChips, LoadMore, MentorshipStatusChip, RowSkeleton } from './shared';
import { btnPrimary, btnSecondary, card, cardPad, muted } from './styles';

export function MentorshipCard({ mentorship, viewerId }: { mentorship: Mentorship; viewerId: string | null }) {
    const partner = mentorship.viewer.role === 'mentor' ? mentorship.mentee : mentorship.mentor;
    const open = mentorship.status === 'active' || mentorship.status === 'paused';
    return (
        <li className={`${card} relative p-5 transition-shadow hover:shadow-md`} data-testid="mentorship-card" data-status={mentorship.status} data-viewer={viewerId ?? ''}>
            <div className="flex items-start gap-3">
                <Avatar person={partner} size={44} />
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                        <Link href={`/mentorship/${mentorship._id}`} className="rounded after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{displayName(partner)}</Link>
                    </h3>
                    <p className={`text-xs ${muted}`}>{mentorship.viewer.role === 'mentor' ? 'You mentor them' : 'Your mentor'}{open ? ` · ${mentorship.daysRemaining} days left` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                    {mentorship.unreadMessages > 0 && <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-orange-700 px-1.5 text-xs font-semibold text-white" aria-label={`${mentorship.unreadMessages} unread messages`}>{mentorship.unreadMessages}</span>}
                    <MentorshipStatusChip status={mentorship.status} />
                </div>
            </div>
            {mentorship.goals && <p className="mt-3 line-clamp-2 text-sm text-gray-700 dark:text-gray-300">{mentorship.goals}</p>}
            <ExpertiseChips areas={mentorship.expertiseAreas} max={3} className="mt-3" />
            <p className={`mt-3 text-xs ${muted}`}>{mentorship.sessionsCompleted} {mentorship.sessionsCompleted === 1 ? 'session' : 'sessions'} held</p>
        </li>
    );
}

function Section({ title, icon: Icon, rows, empty, viewerId }: { title: string; icon: React.ElementType; rows: Mentorship[]; empty: React.ReactNode; viewerId: string | null }) {
    return (
        <section aria-label={title} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Icon className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> {title}</h2>
            {rows.length === 0 ? empty : <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">{rows.map((m) => <MentorshipCard key={m._id} mentorship={m} viewerId={viewerId} />)}</ul>}
        </section>
    );
}

function Tile({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
    return (
        <div className={`${cardPad} !p-4`}>
            <dt className={`flex items-center gap-1.5 text-xs ${muted}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}</dt>
            <dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{value}</dd>
        </div>
    );
}

export function DashboardView() {
    const { ready } = useRequireLogin('/mentorship/dashboard');
    const { user } = useAuth();
    const [filter, setFilter] = useState<'open' | 'all'>('open');
    const list = useMentorships({ status: filter }, ready);
    const summary = useMentorshipSummary(ready);
    const pending = usePendingFeedback(ready);
    const zone = useViewerZone();

    if (!ready) return <FullPageSpinner />;
    const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
    const asMentee = rows.filter((m) => m.viewer.role === 'mentee');
    const asMentor = rows.filter((m) => m.viewer.role === 'mentor');
    const s = summary.data;

    return (
        <PageShell wide title="My mentorships" subtitle="Your mentors, your mentees and what is coming up." backHref="/mentorship" backLabel="All mentors">
            <MentorshipNav />
            <NeedsYou />
            {s && (
                <dl className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
                    <Tile icon={Users} label="Active mentorships" value={s.activeMentorships} />
                    <Tile icon={MessageSquare} label="Unread messages" value={s.unreadMessages} />
                    <Tile icon={Star} label="Feedback to give" value={s.pendingFeedback} />
                    <Tile icon={CalendarClock} label="Next session" value={s.nextSession ? formatMoment(s.nextSession.scheduledAt, zone ?? 'UTC') : 'None planned'} />
                </dl>
            )}

            {pending.data && pending.data.length > 0 && (
                <section aria-label="Sessions waiting for your feedback" className={`${card} mb-8 p-4`} data-testid="pending-feedback">
                    <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Sessions waiting for your feedback</h2>
                    <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
                        {pending.data.map((session) => (
                            <li key={session._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                <span className="text-gray-800 dark:text-gray-200">{session.title} <span className={muted}>· {formatMoment(session.scheduledAt, zone ?? 'UTC')}</span></span>
                                <Link href={`/mentorship/${session.mentorship}?tab=sessions`} className="font-medium text-orange-800 hover:underline dark:text-orange-400">Rate it</Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="mb-4 flex gap-2" role="group" aria-label="Show">
                {([['open', 'Current'], ['all', 'Including finished']] as const).map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={`rounded-full border px-3 py-1 text-sm ${filter === v ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200'}`}>{l}</button>
                ))}
            </div>

            {list.isLoading ? <RowSkeleton count={3} label="Loading your mentorships" /> : list.isError ? (
                <ErrorState error={list.error} onRetry={() => list.refetch()} title="Could not load your mentorships" />
            ) : (
                <>
                    <Section title="As a mentee" icon={Sparkles} rows={asMentee} viewerId={user?.id ?? null}
                        empty={<EmptyBlock icon={Sparkles} title="You do not have a mentor yet" action={<Link href="/mentorship" className={btnPrimary}>Find a mentor</Link>}>Browse mentors, or let us match you with one.</EmptyBlock>} />
                    <Section title="As a mentor" icon={GraduationCap} rows={asMentor} viewerId={user?.id ?? null}
                        empty={<EmptyBlock icon={GraduationCap} title="You are not mentoring anyone yet" action={<Link href="/mentorship/become-mentor" className={btnSecondary}>Become a mentor</Link>}>When you accept a request, the mentorship shows up here.</EmptyBlock>} />
                    <LoadMore hasNext={!!list.hasNextPage} loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()} />
                </>
            )}
        </PageShell>
    );
}
