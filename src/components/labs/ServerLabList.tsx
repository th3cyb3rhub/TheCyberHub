import { muted } from '@/components/events/styles';
import type { LabCard as LabCardData } from '@/types/lab';
import { LabCard } from './LabCard';
import { GridSkeleton } from './ListStates';

/**
 * What the server renders in place of the interactive list: the plain first page (so the titles are
 * in the HTML), or the skeleton when the API did not answer. The browser replaces it once it runs.
 */
export function ServerLabList({ labs }: { labs: LabCardData[] | null }) {
    if (!labs) return <GridSkeleton />;
    if (labs.length === 0) return <p className={`py-10 text-center text-sm ${muted}`}>No labs are published yet.</p>;
    return (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="lab-grid">
            {labs.map((lab) => <LabCard key={lab._id} lab={lab} />)}
        </div>
    );
}
