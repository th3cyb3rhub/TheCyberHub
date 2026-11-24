'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Briefcase, Building2, Eye, Loader2, MousePointerClick, Pencil, Plus, RotateCcw, Send, Trash2, XCircle } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DialogShell } from '@/components/events/DialogShell';
import { PageShell } from '@/components/events/PageShell';
import { btnPrimary, btnSecondary, card, chip, focusRing, muted } from '@/components/events/styles';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { useAuth } from '@/context/AuthContext';
import { useEmployerJobs, useJobAction, useMyCompany, useMyJobStats } from '@/hooks/queries/useJobs';
import { JOB_LIMITS, STATUS_LABELS } from '@/lib/jobs/constants';
import { countText, daysLeftText, effectiveStatus } from '@/lib/jobs/display';
import { expiryFromDays } from '@/lib/jobs/form';
import { isJobAdmin } from '@/lib/jobs/roles';
import { JOB_STATUSES, type EmployerJob, type JobStatus } from '@/types/job';
import { CompanyStatusChip, JobStatusChip } from '../StatusChips';
import { ErrorState, ListSkeleton } from '../ListStates';

type Filter = JobStatus | '';

const FILTERS: { id: Filter; name: string }[] = [{ id: '', name: 'All' }, ...JOB_STATUSES.map((s) => ({ id: s as Filter, name: STATUS_LABELS[s] }))];

const EMPTY_TEXT: Record<Filter, string> = {
    '': 'You have not posted a job yet.',
    draft: 'No drafts.',
    pending: 'Nothing is waiting for review.',
    approved: 'None of your jobs is live right now.',
    rejected: 'No job was rejected.',
    closed: 'No closed jobs.',
    expired: 'No job has expired.',
};

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
    return (
        <div className={`${card} flex items-center gap-3 p-4`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</p>
                <p className={`text-xs ${muted}`}>{label}</p>
            </div>
        </div>
    );
}

function CompanyCard() {
    const { data: company, isLoading, isError } = useMyCompany();
    if (isLoading) return <div className={`${card} h-20 animate-pulse`} aria-hidden="true" />;
    if (isError) return null;
    if (!company) {
        return (
            <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
                <p className="text-sm text-gray-800 dark:text-gray-200"><Building2 className="mr-2 inline h-4 w-4" aria-hidden="true" />Add your company profile before you post: it names the employer on every job.</p>
                <Link href="/employer/company" className={btnPrimary}>Create company profile</Link>
            </div>
        );
    }
    const note = company.status === 'rejected'
        ? `A reviewer rejected the profile${company.moderation?.reason ? `: ${company.moderation.reason}` : '.'} Fix it and save to send it back to review. You cannot post until then.`
        : company.status === 'pending'
            ? 'Your profile is waiting for review. Jobs you post are checked by a reviewer before they go live.'
            : 'Your company is verified: new jobs go live at once.';
    return (
        <div className={`${card} flex flex-wrap items-start justify-between gap-3 p-4`} data-testid="company-card">
            <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><Building2 className="h-4 w-4" aria-hidden="true" /><span className="break-words">{company.name}</span> <CompanyStatusChip status={company.status} /></p>
                <p className={`mt-1 text-sm ${muted}`}>{note}</p>
            </div>
            <Link href="/employer/company" className={btnSecondary}>{company.status === 'rejected' ? 'Fix the profile' : 'Edit profile'}</Link>
        </div>
    );
}

interface RowProps {
    job: EmployerJob;
    busy: boolean;
    onAction: (action: 'submit' | 'close', job: EmployerJob) => void;
    onReopen: (job: EmployerJob) => void;
    onDelete: (job: EmployerJob) => void;
}

