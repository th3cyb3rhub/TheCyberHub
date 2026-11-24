import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ResultsView } from '@/components/ctf/ResultsView';
import { fetchPublicResults, SITE_URL } from '@/lib/ctf/server';

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const result = await fetchPublicResults(slug);
    // Results of an ended competition are public and can be found; anything else stays out of search
    if (result.state !== 'ok') return { title: 'Results', robots: { index: false, follow: true } };
    const { competition } = result.results;
    const url = `${SITE_URL}/ctf/competitions/${competition.slug}/results`;
    const winner = result.results.podium[0];
    const name = winner ? ('teamName' in winner ? String(winner.teamName) : String(winner.username)) : null;
    const description = name
        ? `Final results of ${competition.title}: ${name} won. Podium, standings and first bloods.`
        : `Final results of ${competition.title}.`;
    return {
        title: `${competition.title}: results`,
        description,
        alternates: { canonical: url },
        openGraph: { title: `${competition.title}: results | TheCyberHub CTF`, description, url, type: 'website', siteName: 'TheCyberHub' },
    };
}

export default async function ResultsPage({ params }: PageProps) {
    const { slug } = await params;
    const result = await fetchPublicResults(slug);
    if (result.state === 'invalid') notFound();
    // 409 (not ended), 404 (a draft only staff can open) and a failing API are all answered by the
    // browser, which asks again with the token: the page is HTTP 200 and says what is going on.
    return <ResultsView slug={slug.toLowerCase()} initialResults={result.state === 'ok' ? result.results : null} initialUpdatedAt={Date.now()} />;
}
