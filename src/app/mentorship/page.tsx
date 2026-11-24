import { Suspense } from 'react';
import { MentorshipHome } from '@/components/mentorship/MentorshipHome';
import { CardSkeleton } from '@/components/mentorship/shared';
import { pageBg } from '@/components/mentorship/styles';

export default function MentorshipPage() {
    return (
        <Suspense fallback={<div className={pageBg}><div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6"><CardSkeleton count={6} label="Loading mentors" /></div></div>}>
            <MentorshipHome />
        </Suspense>
    );
}
