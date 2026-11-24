import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ResultsView } from '@/components/ctf/ResultsView';
import { isUnlisted, resultsMetadata } from '@/lib/ctf/metadata';
import { fetchPublicCompetition, fetchPublicResults } from '@/lib/ctf/server';

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const result = await fetchPublicResults(slug);
    // Results of an ended competition are public and can be found; anything else stays out of search
    if (result.state !== 'ok') return resultsMetadata(null, false);
    // The results may not say whether the competition is link only: the (cached) detail does
    let unlisted = isUnlisted(result.results.competition);
    if (!unlisted && result.results.competition.isPublic === undefined) {
        const detail = await fetchPublicCompetition(slug);
        unlisted = detail.state === 'ok' && isUnlisted(detail.competition);
    }
    return resultsMetadata(result.results, unlisted);
}

export default async function ResultsPage({ params }: PageProps) {
    const { slug } = await params;
    const result = await fetchPublicResults(slug);
    if (result.state === 'invalid') notFound();
    // 409 (not ended), 404 (a draft only staff can open) and a failing API are all answered by the
    // browser, which asks again with the token: the page is HTTP 200 and says what is going on.
    return <ResultsView slug={slug.toLowerCase()} initialResults={result.state === 'ok' ? result.results : null} initialUpdatedAt={Date.now()} />;
}
