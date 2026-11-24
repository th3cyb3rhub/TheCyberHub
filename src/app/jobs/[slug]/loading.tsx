import { pageBg } from '@/components/events/styles';
import { DetailSkeleton } from '@/components/jobs/ListStates';

export default function Loading() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6"><DetailSkeleton /></div>
        </div>
    );
}
