import type { Metadata } from 'next';
import { Suspense } from 'react';
import { pageBg, pageWrap } from '@/components/events/styles';
import { CrHero } from '@/components/code-review/CrHero';
import { ServerSnippetList } from '@/components/code-review/ServerSnippetList';
import { SnippetsExplorer } from '@/components/code-review/SnippetsExplorer';
import { fetchSnippetStats, fetchSnippetsPage } from '@/lib/codeReview/server';

// Every filtered address of the list (?category=, ?q=, ...) names the plain list as the page itself
export const metadata: Metadata = { alternates: { canonical: '/code-review' } };

// The plain list is the same for every visitor: rebuilt at most every five minutes
export const revalidate = 300;

export default async function CodeReviewPage() {
    // Fail-soft: a slow or failing API gives null, and the browser asks again
    const [page, stats] = await Promise.all([fetchSnippetsPage(12), fetchSnippetStats()]);
    // When this copy was built (the render of a cached page is the moment it was cached)
    const builtAt = Date.now();
    return (
        <div className={pageBg}>
            <div className={pageWrap}>
                <CrHero />
                <Suspense fallback={<ServerSnippetList snippets={page ? page.data : null} stats={stats} />}>
                    <SnippetsExplorer initialPage={page} initialStats={stats} initialUpdatedAt={builtAt} />
                </Suspense>
            </div>
        </div>
    );
}
