import { Suspense } from 'react';
import { ToolsIndex } from '@/components/tools/ToolsIndex';
import { ToolCardSkeleton } from '@/components/tools/ToolCard';
import { pageBg } from '@/components/tools/styles';

export default function ToolsPage() {
    return (
        <Suspense
            fallback={(
                <div className={pageBg}>
                    <div className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 pt-32 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
                        {Array.from({ length: 9 }).map((_, i) => <ToolCardSkeleton key={i} />)}
                    </div>
                </div>
            )}
        >
            <ToolsIndex />
        </Suspense>
    );
}
