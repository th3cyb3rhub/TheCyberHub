import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompetitionView } from '@/components/ctf/CompetitionView';
import { excerpt } from '@/lib/labs/display';
import { fetchPublicCompetition, SITE_URL } from '@/lib/ctf/server';

interface PageProps {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ tab?: string | string[] }>;
}

export async function generateMetadata({ params }: Pick<PageProps, 'params'>): Promise<Metadata> {
    const { slug } = await params;
    // The same request as the page below: `fetchPublicCompetition` is cached per render
    const result = await fetchPublicCompetition(slug);

    if (result.state !== 'ok') {
        // A draft, an unknown slug or a failing API stays out of search results
        return { title: 'Competition', robots: { index: false, follow: false } };
    }

    const { competition } = result;
    const description = excerpt(competition.shortDescription || competition.description, 160) || `${competition.title}: a capture the flag competition on TheCyberHub.`;
    const url = `${SITE_URL}/ctf/competitions/${competition.slug}`;

    return {
        title: competition.title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title: `${competition.title} | TheCyberHub CTF`,
            description,
            url,
            type: 'website',
            siteName: 'TheCyberHub',
            images: [{ url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }],
        },
        twitter: { card: 'summary_large_image', title: competition.title, description, images: ['/twitter-image.png'] },
    };
}

export default async function CompetitionPage({ params, searchParams }: PageProps) {
    const { slug } = await params;
    const { tab } = await searchParams;
    const result = await fetchPublicCompetition(slug);
    // A segment that cannot be a slug is a real 404
    if (result.state === 'invalid') notFound();
    // A draft is hidden from the server's anonymous request, but staff may open it: the browser asks
    // again with the token and shows "not available" on its own 404. The same goes for a slow or
    // failing API. The answer is HTTP 200 on purpose (a 404 here would hide the staff preview), so
    // the page is marked noindex in `generateMetadata` instead.
    return (
        <CompetitionView
            slug={slug.toLowerCase()}
            initialCompetition={result.state === 'ok' ? result.competition : null}
            initialUpdatedAt={Date.now()}
            initialTab={Array.isArray(tab) ? tab[0] : tab}
        />
    );
}
