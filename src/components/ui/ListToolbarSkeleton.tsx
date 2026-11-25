import { Search } from 'lucide-react';
import { input } from '@/components/events/styles';

const chip = 'rounded-full border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200';

/**
 * The search box and filter chips of a list, drawn without their behaviour. The server renders the
 * plain list while the interactive one loads; this keeps the same height, so the cards do not jump
 * down when the real toolbar arrives. It is hidden from assistive technology: the real one follows.
 */
export function ListToolbarSkeleton({ gridClass, searchClass = '', selects, levels }: {
    /** The layout classes of the grid holding the search box and the selects */
    gridClass: string;
    searchClass?: string;
    /** Text of each select (its first option) */
    selects: string[];
    /** Text of each difficulty chip, after "All levels" */
    levels: string[];
}) {
    return (
        <div className="mb-6 space-y-4" aria-hidden="true" data-testid="list-toolbar-skeleton">
            <div className={`grid ${gridClass}`}>
                <div className={`relative ${searchClass}`}>
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                    <div className={`${input} pl-10 !text-gray-500`}>Search by title, tag or topic</div>
                </div>
                {selects.map((label) => (
                    <div key={label}><div className={`${input} lg:w-auto`}>{label}</div></div>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex flex-wrap gap-2">
                    {['All levels', ...levels].map((label) => <span key={label} className={chip}>{label}</span>)}
                </div>
            </div>
        </div>
    );
}
