'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Ban, ChevronLeft, ChevronRight, EyeOff, GraduationCap, Pencil, Plus, Users } from 'lucide-react';
import { PageShell } from '@/components/events/PageShell';
import { btnPrimary, btnSecondary, card, chip, focusRing, muted } from '@/components/events/styles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAdminInternships, useCloseCohort } from '@/hooks/queries/useInternships';
import { COHORT_STATUS_LABELS, TYPE_LABELS } from '@/lib/internships/display';
import { COHORT_STATUSES, type CohortCard, type CohortStatus } from '@/types/internship';
import { ErrorState, ListSkeleton } from './ListStates';
import { StaffGate } from './StaffGate';
import { CohortStatusBadge } from './StatusBadges';
import { ViewerTime } from './ViewerTime';

function Row({ cohort, onClose }: { cohort: CohortCard; onClose: (c: CohortCard) => void }) {
    const accepted = cohort.acceptedCount ?? 0;
    const apps = cohort.applicationCount ?? 0;
    const open = cohort.status === 'open';
    return (
        <li className={`${card} p-4 sm:p-5`} data-testid="admin-cohort" data-status={cohort.status}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-[min(100%,18rem)] flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <CohortStatusBadge status={cohort.status} />
                        <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{TYPE_LABELS[cohort.type] ?? cohort.type}</span>
                        {cohort.isActive === false && <span className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}><EyeOff className="h-3 w-3" aria-hidden="true" /> Hidden</span>}
                    </div>
                    <h2 className="break-words text-base font-semibold text-gray-900 dark:text-white">
                        <Link href={`/internships/${cohort._id}`} className={`rounded hover:underline ${focusRing}`}>{cohort.title}</Link>
                    </h2>
                    <p className={`mt-1 text-sm ${muted}`}>
                        <ViewerTime iso={cohort.startDate} /> to <ViewerTime iso={cohort.endDate} />
                        {' · '}Apply by <ViewerTime iso={cohort.applicationDeadline} kind="moment" />
                    </p>
                    <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-800 dark:text-gray-200" data-testid="admin-counts">
                        <span><strong>{accepted}</strong>{cohort.capacity > 0 ? ` / ${cohort.capacity}` : ''} accepted{cohort.capacity === 0 ? ' (no limit)' : ''}</span>
                        <span><strong>{apps}</strong> {apps === 1 ? 'application' : 'applications'}</span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/internships/${cohort._id}/applications`} className={`${btnSecondary} !px-3 !py-2`}><Users className="h-4 w-4" aria-hidden="true" /> Applications</Link>
                    <Link href={`/admin/internships/${cohort._id}/edit`} className={`${btnSecondary} !px-3 !py-2`}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</Link>
                    {open && <button type="button" className={`${btnSecondary} !px-3 !py-2`} onClick={() => onClose(cohort)}><Ban className="h-4 w-4" aria-hidden="true" /> Close</button>}
                </div>
            </div>
        </li>
    );
}

function List() {
    const [status, setStatus] = useState<CohortStatus | ''>('');
    const [page, setPage] = useState(1);
    const [closing, setClosing] = useState<CohortCard | null>(null);
    const query = useAdminInternships({ page, status });
    const close = useCloseCohort();
    const cohorts = query.data?.data ?? [];
    const pagination = query.data?.pagination;

    const choose = (s: CohortStatus | '') => { setStatus(s); setPage(1); };

    return (
        <PageShell
            title="Internship programs"
            subtitle="Create and run cohorts, and review the applications."
            backHref="/admin"
            backLabel="Admin"
            wide
            actions={<Link href="/admin/internships/create" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> New program</Link>}
        >
            <div role="group" aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
                {(['', ...COHORT_STATUSES] as const).map((s) => (
                    <button key={s || 'all'} type="button" aria-pressed={status === s} onClick={() => choose(s)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${status === s
                            ? 'border-orange-700 bg-orange-700 text-white'
                            : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>
                        {s ? COHORT_STATUS_LABELS[s] : 'All'}
                    </button>
                ))}
            </div>

            {query.isLoading ? (
                <ListSkeleton label="Loading programs" />
            ) : query.isError ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load programs" />
            ) : cohorts.length === 0 ? (
                <EmptyState icon={GraduationCap} title={status ? 'No programs with this status' : 'No programs yet'} description={status ? 'Try another status.' : 'Create the first cohort to start taking applications.'} actionLabel={status ? undefined : 'New program'} actionHref={status ? undefined : '/admin/internships/create'} />
            ) : (
                <>
                    <ul className="space-y-4" aria-label="Programs">
                        {cohorts.map((c) => <Row key={c._id} cohort={c} onClose={setClosing} />)}
                    </ul>
                    {pagination && pagination.totalPages > 1 && (
                        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
                            <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button>
                            <p className={`text-sm ${muted}`} aria-live="polite">Page {pagination.page} of {pagination.totalPages}</p>
                            <button type="button" className={btnSecondary} disabled={!pagination.hasMore} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                        </nav>
                    )}
                </>
            )}

            <ConfirmDialog
                open={!!closing}
                variant="warning"
                title={closing ? `Close applications for ${closing.title}?` : 'Close applications?'}
                description="Applications stop at once and the program shows as closed. Applicants already in stay in. You can reopen it later by editing it with a future deadline."
                confirmText="Close applications"
                onCancel={() => setClosing(null)}
                onConfirm={() => {
                    if (!closing) return;
                    const id = closing._id;
                    setClosing(null);
                    close.mutate({ id });
                }}
            />
        </PageShell>
    );
}

export function AdminInternshipsView() {
    return <StaffGate returnTo="/admin/internships">{() => <List />}</StaffGate>;
}
