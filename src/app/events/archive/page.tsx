import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ArchiveSkeleton, ArchiveView } from '@/components/events/ArchiveView';
import { pageBg } from '@/components/events/styles';
import { SITE_URL } from '@/lib/events/server';

export const metadata: Metadata = {
    title: 'Past events',
    description: 'The archive of TheCyberHub events: recordings, slides and ratings from CTF nights, workshops, webinars and meetups.',
    alternates: { canonical: `${SITE_URL}/events/archive` },
};

export default function ArchivePage() {
    return (
        <Suspense fallback={<div className={pageBg}><div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6"><ArchiveSkeleton /></div></div>}>
            <ArchiveView />
        </Suspense>
    );
}
