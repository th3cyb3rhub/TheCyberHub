import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
    return (
        <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-5 w-96 max-w-full" />
                <Skeleton className="h-64 w-full rounded-2xl" />
                <Skeleton className="h-48 w-full rounded-2xl" />
            </div>
        </div>
    );
}
