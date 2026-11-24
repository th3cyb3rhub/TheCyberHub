import { CardSkeleton } from '@/components/mentorship/shared';
import { pageBg } from '@/components/mentorship/styles';

export default function Loading() {
    return <div className={pageBg}><div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6"><CardSkeleton count={6} /></div></div>;
}
