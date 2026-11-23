import { Ban, CheckCircle2, Clock, Hourglass, XCircle } from 'lucide-react';
import type { EventStatus } from '@/types/event';
import { chip } from './styles';

const STYLES: Record<EventStatus, { label: string; className: string; icon?: React.ElementType }> = {
    pending: { label: 'Waiting for review', className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: Hourglass },
    upcoming: { label: 'Upcoming', className: 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300', icon: Clock },
    live: { label: 'Live now', className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300' },
    ended: { label: 'Ended', className: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300', icon: CheckCircle2 },
    cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300', icon: Ban },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300', icon: XCircle },
};

export function StatusBadge({ status, className = '' }: { status: EventStatus; className?: string }) {
    const s = STYLES[status];
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-status={status}>
            {status === 'live' ? (
                <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                </span>
            ) : Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
            {s.label}
        </span>
    );
}
