import { pageBg } from '@/components/events/styles';
import { ListSkeleton } from '@/components/jobs/ListStates';

export default function Loading() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6"><ListSkeleton label="Loading saved jobs" /></div>
        </div>
    );
}
