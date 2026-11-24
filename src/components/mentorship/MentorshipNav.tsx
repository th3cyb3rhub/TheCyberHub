'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useMentorshipSummary } from '@/hooks/queries/useMentorship';
import { CountBadge } from './shared';
import { focusRing } from './styles';

/** Links between the mentorship pages. Badges come from the one summary call. */
export function MentorshipNav() {
    const { user } = useAuth();
    const pathname = usePathname();
    const summary = useMentorshipSummary();
    const data = summary.data;

    const items = [
        { href: '/mentorship', label: 'Find a mentor', count: 0, countLabel: '' },
        ...(user ? [
            { href: '/mentorship/dashboard', label: 'My mentorships', count: data?.unreadMessages ?? 0, countLabel: 'unread messages' },
            { href: '/mentorship/requests', label: 'Requests', count: data?.pendingInvites ?? 0, countLabel: 'requests waiting for you' },
            { href: '/mentorship/my-profile', label: 'Mentor profile', count: 0, countLabel: '' },
        ] : []),
    ];

    return (
        <nav aria-label="Mentorship" className="mb-8 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900/60">
            {items.map((item) => {
                const current = item.href === '/mentorship' ? pathname === '/mentorship' || pathname.startsWith('/mentorship/mentor/') : pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={current ? 'page' : undefined}
                        className={`inline-flex items-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${focusRing} ${current ? 'bg-orange-700 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-800'}`}
                    >
                        {item.label}
                        <CountBadge count={item.count} label={item.countLabel} />
                    </Link>
                );
            })}
        </nav>
    );
}
