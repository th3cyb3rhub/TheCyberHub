import { muted } from '@/components/events/styles';
import { ListToolbarSkeleton } from '@/components/ui/ListToolbarSkeleton';
import { DIFFICULTY_LABELS } from '@/lib/codeReview/constants';
import { CR_DIFFICULTIES, type CrCard, type CrStats } from '@/types/codeReview';
import { GridSkeleton } from './ListStates';
import { SnippetCard } from './SnippetCard';

/**
 * What the server renders in place of the interactive list: the plain first page (so the titles are
 * in the HTML), or the skeleton when the API did not answer. The browser replaces it once it runs.
 */
export function ServerSnippetList({ snippets, stats = null, total = null }: { snippets: CrCard[] | null; stats?: CrStats | null; total?: number | null }) {
    // Same text as the real chips, counts included, so they wrap onto the same lines
    const counts = new Map((stats?.facets?.difficulties ?? []).map((d) => [d.difficulty, d.count]));
    return (
        <div>
            <ListToolbarSkeleton
                gridClass="grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                searchClass="sm:col-span-2 lg:col-span-1"
                selects={['All categories', 'All languages', 'Newest']}
                levels={CR_DIFFICULTIES.map((d) => `${DIFFICULTY_LABELS[d]}${counts.has(d) ? ` (${counts.get(d)})` : ''}`)}
            />
            <Body snippets={snippets} total={total} />
        </div>
    );
}

function Body({ snippets, total }: { snippets: CrCard[] | null; total: number | null }) {
    if (!snippets) return <GridSkeleton />;
    if (snippets.length === 0) return <p className={`py-10 text-center text-sm ${muted}`}>No exercises are published yet.</p>;
    return (
        <div>
            <p className={`mb-4 text-sm ${muted}`}>{total !== null && total > snippets.length ? `Showing ${snippets.length} of ${total} exercises` : `${snippets.length} ${snippets.length === 1 ? 'exercise' : 'exercises'}`}</p>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="cr-grid">
                {snippets.map((s) => <SnippetCard key={s._id} snippet={s} />)}
            </div>
        </div>
    );
}
