import { muted } from '@/components/events/styles';
import type { CrCard } from '@/types/codeReview';
import { GridSkeleton } from './ListStates';
import { SnippetCard } from './SnippetCard';

/**
 * What the server renders in place of the interactive list: the plain first page (so the titles are
 * in the HTML), or the skeleton when the API did not answer. The browser replaces it once it runs.
 */
export function ServerSnippetList({ snippets }: { snippets: CrCard[] | null }) {
    if (!snippets) return <GridSkeleton />;
    if (snippets.length === 0) return <p className={`py-10 text-center text-sm ${muted}`}>No exercises are published yet.</p>;
    return (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="cr-grid">
            {snippets.map((s) => <SnippetCard key={s._id} snippet={s} />)}
        </div>
    );
}
