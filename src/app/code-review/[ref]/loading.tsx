import { card, pageBg } from '@/components/events/styles';

export default function Loading() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl space-y-4 px-4 pb-16 pt-24 sm:px-6" role="status" aria-label="Loading exercise">
                <div className="h-6 w-32 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className={`${card} h-40 animate-pulse`} />
                <div className={`${card} h-72 animate-pulse`} />
            </div>
        </div>
    );
}
