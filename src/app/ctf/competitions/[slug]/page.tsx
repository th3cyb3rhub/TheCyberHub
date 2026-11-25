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
    // A draft or an unknown slug stays out of search results, and so does a link only competition; a failing API says nothing about indexing.
    const result = await fetchPublicCompetition(slug);
    return competitionMetadata(result.state === 'ok' ? result.competition : null, result.state === 'error');
}

export default async function CompetitionPage({ params, searchParams }: PageProps) {
    const { slug } = await params;
    const { tab } = await searchParams;
    const result = await fetchPublicCompetition(slug);
    // A segment that cannot be a slug, an unknown slug and a draft (hidden from the server's anonymous
    // request) are a real HTTP 404. Staff may still open a draft: `not-found.tsx` asks again in the
    // browser with their token. A slow or failing API is not "missing": that page is HTTP 200 and the
    // browser asks again, so a hiccup never tells a search engine the competition is gone.
    if (result.state === 'invalid' || result.state === 'missing') notFound();
    return (
        <CompetitionView
            slug={slug.toLowerCase()}
            initialCompetition={result.state === 'ok' ? result.competition : null}
            initialUpdatedAt={result.state === 'ok' ? result.fetchedAt : 0}
            initialTab={Array.isArray(tab) ? tab[0] : tab}
        />
    );
}
