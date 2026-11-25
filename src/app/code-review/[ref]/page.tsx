import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExerciseView } from '@/components/code-review/ExerciseView';
import { excerpt } from '@/lib/codeReview/display';
import { fetchPublicSnippet, SITE_URL } from '@/lib/codeReview/server';

interface PageProps {
    params: Promise<{ ref: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { ref } = await params;
    // The same request as the page below: `fetchPublicSnippet` is cached per render
    const result = await fetchPublicSnippet(ref);

    if (result.state !== 'ok') {
        // A failing API says nothing about the exercise: no robots rule, so an outage cannot drop a good page.
        // A draft or an unknown slug stays out of search results.
        return result.state === 'error' ? { title: 'Code review exercise' } : { title: 'Code review exercise', robots: { index: false, follow: false } };
    }

    const { snippet } = result;
    const description = excerpt(snippet.description, 160) || `${snippet.title}: a secure code review exercise on TheCyberHub.`;
    const url = `${SITE_URL}/code-review/${snippet.slug}`;

    return {
        title: snippet.title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title: `${snippet.title} | TheCyberHub Code Review`,
            description,
            url,
            type: 'website',
            siteName: 'TheCyberHub',
            images: [{ url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }],
        },
        twitter: { card: 'summary_large_image', title: snippet.title, description, images: ['/twitter-image.png'] },
    };
}

export default async function CodeReviewExercisePage({ params }: PageProps) {
    const { ref } = await params;
    const result = await fetchPublicSnippet(ref);
    // A segment that cannot be an exercise reference, an unknown slug and a draft (hidden from the
    // server's anonymous request) are a real HTTP 404. Staff may still open a draft: `not-found.tsx`
    // asks again in the browser with their token. A slow or failing API is not "missing": that page is
    // HTTP 200 and the browser asks again, so a hiccup never tells a search engine the exercise is gone.
    if (result.state === 'invalid' || result.state === 'missing') notFound();
    return <ExerciseView slug={ref.toLowerCase()} initialSnippet={result.state === 'ok' ? result.snippet : null} initialUpdatedAt={Date.now()} />;
}
