'use client';

import Link from 'next/link';
import { BellRing, CalendarClock, MessageSquare, Sparkles, Star } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useMentorshipSummary } from '@/hooks/queries/useMentorship';
import { useViewerZone } from '@/lib/events/clock';
import { sessionTimes } from '@/lib/mentorship/time';
import { Skeleton } from './shared';
import { card } from './styles';

/** What needs the member now, from the one summary call. Renders nothing when there is nothing to do. */
export function NeedsYou() {
    const { user } = useAuth();
    const summary = useMentorshipSummary();
    const zone = useViewerZone();
    if (!user) return null;
    if (summary.isLoading) return <Skeleton className="mb-8 h-24 w-full" />;
    const data = summary.data;
    if (!data) return null;

    const items: { key: string; icon: React.ElementType; text: string; href: string; action: string }[] = [];
    if (data.pendingInvites > 0) items.push({ key: 'invites', icon: BellRing, text: `${data.pendingInvites} ${data.pendingInvites === 1 ? 'person asked' : 'people asked'} you to mentor`, href: '/mentorship/requests', action: 'Answer' });
    if (data.unreadMessages > 0) items.push({ key: 'unread', icon: MessageSquare, text: `${data.unreadMessages} unread ${data.unreadMessages === 1 ? 'message' : 'messages'}`, href: '/mentorship/dashboard', action: 'Read' });
    if (data.pendingFeedback > 0) items.push({ key: 'feedback', icon: Star, text: `${data.pendingFeedback} ${data.pendingFeedback === 1 ? 'session is' : 'sessions are'} waiting for your feedback`, href: '/mentorship/dashboard', action: 'Give feedback' });
    if (data.nextSession) {
        const t = sessionTimes(data.nextSession.scheduledAt, data.nextSession.timezone, zone);
        items.push({ key: 'next', icon: CalendarClock, text: `Next session: ${data.nextSession.title}, ${t.primary}`, href: `/mentorship/${data.nextSession.mentorship}?tab=sessions`, action: 'Open' });
    }
    if (data.openRequest) items.push({ key: 'request', icon: Sparkles, text: data.openRequest.status === 'pending' ? 'Your request is looking for a mentor' : 'Your request is waiting for a mentor to answer', href: '/mentorship/requests', action: 'See request' });
    if (items.length === 0) return null;

    return (
        <section aria-label="Needs your attention" className={`${card} mb-8 divide-y divide-gray-100 dark:divide-neutral-800`} data-testid="needs-you">
            {items.map(({ key, icon: Icon, text, href, action }) => (
                <div key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <p className="flex items-center gap-2.5 text-sm text-gray-800 dark:text-gray-200"><Icon className="h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />{text}</p>
                    <Link href={href} className="text-sm font-medium text-orange-800 hover:underline dark:text-orange-400">{action}</Link>
                </div>
            ))}
        </section>
    );
}
