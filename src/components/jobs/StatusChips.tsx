import { Ban, CheckCircle2, FileEdit, Hourglass, ShieldCheck, TimerOff, XCircle } from 'lucide-react';
import { chip } from '@/components/events/styles';
import { ADMIN_STATUS_LABELS, STATUS_LABELS } from '@/lib/jobs/constants';
import type { CompanyStatus, JobStatus } from '@/types/job';

type Style = { className: string; icon: React.ElementType };

/** Colour never carries the meaning alone: every chip has an icon and a word */
const JOB_STYLES: Record<JobStatus, Style> = {
    draft: { className: 'bg-gray-200 text-gray-900 dark:bg-neutral-700/60 dark:text-gray-200', icon: FileEdit },
    pending: { className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: Hourglass },
    approved: { className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300', icon: CheckCircle2 },
    rejected: { className: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300', icon: XCircle },
    closed: { className: 'bg-slate-200 text-slate-900 dark:bg-slate-500/20 dark:text-slate-200', icon: Ban },
    expired: { className: 'bg-orange-100 text-orange-950 dark:bg-orange-500/15 dark:text-orange-300', icon: TimerOff },
};

const COMPANY_STYLES: Record<CompanyStatus, Style> = {
    pending: JOB_STYLES.pending,
    verified: { className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300', icon: ShieldCheck },
    rejected: JOB_STYLES.rejected,
};

const COMPANY_LABELS: Record<CompanyStatus, string> = { pending: 'Under review', verified: 'Verified', rejected: 'Rejected' };

/** The status of a job. `audience` picks the words: the poster reads "Under review", a reviewer "Waiting for review". */
export function JobStatusChip({ status, audience = 'poster', className = '' }: { status: JobStatus; audience?: 'poster' | 'reviewer'; className?: string }) {
    const s = JOB_STYLES[status] ?? JOB_STYLES.draft;
    const Icon = s.icon;
    const words = audience === 'reviewer' ? ADMIN_STATUS_LABELS : STATUS_LABELS;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-status={status} data-testid="job-status">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {words[status] ?? status}
        </span>
    );
}

export function CompanyStatusChip({ status, className = '' }: { status: CompanyStatus; className?: string }) {
    const s = COMPANY_STYLES[status] ?? COMPANY_STYLES.pending;
    const Icon = s.icon;
    return (
        <span className={`${chip} ${s.className} ${className}`} data-status={status} data-testid="company-status">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {COMPANY_LABELS[status] ?? status}
        </span>
    );
}
