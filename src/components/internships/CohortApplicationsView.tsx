'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Users } from 'lucide-react';
import { PageShell } from '@/components/events/PageShell';
import { btnSecondary, card, focusRing, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCohortApplications, useInternship } from '@/hooks/queries/useInternships';
import { APPLICATION_STATUS_LABELS, hostOf, safeHref } from '@/lib/internships/display';
import { APPLICATION_STATUSES, type ApplicationStatus, type StaffApplicationRow } from '@/types/internship';
import { ApplicationDrawer } from './ApplicationReview';
import { EXTERNAL_REL } from './PastCohorts';
import { ErrorState, ListSkeleton } from './ListStates';
import { StaffGate } from './StaffGate';
import { ApplicationStatusBadge } from './StatusBadges';
import { ViewerTime } from './ViewerTime';

function Applications({ id }: { id: string }) {
    const [status, setStatus] = useState<ApplicationStatus | ''>('');
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState<StaffApplicationRow | null>(null);
    const cohort = useInternship(id);
    const query = useCohortApplications(id, { status: status || undefined, page });
    const rows = query.data?.data ?? [];
    const pagination = query.data?.pagination;
    const c = cohort.data;

    const choose = (s: ApplicationStatus | '') => { setStatus(s); setPage(1); };

    return (
        <PageShell
            title={c ? `Applications: ${c.title}` : 'Applications'}
            subtitle={c ? `${c.applicationCount ?? 0} ${c.applicationCount === 1 ? 'application' : 'applications'} · ${c.acceptedCount ?? 0} accepted${c.capacity > 0 ? ` of ${c.capacity} seats` : ' (no seat limit)'}` : undefined}
            backHref="/admin/internships"
            backLabel="All programs"
            wide
        >
            <div role="group" aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
                {(['', ...APPLICATION_STATUSES] as const).map((s) => (
                    <button key={s || 'all'} type="button" aria-pressed={status === s} onClick={() => choose(s)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${status === s
                            ? 'border-orange-700 bg-orange-700 text-white'
                            : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>
                        {s ? APPLICATION_STATUS_LABELS[s] : 'All'}
                    </button>
                ))}
            </div>

            {query.isLoading ? (
                <ListSkeleton label="Loading applications" />
            ) : query.isError ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load applications" />
            ) : rows.length === 0 ? (
                <EmptyState icon={Users} title={status ? 'No applications with this status' : 'No applications yet'} description={status ? 'Try another status.' : 'They appear here as soon as people apply.'} />
            ) : (
                <>
                    <div className={`${card} overflow-hidden`}>
                        <div className="hidden grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-4 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-400 md:grid" aria-hidden="true">
                            <span>Applicant</span><span>Applied</span><span>Status</span><span>Resume</span><span className="w-20" />
                        </div>
                        <ul className="divide-y divide-gray-200 dark:divide-neutral-800" aria-label="Applications">
                            {rows.map((row) => {
                                const resume = safeHref(row.resumeUrl);
                                return (
                                    <li key={row._id} className="grid gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[2fr_1.4fr_1fr_1fr_auto] md:items-center" data-testid="application-row" data-status={row.status}>
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-gray-900 dark:text-white">{row.user?.name ?? 'Removed account'}</p>
                                            {row.user && <p className={`truncate text-sm ${muted}`}>@{row.user.username} · {row.user.email}</p>}
                                        </div>
                                        <p className={`text-sm ${muted}`}><span className="md:hidden">Applied </span><ViewerTime iso={row.appliedAt} kind="stamp" /></p>
                                        <div><ApplicationStatusBadge status={row.status} /></div>
                                        <div className="text-sm">
                                            {resume ? (
                                                <a href={resume} target="_blank" rel={EXTERNAL_REL} className={`inline-flex items-center gap-1 rounded text-orange-800 underline dark:text-orange-300 ${focusRing}`}>
                                                    Resume <ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">({hostOf(resume)}, opens in a new tab)</span>
                                                </a>
                                            ) : <span className={muted}>None</span>}
                                        </div>
                                        <button type="button" className={`${btnSecondary} !px-3 !py-2 md:w-20`} onClick={() => setOpen(row)} aria-label={`Review application from ${row.user?.name ?? 'removed account'}`}>Review</button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                    {pagination && pagination.totalPages > 1 && (
                        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
                            <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button>
                            <p className={`text-sm ${muted}`} aria-live="polite">Page {pagination.page} of {pagination.totalPages} · {pagination.total} in total</p>
                            <button type="button" className={btnSecondary} disabled={!pagination.hasMore} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                        </nav>
                    )}
                </>
            )}

            <ApplicationDrawer row={open} cohortId={id} onClose={() => setOpen(null)} />
        </PageShell>
    );
}

export function CohortApplicationsView({ id }: { id: string }) {
    return <StaffGate returnTo={`/admin/internships/${id}/applications`}>{() => <Applications id={id} />}</StaffGate>;
}
