import { Ban, CheckCircle2, Clock, FileEdit, Hourglass, Play, Search, Trophy, Undo2, XCircle } from 'lucide-react';
import { chip } from '@/components/events/styles';
import { APPLICATION_STATUS_LABELS, COHORT_STATUS_LABELS } from '@/lib/internships/display';
import type { ApplicationStatus, CohortStatus } from '@/types/internship';

type Style = { className: string; icon: React.ElementType };

/** Colour never carries the meaning alone: every badge has an icon and a word */
const COHORT_STYLES: Record<CohortStatus, Style> = {
    draft: { className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: FileEdit },
    open: { className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300', icon: CheckCircle2 },
    closed: { className: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300', icon: Ban },
    'in-progress': { className: 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300', icon: Play },
    completed: { className: 'bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-300', icon: Trophy },
};

const APPLICATION_STYLES: Record<ApplicationStatus, Style> = {
    pending: { className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: Hourglass },
    reviewing: { className: 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300', icon: Search },
    accepted: { className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300', icon: CheckCircle2 },
    rejected: { className: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300', icon: XCircle },
    withdrawn: { className: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300', icon: Undo2 },
};

export function CohortStatusBadge({ status, className = '' }: { status: CohortStatus; className?: string }) {
    const s = COHORT_STYLES[status] ?? COHORT_STYLES.closed;
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-status={status}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {COHORT_STATUS_LABELS[status] ?? status}
        </span>
    );
}

export function ApplicationStatusBadge({ status, className = '' }: { status: ApplicationStatus; className?: string }) {
    const s = APPLICATION_STYLES[status] ?? APPLICATION_STYLES.pending;
    const Icon = s.icon ?? Clock;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-status={status}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {APPLICATION_STATUS_LABELS[status] ?? status}
        </span>
    );
}
