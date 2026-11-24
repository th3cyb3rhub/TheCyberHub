'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCheck, ChevronLeft, ChevronRight, Flag, Hourglass, Inbox, Search, ShieldCheck, Briefcase, X } from 'lucide-react';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { TabBar } from '@/components/events/TabBar';
import { btnPrimary, btnSecondary, card, input, muted } from '@/components/events/styles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useDebounce } from '@/hooks/useDebounce';
import {
    useAdminCompanies, useAdminJobs, useAdminStats, useApproveCompany, useApproveJob, useBulkApprove, useCloseJob, useDismissReports, useRejectCompany, useRejectJob,
    type BulkOutcome,
} from '@/hooks/queries/useJobs';
import { ADMIN_STATUS_LABELS, COMPANY_STATUS_LABELS, JOB_LIMITS } from '@/lib/jobs/constants';
import { countText } from '@/lib/jobs/display';
import { isJobAdmin, isJobReviewer } from '@/lib/jobs/roles';
import { JOB_STATUSES, type AdminCompany, type AdminJobStatusFilter, type CompanyStatus, type Job } from '@/types/job';
import { ErrorState, ListSkeleton } from '../ListStates';
import { AdminCompanyRow, AdminJobRow } from './AdminRows';
import { ReasonDialog } from './ReasonDialog';

type Tab = 'queue' | 'reported' | 'all' | 'companies';

function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number | string; tone?: 'alert' }) {
    return (
        <div className={`${card} flex items-center gap-3 p-4`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone === 'alert' ? 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white" data-testid={`admin-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</p>
                <p className={`text-xs ${muted}`}>{label}</p>
            </div>
        </div>
    );
}

type RejectTarget = { kind: 'job'; job: Job } | { kind: 'company'; company: AdminCompany };

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
    if (totalPages <= 1) return null;
    return (
        <nav className="flex items-center justify-between gap-3" aria-label="Pages">
            <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button>
            <span className={`text-sm ${muted}`}>Page {page} of {totalPages}</span>
            <button type="button" className={btnSecondary} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </nav>
    );
}

