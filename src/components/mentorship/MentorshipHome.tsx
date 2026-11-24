'use client';

import Link from 'next/link';
import { GraduationCap, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useFeaturedMentors } from '@/hooks/queries/useMentorship';
import { MentorCard } from './MentorCard';
import { MentorDirectory } from './MentorDirectory';
import { MentorshipNav } from './MentorshipNav';
import { NeedsYou } from './NeedsYou';
import { PageShell } from '@/components/events/PageShell';
import { btnPrimary, btnSecondary, muted } from './styles';

function Featured() {
    const featured = useFeaturedMentors(3);
    if (featured.isLoading || featured.isError || !featured.data?.length) return null;
    return (
        <section aria-labelledby="featured-heading" className="mb-10">
            <h2 id="featured-heading" className="mb-4 text-xl font-bold text-gray-900 dark:text-white">Featured mentors</h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="featured-list">
                {featured.data.map((m) => <MentorCard key={m._id} mentor={m} />)}
            </ul>
        </section>
    );
}

/** The mentorship landing page: what needs you, featured mentors, and the directory */
export function MentorshipHome() {
    const { user, loading } = useAuth();
    return (
        <PageShell
            wide
            title="Mentorship"
            subtitle="One-to-one guidance from people who work in security. Ask for a mentor, or give back by becoming one."
            actions={(
                <div className="flex flex-wrap gap-3">
                    <Link href="/mentorship/request" className={btnPrimary}><Sparkles className="h-4 w-4" aria-hidden="true" /> Match me</Link>
                    <Link href="/mentorship/become-mentor" className={btnSecondary}><GraduationCap className="h-4 w-4" aria-hidden="true" /> Become a mentor</Link>
                </div>
            )}
        >
            <MentorshipNav />
            <NeedsYou />
            {!loading && !user && (
                <p className={`mb-8 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/60 ${muted}`}>
                    You can browse mentors without an account. <Link href="/auth?redirect=%2Fmentorship" className="font-medium text-orange-800 underline dark:text-orange-400">Sign in</Link> to ask for one.
                </p>
            )}
            <Featured />
            <MentorDirectory />
        </PageShell>
    );
}
