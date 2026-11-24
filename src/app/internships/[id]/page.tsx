import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CohortDetailView } from '@/components/internships/CohortDetailView';
import { excerpt } from '@/lib/internships/display';
import { fetchPublicCohort, SITE_URL } from '@/lib/internships/server';

interface PageProps {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    // The same request as the page below: `fetchPublicCohort` is cached per render
    const result = await fetchPublicCohort(id);

    if (result.state !== 'ok') {
        return { title: 'Internship', robots: { index: false, follow: false } };
    }

    const { cohort } = result;
    const description = excerpt(cohort.description, 160) || `Apply to ${cohort.title} on TheCyberHub.`;
    const url = `${SITE_URL}/internships/${cohort._id}`;

    return {
        title: cohort.title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title: `${cohort.title} | TheCyberHub Internships`,
            description,
            url,
            type: 'website',
            siteName: 'TheCyberHub',
            images: [{ url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }],
        },
        twitter: { card: 'summary_large_image', title: cohort.title, description, images: ['/twitter-image.png'] },
    };
}

export default async function InternshipPage({ params }: PageProps) {
    const { id } = await params;
    const result = await fetchPublicCohort(id);
    // An id that cannot be a cohort is a real 404
    if (result.state === 'invalid') notFound();
    // A draft or a switched-off cohort is hidden from the server's anonymous request, but staff
    // may open it: the browser asks again with the token and shows "not available" on its own 404.
    // The same goes for a slow or failing API. Metadata keeps these pages out of search results.
    return <CohortDetailView id={id} initialCohort={result.state === 'ok' ? result.cohort : null} />;
}
