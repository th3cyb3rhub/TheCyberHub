import { pageBg } from '@/components/events/styles';

export default function Loading() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-4xl space-y-4 px-4 pb-16 pt-24 sm:px-6" role="status" aria-label="Loading program">
                <div className="h-6 w-40 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="h-72 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/60" />
            </div>
        </div>
    );
}
