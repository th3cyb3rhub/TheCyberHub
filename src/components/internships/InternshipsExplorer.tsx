'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap, ListChecks, Loader2, Plus, X } from 'lucide-react';
import { btnPrimary, btnSecondary, focusRing, input, muted, pageBg } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useInternships } from '@/hooks/queries/useInternships';
import { COHORT_STATUS_LABELS, isCohortStatus, isCohortType, TYPE_LABELS } from '@/lib/internships/display';
import { isModeratorRole } from '@/lib/roles';
import { COHORT_TYPES, type CohortFilters, type CohortStatus, type CohortType } from '@/types/internship';
import { CohortCard } from './CohortCard';
import { ErrorState, GridSkeleton } from './ListStates';
import { PastCohorts } from './PastCohorts';

/** The chips of the public list: what a visitor can be shown */
const STATUS_CHIPS: { id: '' | CohortStatus; label: string }[] = [
    { id: '', label: 'All' },
    { id: 'open', label: COHORT_STATUS_LABELS.open },
    { id: 'closed', label: COHORT_STATUS_LABELS.closed },
    { id: 'in-progress', label: COHORT_STATUS_LABELS['in-progress'] },
];

const PAGE_SIZE = 50;

/** The filters live in the URL, so a reload or a shared link shows the same list */
export function filtersFromParams(params: URLSearchParams): { type: CohortType | ''; status: CohortStatus | '' } {
    const type = params.get('type');
    const status = params.get('status');
    return {
        type: isCohortType(type) ? type : '',
        // A draft or completed cohort is not on the public list
        status: isCohortStatus(status) && status !== 'draft' && status !== 'completed' ? status : '',
    };
}

export function InternshipsExplorer() {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const { user } = useAuth();
    const staff = !!user && isModeratorRole(user.role);
    const { type, status } = filtersFromParams(new URLSearchParams(search.toString()));

    const update = (changes: Record<string, string | null>) => {
        const params = new URLSearchParams(search.toString());
        for (const [key, value] of Object.entries(changes)) {
            if (value) params.set(key, value); else params.delete(key);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    // The API honours `status` for staff only. For everybody else the list is filtered here, on
    // the cards that arrived, and more are fetched while the filter still has nothing to show.
    const filters: CohortFilters = { type, status: staff ? status : '', limit: PAGE_SIZE };
    const query = useInternships(filters);
    const cohorts = useMemo(() => {
        const seen = new Set<string>();
        return (query.data?.pages.flatMap((p) => p.data) ?? [])
            .filter((c) => !seen.has(c._id) && !!seen.add(c._id))
            .filter((c) => !status || c.status === status);
    }, [query.data, status]);

    const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
    useEffect(() => {
        if (status && cohorts.length === 0 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, [status, cohorts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

    const hasFilters = !!(type || status);
    const clear = () => update({ type: null, status: null });
    const searching = !!status && cohorts.length === 0 && !!hasNextPage;

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-orange-800 dark:text-orange-400">
                            <GraduationCap className="h-4 w-4" aria-hidden="true" /> Community programs
                        </p>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">Internships</h1>
                        <p className={`mt-1 max-w-xl text-sm ${muted}`}>Hands-on cybersecurity internships and mentorship programs run through the community. Deadlines are shown in your time zone.</p>
                    </div>
                    <nav aria-label="Internships shortcuts" className="flex flex-wrap gap-2">
                        {user && <Link href="/internships/applications" className={btnSecondary}><ListChecks className="h-4 w-4" aria-hidden="true" /> My applications</Link>}
                        {staff && <Link href="/admin/internships" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> Manage programs</Link>}
                    </nav>
                </header>

                <div className="mb-6 flex flex-wrap items-center gap-3" role="search" aria-label="Filter programs">
                    <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
                        {STATUS_CHIPS.map((chip) => {
                            const active = status === chip.id;
                            return (
                                <button
                                    key={chip.id || 'all'}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => update({ status: chip.id || null })}
                                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${focusRing} ${active
                                        ? 'border-orange-700 bg-orange-700 text-white'
                                        : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}
                                >
                                    {chip.label}
                                </button>
                            );
                        })}
                    </div>
                    <div>
                        <label htmlFor="internships-type" className="sr-only">Type</label>
                        <select id="internships-type" value={type} onChange={(e) => update({ type: e.target.value || null })} className={`${input} !w-auto`}>
                            <option value="">Internships and mentorships</option>
                            {COHORT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}s</option>)}
                        </select>
                    </div>
                    {hasFilters && <button type="button" onClick={clear} className={btnSecondary}><X className="h-4 w-4" aria-hidden="true" /> Clear</button>}
                </div>

                {query.isLoading ? (
                    <GridSkeleton />
                ) : query.isError ? (
                    <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load programs" />
                ) : searching ? (
                    <div role="status" className={`flex items-center justify-center gap-2 py-16 text-sm ${muted}`}><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Looking for matching programs</div>
                ) : cohorts.length === 0 ? (
                    <EmptyState
                        icon={GraduationCap}
                        title={hasFilters ? 'No programs match these filters' : 'No programs are open right now'}
                        description={hasFilters ? 'Try another status or clear the filters.' : 'New cohorts are announced here. Past programs are listed below.'}
                        actionLabel={hasFilters ? 'Clear filters' : undefined}
                        onAction={hasFilters ? clear : undefined}
                    />
                ) : (
                    <>
                        <p className={`mb-4 text-sm ${muted}`} aria-live="polite">{cohorts.length} {cohorts.length === 1 ? 'program' : 'programs'}</p>
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="cohort-grid">
                            {cohorts.map((c) => <CohortCard key={c._id} cohort={c} />)}
                        </div>
                        {hasNextPage && (
                            <div className="mt-8 text-center">
                                <button type="button" className={btnSecondary} disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                                    {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                                </button>
                            </div>
                        )}
                    </>
                )}

                <PastCohorts />
            </div>
        </div>
    );
}
