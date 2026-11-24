import { Skeleton } from './shared';
import { cardPad, pageBg } from '@/components/events/styles';

export function DetailLoading() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6" role="status" aria-label="Loading">
                <Skeleton className="mb-6 h-4 w-28" />
                <Skeleton className="h-9 w-2/3" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-4/5" />
                <div className={`${cardPad} mt-8 space-y-3`}><Skeleton className="h-4 w-1/3" /><Skeleton className="h-2.5 w-full" /></div>
                <div className="mt-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            </div>
        </div>
    );
}