function JobRow({ job, busy, onAction, onReopen, onDelete }: RowProps) {
    const status = job.status ?? 'draft';
    const shown = effectiveStatus({ status, expiresAt: job.expiresAt });
    const reopenable = status === 'closed' || status === 'expired';
    const left = status === 'approved' && shown === 'approved' ? daysLeftText(job.expiresAt) : null;
    const reason = status === 'rejected' ? job.moderation?.reason : null;
    const small = `${btnSecondary} !px-3 !py-1.5 !text-xs`;
    return (
        <li className={`${card} p-4 sm:p-5`} data-testid="employer-job" data-status={shown}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[min(100%,16rem)] flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <JobStatusChip status={shown} />
                        {left && <span className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-300`}>{left}</span>}
                    </div>
                    <h3 className="break-words text-base font-semibold text-gray-900 dark:text-white">
                        {shown === 'approved' ? <Link href={`/jobs/${job.slug || job._id}`} className={`rounded hover:underline ${focusRing}`}>{job.title}</Link> : <Link href={`/employer/edit/${job._id}`} className={`rounded hover:underline ${focusRing}`}>{job.title}</Link>}
                    </h3>
                    <p className={`mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${muted}`}>
                        <span>Posted <ViewerTime iso={job.createdAt} /></span>
                        <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden="true" />{countText(job.viewCount ?? 0, 'view')}</span>
                        <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />{countText(job.applicationCount ?? 0, 'apply click')}</span>
                    </p>
                    {status === 'pending' && <p className={`mt-2 text-sm ${muted}`}>A reviewer will look at this soon. You will be told when they decide.</p>}
                    {reason && (
                        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="reject-reason">
                            <span className="font-medium">Reviewer note:</span> <span className="break-words">{reason}</span>
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Actions for ${job.title}`}>
                    {status === 'rejected' && <Link href={`/employer/edit/${job._id}`} className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} data-testid="fix-resubmit"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Fix and resubmit</Link>}
                    {status === 'draft' && <button type="button" className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} disabled={busy} onClick={() => onAction('submit', job)} data-testid="submit-job"><Send className="h-3.5 w-3.5" aria-hidden="true" /> Send for review</button>}
                    {reopenable && <button type="button" className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} disabled={busy} onClick={() => onReopen(job)} data-testid="reopen-job"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reopen</button>}
                    {status !== 'rejected' && <Link href={`/employer/edit/${job._id}`} className={small}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit</Link>}
                    {!reopenable && <button type="button" className={small} disabled={busy} onClick={() => onAction('close', job)} data-testid="close-job"><XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Close</button>}
                    {(status === 'draft' || status === 'rejected' || reopenable) && (
                        <button type="button" className={`${small} !text-red-800 dark:!text-red-300`} disabled={busy} onClick={() => onDelete(job)} data-testid="delete-job"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete</button>
                    )}
                </div>
            </div>
        </li>
    );
}

