'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, FlaskConical, Pencil, Plus } from 'lucide-react';
import { PageShell } from '@/components/events/PageShell';
import { btnPrimary, btnSecondary, card, chip, focusRing, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useManagedLabs } from '@/hooks/queries/useLabs';
import { categoryLabel, LAB_STATUS_LABELS } from '@/lib/labs/display';
import { LAB_STATUSES, type LabManageRow, type LabStatus } from '@/types/lab';
import { AdminGate } from './AdminGate';
import { ErrorState, ListSkeleton } from './ListStates';
import { DifficultyBadge, LabStatusBadge } from './StatusBadges';
import { ViewerTime } from '@/components/internships/ViewerTime';

/** A published lab with no flag cannot be completed by anybody */
export const needsFlag = (lab: Pick<LabManageRow, 'status' | 'flagCount'>) => lab.status === 'published' && lab.flagCount === 0;

function Row({ lab }: { lab: LabManageRow }) {
    const warn = needsFlag(lab);
    return (
        <li className={`${card} p-4 sm:p-5`} data-testid="admin-lab" data-status={lab.status}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-[min(100%,18rem)] flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <LabStatusBadge status={lab.status} />
                        <DifficultyBadge difficulty={lab.difficulty} />
                        <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{categoryLabel(lab.category)}</span>
                    </div>
                    <h2 className="break-words text-base font-semibold text-gray-900 dark:text-white">
                        <Link href={`/labs/${lab.slug}`} className={`rounded hover:underline ${focusRing}`}>{lab.title}</Link>
                    </h2>
                    <p className={`mt-1 break-all text-xs ${muted}`}>/labs/{lab.slug} {'·'} {lab.points} pts {'·'} updated <ViewerTime iso={lab.updatedAt} /></p>
                    <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-800 dark:text-gray-200" data-testid="admin-counts">
                        <span><strong>{lab.flagCount}</strong> {lab.flagCount === 1 ? 'flag' : 'flags'}</span>
                        <span><strong>{lab.startCount}</strong> started</span>
                        <span><strong>{lab.completionCount}</strong> completed</span>
                        <span><strong>{lab.hintCount}</strong> {lab.hintCount === 1 ? 'hint' : 'hints'}</span>
                    </p>
                    {warn && (
                        <p role="note" className="mt-2 inline-flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100" data-testid="no-flag-warning">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>Published without a flag: members cannot complete it. Edit it and add one.</span>
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/labs/${lab.slug}`} className={`${btnSecondary} !px-3 !py-2`}><ExternalLink className="h-4 w-4" aria-hidden="true" /> View<span className="sr-only"> {lab.title}</span></Link>
                    <Link href={`/admin/labs/${encodeURIComponent(lab.slug)}/edit`} className={`${btnSecondary} !px-3 !py-2`}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit<span className="sr-only"> {lab.title}</span></Link>
                </div>
            </div>
        </li>
    );
}

function List() {
    const [status, setStatus] = useState<LabStatus | ''>('');
    const [page, setPage] = useState(1);
    const query = useManagedLabs({ page, status });
    const labs = query.data?.data ?? [];
    const pagination = query.data?.pagination;
    const unflagged = labs.filter(needsFlag).length;

    const choose = (s: LabStatus | '') => { setStatus(s); setPage(1); };

    return (
        <PageShell
            title="Labs"
            subtitle="Write guided exercises, set their flags and decide what is live."
            backHref="/admin"
            backLabel="Admin"
            wide
            actions={<Link href="/admin/labs/create" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> New lab</Link>}
        >
            <div role="group" aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
                {(['', ...LAB_STATUSES] as const).map((s) => (
                    <button key={s || 'all'} type="button" aria-pressed={status === s} onClick={() => choose(s)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${status === s
                            ? 'border-orange-700 bg-orange-700 text-white'
                            : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>
                        {s ? LAB_STATUS_LABELS[s] : 'All'}
                    </button>
                ))}
            </div>

            {unflagged > 0 && (
                <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="unflagged-banner">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{unflagged} published {unflagged === 1 ? 'lab has' : 'labs have'} no flag on this page, so members cannot complete {unflagged === 1 ? 'it' : 'them'}.</span>
                </p>
            )}

            {query.isLoading ? (
                <ListSkeleton label="Loading labs" />
            ) : query.isError ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load labs" />
            ) : labs.length === 0 ? (
                <EmptyState icon={FlaskConical} title={status ? 'No labs with this status' : 'No labs yet'} description={status ? 'Try another status.' : 'Create the first lab to give members something to solve.'} actionLabel={status ? undefined : 'New lab'} actionHref={status ? undefined : '/admin/labs/create'} />
            ) : (
                <>
                    <ul className="space-y-4" aria-label="Labs">
                        {labs.map((l) => <Row key={l._id} lab={l} />)}
                    </ul>
                    {pagination && (pagination.page > 1 || pagination.hasMore) && (
                        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
                            <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button>
                            <p className={`text-sm ${muted}`} aria-live="polite">Page {pagination.page}{pagination.totalPages ? ` of ${pagination.totalPages}` : ''}</p>
                            <button type="button" className={btnSecondary} disabled={!pagination.hasMore} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                        </nav>
                    )}
                </>
            )}
        </PageShell>
    );
}

export function AdminLabsView() {
    return <AdminGate returnTo="/admin/labs">{() => <List />}</AdminGate>;
}
