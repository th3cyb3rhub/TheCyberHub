'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { eventErrorMessage } from '@/lib/events/errors';
import { btnSecondary } from './styles';
import { EventCardSkeleton } from './EventCard';

export function GridSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading events">
            {Array.from({ length: count }).map((_, i) => <EventCardSkeleton key={i} />)}
        </div>
    );
}

export function ErrorState({ error, onRetry, title = 'Could not load events' }: { error: unknown; onRetry: () => void; title?: string }) {
    return (
        <div role="alert" className="flex flex-col items-center rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-500/30 dark:bg-red-500/10">
            <AlertTriangle className="mb-3 h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" />
            <h2 className="mb-1 text-base font-semibold text-red-950 dark:text-red-100">{title}</h2>
            <p className="mb-4 max-w-md text-sm text-red-900 dark:text-red-200">{eventErrorMessage(error)}</p>
            <button type="button" className={btnSecondary} onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>
        </div>
    );
}
