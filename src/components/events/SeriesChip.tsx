import Link from 'next/link';
import { Repeat } from 'lucide-react';
import { chip } from './styles';

/** "Part of a series": links to the page with the schedule and the next dates */
export function SeriesChip({ seriesId, className = '' }: { seriesId: string | null | undefined; className?: string }) {
    if (!seriesId) return null;
    return (
        <Link
            href={`/events/series/${encodeURIComponent(seriesId)}`}
            className={`${chip} bg-purple-100 text-purple-900 hover:bg-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:bg-purple-500/15 dark:text-purple-300 dark:hover:bg-purple-500/25 ${className}`}
        >
            <Repeat className="h-3 w-3" aria-hidden="true" /> Series
            <span className="sr-only">: see the schedule of this recurring event</span>
        </Link>
    );
}
