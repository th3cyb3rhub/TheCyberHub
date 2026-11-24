import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompetitionView } from '@/components/ctf/CompetitionView';
import { competitionMetadata } from '@/lib/ctf/metadata';
import { fetchPublicCompetition } from '@/lib/ctf/server';

interface PageProps {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ tab?: string | string[] }>;
}

export async function generateMetadata({ params }: Pick<PageProps, 'params'>): Promise<Metadata> {
    const { slug } = await params;
    // The same request as the page below: `fetchPublicCompetition` is cached per render.
    // A draft, an unknown slug or a failing API stays out of search results; so does a link only competition.
    const result = await fetchPublicCompetition(slug);
    return competitionMetadata(result.state === 'ok' ? result.competition : null);
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