function Review({ viewerId, canClose }: { viewerId: string | null; canClose: boolean }) {
    const [tab, setTab] = useState<Tab>('queue');
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState<AdminJobStatusFilter>('all');
    const [companyStatus, setCompanyStatus] = useState<CompanyStatus | 'all'>('pending');
    const [search, setSearch] = useState('');
    const q = useDebounce(search.trim(), 350);
    // The job's title (for the summary) and the `updatedAt` its row showed (the decision is bound to it)
    const [selected, setSelected] = useState<Record<string, { title: string; updatedAt?: string }>>({});
    const [bulkOpen, setBulkOpen] = useState(false);
    const [outcomes, setOutcomes] = useState<BulkOutcome[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [rejecting, setRejecting] = useState<RejectTarget | null>(null);
    const [closing, setClosing] = useState<Job | null>(null);

    const stats = useAdminStats();
    const jobsEnabled = tab !== 'companies';
    const filters = tab === 'queue' ? { status: 'pending' as const, sort: 'oldest' as const, page }
        : tab === 'reported' ? { reported: true, status: 'all' as const, sort: 'reports' as const, page }
            : { status, q: q || undefined, sort: 'newest' as const, page };
    const jobs = useAdminJobs(filters, jobsEnabled);
    const companies = useAdminCompanies({ status: companyStatus, q: q || undefined, page }, tab === 'companies');
    const active = tab === 'companies' ? companies : jobs;

    const approve = useApproveJob();
    const reject = useRejectJob();
    const dismiss = useDismissReports();
    const bulk = useBulkApprove();
    const closeJob = useCloseJob();
    const approveCompany = useApproveCompany();
    const rejectCompany = useRejectCompany();

    const rows = jobs.data?.data ?? [];
    const companyRows = companies.data?.data ?? [];
    const pagination = active.data?.pagination;
    const totalPages = pagination?.totalPages ?? 1;

    // Deciding the last row of a page leaves it empty: step back to the page that still has rows
    useEffect(() => {
        if (page > 1 && pagination && page > Math.max(1, pagination.totalPages)) setPage(Math.max(1, pagination.totalPages));
    }, [page, pagination]);

    const change = (fn: () => void) => { fn(); setPage(1); setSelected({}); setOutcomes(null); };
    const switchTab = (id: string) => change(() => { setTab(id as Tab); setSearch(''); });

    const pendingCount = stats.data?.jobs?.pending ?? 0;
    const tabs = [
        { id: 'queue', label: 'Waiting for review', count: pendingCount },
        { id: 'reported', label: 'Reported', count: stats.data?.reported ?? 0 },
        { id: 'all', label: 'All jobs' },
        { id: 'companies', label: 'Companies', count: stats.data?.pendingCompanies ?? 0 },
    ];

    const run = (id: string, fn: (done: () => void) => void) => { setBusyId(id); fn(() => setBusyId(null)); };
    const selectedIds = Object.keys(selected);
    const isOwn = (j: Job) => !!viewerId && (typeof j.postedBy === 'string' ? j.postedBy : j.postedBy?._id) === viewerId;
    const selectableRows = rows.filter((j) => !isOwn(j));
    const allOnPageSelected = selectableRows.length > 0 && selectableRows.every((j) => selected[j._id]);
    const selectable = tab === 'queue';

    const onRejectSubmit = async (reason: string) => {
        if (!rejecting) return;
        if (rejecting.kind === 'job') await reject.mutateAsync({ id: rejecting.job._id, reason, title: rejecting.job.title, updatedAt: rejecting.job.updatedAt });
        else await rejectCompany.mutateAsync({ id: rejecting.company._id, reason, name: rejecting.company.name, updatedAt: rejecting.company.updatedAt });
    };

    const onCloseSubmit = async (reason: string) => {
        if (!closing) return;
        await closeJob.mutateAsync({ id: closing._id, reason: reason || undefined, title: closing.title });
    };

    const runBulk = () => {
        const items = selectedIds.map((id) => ({ id, title: selected[id].title, updatedAt: selected[id].updatedAt }));
        setBulkOpen(false);
        bulk.mutate({ items }, { onSuccess: (result) => { setOutcomes(result); setSelected({}); } });
    };

    const failed = outcomes?.filter((o) => !o.ok) ?? [];
    const emptyText = tab === 'queue' ? 'The queue is empty. Nothing is waiting for review.'
        : tab === 'reported' ? 'No job has an open report.'
            : tab === 'companies' ? 'No company matches.' : 'No job matches.';

    return (
        <div className="space-y-6">
            {stats.data && !stats.data.moderationEnabled && (
                <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="moderation-off">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p><strong>The review queue is switched off.</strong> Every new or edited job is published at once and nothing waits here. Reports still hold a job, and you can still reject a live job.</p>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Review numbers">
                <Stat icon={Hourglass} label="Waiting for review" value={stats.data ? pendingCount : '-'} />
                <Stat icon={Flag} label="Reported" value={stats.data?.reported ?? '-'} tone={stats.data?.reported ? 'alert' : undefined} />
                <Stat icon={Briefcase} label="Live" value={stats.data?.live ?? '-'} />
                <Stat icon={ShieldCheck} label="Companies waiting" value={stats.data?.pendingCompanies ?? '-'} />
            </div>
            {stats.isError && <p className={`text-sm ${muted}`} role="status">The counters could not be loaded. The lists below still work.</p>}

            <TabBar tabs={tabs} active={tab} onChange={switchTab} label="Review sections" idPrefix="jobs-admin" />

            <div id="jobs-admin-panel" role="tabpanel" aria-labelledby={`jobs-admin-${tab}`} className="space-y-4">
                {(tab === 'all' || tab === 'companies') && (
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="relative min-w-[12rem] flex-1">
                            <label htmlFor="admin-search" className="sr-only">{tab === 'companies' ? 'Search companies' : 'Search jobs'}</label>
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                            <input
                                id="admin-search"
                                type="search"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value.slice(0, JOB_LIMITS.searchMax)); setPage(1); }}
                                placeholder={tab === 'companies' ? 'Search by company name' : 'Search by title or company'}
                                className={`${input} pl-9`}
                            />
                        </div>
                        <div>
                            <label htmlFor="admin-status" className="sr-only">Status</label>
                            {tab === 'all' ? (
                                <select id="admin-status" className={`${input} cursor-pointer`} value={status} onChange={(e) => change(() => setStatus(e.target.value as AdminJobStatusFilter))}>
                                    <option value="all">Every status</option>
                                    {JOB_STATUSES.map((s) => <option key={s} value={s}>{ADMIN_STATUS_LABELS[s]}</option>)}
                                </select>
                            ) : (
                                <select id="admin-status" className={`${input} cursor-pointer`} value={companyStatus} onChange={(e) => change(() => setCompanyStatus(e.target.value as CompanyStatus | 'all'))}>
                                    <option value="all">Every status</option>
                                    {(Object.keys(COMPANY_STATUS_LABELS) as CompanyStatus[]).map((s) => <option key={s} value={s}>{COMPANY_STATUS_LABELS[s]}</option>)}
                                </select>
                            )}
                        </div>
                    </div>
                )}

                {selectable && rows.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-orange-600"
                                checked={allOnPageSelected}
                                onChange={(e) => setSelected(e.target.checked ? Object.fromEntries(rows.filter((j) => !isOwn(j)).map((j) => [j._id, { title: j.title, updatedAt: j.updatedAt }])) : {})}
                            />
                            Select all on this page
                        </label>
                        <button type="button" className={btnPrimary} disabled={selectedIds.length === 0 || bulk.isPending} onClick={() => setBulkOpen(true)} data-testid="bulk-approve">
                            <CheckCheck className="h-4 w-4" aria-hidden="true" /> Approve {selectedIds.length > 0 ? countText(selectedIds.length, 'selected job', 'selected jobs') : 'selected'}
                        </button>
                    </div>
                )}

                {outcomes && (
                    <div role="status" className="rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900/60" data-testid="bulk-result">
                        <div className="flex items-start justify-between gap-3">
                            <p className="font-medium text-gray-900 dark:text-white">
                                {outcomes.length - failed.length} of {outcomes.length} approved{failed.length ? `, ${failed.length} could not be` : ''}.
                            </p>
                            <button type="button" aria-label="Dismiss this summary" className="rounded p-1 text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-gray-400 dark:hover:text-white" onClick={() => setOutcomes(null)}><X className="h-4 w-4" aria-hidden="true" /></button>
                        </div>
                        {failed.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-red-900 dark:text-red-300">
                                {failed.map((o) => <li key={o.id} className="break-words"><strong>{o.title}</strong>: {o.message}</li>)}
                            </ul>
                        )}
                    </div>
                )}

                {active.isLoading ? <ListSkeleton count={3} label="Loading the review list" />
                    : active.isError ? <ErrorState error={active.error} onRetry={() => void active.refetch()} title="Could not load this list" />
                        : (tab === 'companies' ? companyRows.length === 0 : rows.length === 0) ? (
                            <div className={`${card} px-6 py-12 text-center`} data-testid="admin-empty">
                                <Inbox className="mx-auto mb-3 h-8 w-8 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                                <p className="text-sm text-gray-800 dark:text-gray-200">{emptyText}</p>
                            </div>
                        ) : tab === 'companies' ? (
                            <ul className="space-y-3" aria-label="Companies">
                                {companyRows.map((c) => (
                                    <AdminCompanyRow
                                        key={c._id}
                                        company={c}
                                        busy={busyId === c._id}
                                        viewerId={viewerId}
                                        onApprove={(company) => run(company._id, (done) => approveCompany.mutate({ id: company._id, name: company.name, updatedAt: company.updatedAt }, { onSettled: done }))}
                                        onReject={(company) => setRejecting({ kind: 'company', company })}
                                    />
                                ))}
                            </ul>
                        ) : (
                            <ul className="space-y-3" aria-label="Jobs">
                                {rows.map((job) => (
                                    <AdminJobRow
                                        key={job._id}
                                        job={job}
                                        selectable={selectable}
                                        selected={!!selected[job._id]}
                                        onSelect={(j, on) => setSelected((old) => { const next = { ...old }; if (on) next[j._id] = { title: j.title, updatedAt: j.updatedAt }; else delete next[j._id]; return next; })}
                                        viewerId={viewerId}
                                        onClose={canClose ? (j) => setClosing(j) : undefined}
                                        busy={busyId === job._id || bulk.isPending}
                                        onApprove={(j) => run(j._id, (done) => approve.mutate({ id: j._id, title: j.title, updatedAt: j.updatedAt }, { onSettled: done }))}
                                        onReject={(j) => setRejecting({ kind: 'job', job: j })}
                                        onDismiss={tab === 'reported' ? (j) => run(j._id, (done) => dismiss.mutate({ id: j._id, title: j.title }, { onSettled: done })) : undefined}
                                    />
                                ))}
                            </ul>
                        )}

                <Pager page={page} totalPages={totalPages} onPage={(p) => { setPage(p); setSelected({}); }} />
            </div>

            <ReasonDialog
                open={!!rejecting}
                onClose={() => setRejecting(null)}
                title={rejecting?.kind === 'company' ? 'Reject this company' : 'Reject this job'}
                description={rejecting ? `${rejecting.kind === 'company' ? rejecting.company.name : rejecting.job.title}. ${rejecting.kind === 'company' ? 'Its public jobs go back to the queue and it cannot post until it is fixed.' : 'The job is taken down and the poster can fix it and send it again.'}` : ''}
                confirmLabel="Reject"
                onSubmit={onRejectSubmit}
            />
            <ReasonDialog
                open={!!closing}
                onClose={() => setClosing(null)}
                title="Close this job"
                description={closing ? `${closing.title}. The job is taken down and the poster is told. It stays locked: the poster can only send it back to review.` : ''}
                confirmLabel="Close job"
                tone="neutral"
                required={false}
                placeholder="Why is the job being closed? (optional)"
                hint="If you give a reason, the poster reads it."
                onSubmit={onCloseSubmit}
            />
            <ConfirmDialog
                open={bulkOpen}
                variant="warning"
                title={`Approve ${countText(selectedIds.length, 'job')}?`}
                description="Each one is approved on its own. One that someone else already decided, or that fails, is reported below and does not stop the others."
                confirmText="Approve all selected"
                onCancel={() => setBulkOpen(false)}
                onConfirm={runBulk}
            />
        </div>
    );
}

/** `/admin/jobs`: the review queue, reported jobs, every job and the companies waiting for verification */
export function AdminJobsView() {
    const { user, ready } = useRequireLogin('/admin/jobs');
    if (!ready || !user) return <FullPageSpinner />;
    if (!isJobReviewer(user.role)) return <NoAccess message="Only moderators and administrators can review jobs." href="/jobs" label="Back to jobs" />;
    return (
        <PageShell title="Jobs review" subtitle="Review what employers post. A decision tells the poster." wide backHref="/admin" backLabel="Back to the admin panel">
            <Review viewerId={user.id ?? null} canClose={isJobAdmin(user.role)} />
        </PageShell>
    );
}
