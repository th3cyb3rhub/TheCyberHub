import { ListSkeleton } from '@/components/internships/ListStates';
import { pageBg } from '@/components/events/styles';

export default function Loading() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6"><ListSkeleton label="Loading your applications" /></div>
        </div>
    );
}
