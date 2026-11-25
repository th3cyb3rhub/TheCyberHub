import { muted } from '@/components/events/styles';
import { ListToolbarSkeleton } from '@/components/ui/ListToolbarSkeleton';
import { DIFFICULTY_LABELS } from '@/lib/labs/display';
import { LAB_DIFFICULTIES, type LabCard as LabCardData, type LabFacets } from '@/types/lab';
import { LabCard } from './LabCard';
import { GridSkeleton } from './ListStates';

/**
 * What the server renders in place of the interactive list: the plain first page (so the titles are
 * in the HTML), or the skeleton when the API did not answer. The browser replaces it once it runs.
 */
export function ServerLabList({ labs, facets = null, total = null }: { labs: LabCardData[] | null; facets?: LabFacets | null; total?: number | null }) {
    // Same text as the real chips, counts included, so they wrap onto the same lines
    const counts = new Map((facets?.difficulties ?? []).map((d) => [d.difficulty, d.count]));
    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3" aria-hidden="true">
                <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900/60">
                    <span className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white">Labs</span>
                    <span className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">Leaderboard</span>
                </div>
            </div>
            <ListToolbarSkeleton
                gridClass="gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                selects={['All categories', 'Newest']}
                levels={LAB_DIFFICULTIES.map((d) => `${DIFFICULTY_LABELS[d]}${counts.has(d) ? ` (${counts.get(d)})` : ''}`)}
            />
            <Body labs={labs} total={total} />
        </div>
    );
}

function Body({ labs, total }: { labs: LabCardData[] | null; total: number | null }) {
    if (!labs) return <GridSkeleton />;
    if (labs.length === 0) return <p className={`py-10 text-center text-sm ${muted}`}>No labs are published yet.</p>;
    return (
        <div>
            <p className={`mb-4 text-sm ${muted}`}>{total !== null && total > labs.length ? `Showing ${labs.length} of ${total} labs` : `${labs.length} ${labs.length === 1 ? 'lab' : 'labs'}`}</p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="lab-grid">
                {labs.map((lab) => <LabCard key={lab._id} lab={lab} />)}
            </div>
        </div>
    );
}