/** The employer's home: their company, their numbers, and every job with what they can do next */
export function EmployerDashboard() {
    const { user } = useAuth();
    const admin = isJobAdmin(user?.role);
    const [filter, setFilter] = useState<Filter>('');
    const jobs = useEmployerJobs(filter);
    const stats = useMyJobStats();
    const action = useJobAction();
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [reopen, setReopen] = useState<EmployerJob | null>(null);
    const [days, setDays] = useState('30');
    const [removing, setRemoving] = useState<EmployerJob | null>(null);

    const rows = jobs.data?.pages.flatMap((p) => p.data) ?? [];
    const clicks = stats.data?.totalApplicationClicks ?? stats.data?.totalApplications ?? 0;
    const maxDays = admin ? 365 : JOB_LIMITS.maxExpiryDays;
    const dayOptions = [14, 30, 60, 90, 180, 365].filter((d) => d <= maxDays);

    const run = (act: 'submit' | 'close' | 'reopen' | 'delete', job: EmployerJob, expiresAt?: string) => {
        setPendingId(job._id);
        action.mutate({ action: act, id: job._id, expiresAt }, { onSettled: () => setPendingId(null) });
    };

    return (
        <PageShell
            title="Employer dashboard"
            subtitle="Your jobs, how they are doing, and what needs your attention."
            wide
            actions={<Link href="/employer/post" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> Post a job</Link>}
        >
            <div className="space-y-6">
                <CompanyCard />

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Your numbers">
                    <Stat icon={Briefcase} label="Jobs" value={stats.data?.totalJobs ?? '-'} />
                    <Stat icon={Briefcase} label="Live now" value={stats.data?.activeJobs ?? '-'} />
                    <Stat icon={Eye} label="Views" value={stats.data?.totalViews?.toLocaleString('en-US') ?? '-'} />
                    <Stat icon={MousePointerClick} label="Apply clicks" value={stats.data ? clicks.toLocaleString('en-US') : '-'} />
                </div>

                <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
                    {FILTERS.map((f) => {
                        const count = f.id ? stats.data?.byStatus?.[f.id] : stats.data?.totalJobs;
                        return (
                            <button
                                key={f.id || 'all'}
                                type="button"
                                aria-pressed={filter === f.id}
                                onClick={() => setFilter(f.id)}
                                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${filter === f.id ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}
                            >
                                {f.name}{typeof count === 'number' ? ` (${count})` : ''}
                            </button>
                        );
                    })}
                </div>

                {jobs.isLoading ? <ListSkeleton count={3} label="Loading your jobs" />
                    : jobs.isError ? <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} title="Could not load your jobs" />
                        : rows.length === 0 ? (
                            <div className={`${card} px-6 py-12 text-center`}>
                                <Briefcase className="mx-auto mb-3 h-8 w-8 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                                <p className="text-sm text-gray-800 dark:text-gray-200">{EMPTY_TEXT[filter]}</p>
                                {filter === '' && <Link href="/employer/post" className={`${btnPrimary} mt-4`}>Post your first job</Link>}
                            </div>
                        ) : (
                            <>
                                <ul className="space-y-3" aria-label="Your jobs">
                                    {rows.map((job) => (
                                        <JobRow
                                            key={job._id}
                                            job={job}
                                            busy={pendingId === job._id}
                                            onAction={(a, j) => run(a, j)}
                                            onReopen={(j) => { setDays('30'); setReopen(j); }}
                                            onDelete={setRemoving}
                                        />
                                    ))}
                                </ul>
                                {jobs.hasNextPage && (
                                    <div className="text-center">
                                        <button type="button" className={btnSecondary} onClick={() => void jobs.fetchNextPage()} disabled={jobs.isFetchingNextPage}>
                                            {jobs.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
            </div>

            <DialogShell
                open={!!reopen}
                onOpenChange={(o) => { if (!o) setReopen(null); }}
                title="Reopen this job"
                description={reopen ? `${reopen.title} gets a new end date. It goes through the same checks as a new job.` : undefined}
                footer={(
                    <>
                        <button type="button" className={btnSecondary} onClick={() => setReopen(null)}>Cancel</button>
                        <button
                            type="button"
                            className={btnPrimary}
                            data-testid="confirm-reopen"
                            onClick={() => { if (reopen) { run('reopen', reopen, expiryFromDays(Number(days))); setReopen(null); } }}
                        >Reopen</button>
                    </>
                )}
            >
                <label htmlFor="reopen-days" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">Keep it public for</label>
                <select id="reopen-days" value={days} onChange={(e) => setDays(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white">
                    {dayOptions.map((d) => <option key={d} value={String(d)}>{d} days from now</option>)}
                </select>
            </DialogShell>

            <ConfirmDialog
                open={!!removing}
                title="Delete this job?"
                description={removing ? `"${removing.title}" is removed for good. A closed job can be reopened later; a deleted one cannot.` : undefined}
                confirmText="Delete"
                onCancel={() => setRemoving(null)}
                onConfirm={() => { if (removing) { run('delete', removing); setRemoving(null); } }}
            />
        </PageShell>
    );
}
