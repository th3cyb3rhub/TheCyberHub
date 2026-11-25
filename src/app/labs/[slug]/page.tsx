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
        // A failing API says nothing about the lab: no robots rule, so an outage cannot drop a good page.
        // A draft, an archived lab or an unknown slug stays out of search results.
        return result.state === 'error' ? { title: 'Lab' } : { title: 'Lab', robots: { index: false, follow: false } };
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
    // A segment that cannot be a lab slug, an unknown slug and a draft or archived lab (hidden from the
    // server's anonymous request) are a real HTTP 404. Staff may still open a draft: `not-found.tsx` asks
    // again in the browser with their token. A slow or failing API is not "missing": that page is HTTP
    // 200 and the browser asks again, so a hiccup never tells a search engine the lab is gone.
    if (result.state === 'invalid' || result.state === 'missing') notFound();
    return <LabDetailView slug={slug.toLowerCase()} initialLab={result.state === 'ok' ? result.lab : null} initialUpdatedAt={Date.now()} />;
}
