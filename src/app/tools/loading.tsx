import { ToolCardSkeleton } from '@/components/tools/ToolCard';
import { pageBg } from '@/components/tools/styles';

export default function ToolsLoading() {
    return (
        <div className={pageBg} role="status" aria-label="Loading tools">
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-32 sm:px-6">
                <div className="mb-8 space-y-3">
                    <div className="h-10 w-64 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                    <div className="h-5 w-96 max-w-full animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => <ToolCardSkeleton key={i} />)}
                </div>
            </div>
        </div>
    );
}
