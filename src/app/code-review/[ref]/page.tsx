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
        // A draft, an unknown slug or a failing API stays out of search results
        return { title: 'Code review exercise', robots: { index: false, follow: false } };
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
    // A segment that cannot be an exercise reference is a real 404
    if (result.state === 'invalid') notFound();
    // A draft is hidden from the server's anonymous request, but staff may open it: the browser asks
    // again with the token and shows "not available" on its own 404. The same goes for a slow or
    // failing API. The answer is HTTP 200 on purpose (a 404 here would hide the staff preview), so
    // the page is marked noindex in `generateMetadata` instead.
    return <ExerciseView slug={ref.toLowerCase()} initialSnippet={result.state === 'ok' ? result.snippet : null} initialUpdatedAt={Date.now()} />;
}
