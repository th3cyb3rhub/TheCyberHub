'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Flag, Pencil, Plus } from 'lucide-react';
import { PageShell } from '@/components/events/PageShell';
import { btnPrimary, btnSecondary, card, focusRing, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAdminCtfList } from '@/hooks/queries/useCtf';
import { useViewerZone } from '@/lib/events/clock';
import { formatRange } from '@/lib/events/time';
import { prizeSummary } from '@/lib/ctf/display';
import { STATUS_LABELS } from '@/lib/ctf/constants';
import type { CtfCompetitionCard, CtfStatus } from '@/types/ctf';
import { CtfStatusBadge, Pill } from '../Badges';
import { ErrorState, ListSkeleton } from '../ListStates';
import { CtfAdminGate } from './CtfAdminGate';

/** The tabs of the manager. `live` is sent as the API's `ongoing`: live and frozen together. */
const FILTERS: { value: '' | CtfStatus; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'draft', label: STATUS_LABELS.draft },
    { value: 'upcoming', label: STATUS_LABELS.upcoming },
    { value: 'live', label: 'Live or frozen' },
    { value: 'ended', label: STATUS_LABELS.ended },
    { value: 'cancelled', label: STATUS_LABELS.cancelled },
];

function Row({ competition, canWrite }: { competition: CtfCompetitionCard; canWrite: boolean }) {
    const zone = useViewerZone();
    const prize = prizeSummary(competition);
    return (
        <li className={`${card} p-4 sm:p-5`} data-testid="admin-ctf" data-status={competition.status} data-slug={competition.slug}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-[min(100%,18rem)] flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <CtfStatusBadge status={competition.status} />
                        <Pill>{competition.scoringMode === 'dynamic' ? 'Dynamic scoring' : 'Static scoring'}</Pill>
                        <Pill>{competition.teamsEnabled ? `Teams of ${competition.minTeamSize > 1 ? `${competition.minTeamSize} to ` : 'up to '}${competition.maxTeamSize}` : 'Solo'}</Pill>
                        {competition.isFeatured && <Pill>Featured</Pill>}
                        {competition.awardsPoints && <Pill>Counts on the global board</Pill>}
                    </div>
                    <h2 className="break-words text-base font-semibold text-gray-900 dark:text-white">
                        <Link href={`/ctf/competitions/${encodeURIComponent(competition.slug)}`} className={`rounded hover:underline ${focusRing}`}>{competition.title}</Link>
                    </h2>
                    <p className={`mt-1 break-all text-xs ${muted}`}>/ctf/competitions/{competition.slug}</p>
                    <p className={`mt-1 text-xs ${muted}`} data-testid="admin-ctf-range">
                        {formatRange(competition, competition.timezone, { withYear: true })}
                        {zone && zone !== competition.timezone ? ` (${competition.timezone})` : ''}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-800 dark:text-gray-200" data-testid="admin-counts">
                        <span><strong>{competition.challengeCount}</strong> {competition.challengeCount === 1 ? 'challenge' : 'challenges'}</span>
                        <span><strong>{competition.participantCount}</strong>{competition.maxParticipants > 0 ? ` of ${competition.maxParticipants}` : ''} {competition.participantCount === 1 ? 'player' : 'players'}</span>
                        {prize && <span className="min-w-0 break-words">{prize}</span>}
                    </p>
                    {competition.challengeCount === 0 && competition.status !== 'draft' && competition.status !== 'cancelled' && (
                        <p role="note" className="mt-2 text-sm text-amber-900 dark:text-amber-200">No challenges yet: players see an empty competition.</p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/ctf/competitions/${encodeURIComponent(competition.slug)}`} className={`${btnSecondary} !px-3 !py-2`}>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" /> View<span className="sr-only"> {competition.title}</span>
                    </Link>
                    {canWrite && (
                        <Link href={`/admin/ctf/${encodeURIComponent(competition.slug)}/edit`} className={`${btnSecondary} !px-3 !py-2`}>
                            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit<span className="sr-only"> {competition.title}</span>
                        </Link>
                    )}
                </div>
            </div>
        </li>
    );
}

function List({ canWrite }: { canWrite: boolean }) {
    const [status, setStatus] = useState<(typeof FILTERS)[number]['value']>('');
    const [page, setPage] = useState(1);
    const query = useAdminCtfList({ page, status: status || undefined });
    const rows = query.data?.data ?? [];
    const pagination = query.data?.pagination;

    const choose = (s: typeof status) => { setStatus(s); setPage(1); };

    return (
        <PageShell
            title="CTF competitions"
            subtitle="Timed competitions members play solo or in teams, built from the existing challenges."
            backHref="/admin"
            backLabel="Admin"
            wide
            actions={canWrite ? <Link href="/admin/ctf/create" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> New competition</Link> : undefined}
        >
            {!canWrite && (
                <p role="note" className="mb-6 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100" data-testid="read-only-note">
                    <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>You can read every competition, drafts included. Only administrators and owners can create or change them.</span>
                </p>
            )}

            <div role="group" aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                    <button key={f.value || 'all'} type="button" aria-pressed={status === f.value} onClick={() => choose(f.value)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${status === f.value
                            ? 'border-orange-700 bg-orange-700 text-white'
                            : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>
                        {f.label}
                    </button>
                ))}
            </div>

            {query.isLoading ? (
                <ListSkeleton label="Loading competitions" />
            ) : query.isError ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the competitions" />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={Flag}
                    title={status ? 'No competitions with this status' : 'No competitions yet'}
                    description={status ? 'Try another status.' : canWrite ? 'Create the first competition to give members something to play.' : 'Nothing has been created yet.'}
                    actionLabel={status || !canWrite ? undefined : 'New competition'}
                    actionHref={status || !canWrite ? undefined : '/admin/ctf/create'}
                />
            ) : (
                <>
                    <ul className="space-y-4" aria-label="Competitions">
                        {rows.map((c) => <Row key={c._id} competition={c} canWrite={canWrite} />)}
                    </ul>
                    {pagination && pagination.pages > 1 && (
                        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
                            <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button>
                            <p className={`text-sm ${muted}`} aria-live="polite">Page {pagination.page} of {pagination.pages} {'·'} {pagination.total} {pagination.total === 1 ? 'competition' : 'competitions'}</p>
                            <button type="button" className={btnSecondary} disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                        </nav>
                    )}
                </>
            )}
        </PageShell>
    );
}

export function AdminCtfView() {
    return <CtfAdminGate returnTo="/admin/ctf">{(_user, canWrite) => <List canWrite={canWrite} />}</CtfAdminGate>;
}
