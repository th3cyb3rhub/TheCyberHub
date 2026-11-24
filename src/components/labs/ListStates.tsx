'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { btnSecondary, card } from '@/components/events/styles';
import { labErrorMessage } from '@/lib/labs/errors';

export function ErrorState({ error, onRetry, title = 'Could not load this' }: { error: unknown; onRetry: () => void; title?: string }) {
    return (
        <div role="alert" className="flex flex-col items-center rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-500/30 dark:bg-red-500/10">
            <AlertTriangle className="mb-3 h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" />
            <h2 className="mb-1 text-base font-semibold text-red-950 dark:text-red-100">{title}</h2>
            <p className="mb-4 max-w-md text-sm text-red-900 dark:text-red-200">{labErrorMessage(error)}</p>
            <button type="button" className={btnSecondary} onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>
        </div>
    );
}

export function CardSkeleton() {
    return (
        <div className={`${card} animate-pulse space-y-3 p-5`} aria-hidden="true">
            <div className="h-5 w-20 rounded-full bg-gray-200 dark:bg-neutral-800" />
            <div className="h-6 w-3/4 rounded bg-gray-200 dark:bg-neutral-800" />
            <div className="h-4 w-full rounded bg-gray-200 dark:bg-neutral-800" />
            <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-neutral-800" />
            <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-neutral-800" />
        </div>
    );
}

export function GridSkeleton({ count = 6, label = 'Loading labs' }: { count?: number; label?: string }) {
    return (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={label}>
            {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
    );
}

export function ListSkeleton({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
    return (
        <div className="space-y-4" role="status" aria-label={label}>
            {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
    );
}
