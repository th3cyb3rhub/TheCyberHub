import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LabDetailView } from '@/components/labs/LabDetailView';
import { excerpt } from '@/lib/labs/display';
import { fetchPublicLab, SITE_URL } from '@/lib/labs/server';

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    // The same request as the page below: `fetchPublicLab` is cached per render
    const result = await fetchPublicLab(slug);

    if (result.state !== 'ok') {
        // A draft, an archived lab or an unknown slug stays out of search results
        return { title: 'Lab', robots: { index: false, follow: false } };
    }

    const { lab } = result;
    const description = excerpt(lab.description, 160) || `${lab.title}: a guided flag exercise on TheCyberHub.`;
    const url = `${SITE_URL}/labs/${lab.slug}`;

    return {
        title: lab.title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title: `${lab.title} | TheCyberHub Labs`,
            description,
            url,
            type: 'website',
            siteName: 'TheCyberHub',
            images: [{ url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }],
        },
        twitter: { card: 'summary_large_image', title: lab.title, description, images: ['/twitter-image.png'] },
    };
}

export default async function LabPage({ params }: PageProps) {
    const { slug } = await params;
    const result = await fetchPublicLab(slug);
    // A segment that cannot be a lab slug is a real 404
    if (result.state === 'invalid') notFound();
    // A draft or archived lab is hidden from the server's anonymous request, but staff may open it:
    // the browser asks again with the token and shows "not available" on its own 404. The same goes
    // for a slow or failing API. The answer is HTTP 200 on purpose (a 404 here would hide the staff
    // preview), so the page is marked noindex in `generateMetadata` instead.
    return <LabDetailView slug={slug.toLowerCase()} initialLab={result.state === 'ok' ? result.lab : null} initialUpdatedAt={Date.now()} />;
}
