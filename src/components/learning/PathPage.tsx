import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import StructuredData from '@/components/StructuredData';
import { pathHref } from '@/lib/learning/display';
import { pathMoveTarget } from '@/lib/learning/redirect';
import { fetchPublicPath, pathDescription, pathJsonLd, SITE_URL } from '@/lib/learning/server';
import type { PathKind } from '@/types/learning';
import { LearningPathView } from './LearningPathView';

/**
 * The detail page of a roadmap or a learning path (one component for both): the public version is
 * fetched here, shared by the metadata and the page, and the browser refetches with the member's token.
 */
export async function pathMetadata(kind: PathKind, slug: string): Promise<Metadata> {
    const result = await fetchPublicPath(slug);
    if (result.state !== 'ok') {
        const title = kind === 'roadmap' ? 'Roadmap' : 'Learning path';
        // A failing API says nothing about the path: no robots rule, so an outage cannot drop a good page.
        // Drafts and unknown slugs: nothing to describe or index.
        return result.state === 'error' ? { title } : { title, robots: { index: false, follow: false } };
    }
    const path = result.data;
    const url = `${SITE_URL}${pathHref(path.kind, path.slug)}`;
    const description = pathDescription(path);
    return {
        title: path.title,
        description,
        alternates: { canonical: url },
        openGraph: { title: path.title, description, url, type: 'website', siteName: 'TheCyberHub', images: [{ url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }] },
        twitter: { card: 'summary_large_image', title: path.title, description, images: ['/twitter-image.png'] },
    };
}

export async function PathPage({ kind, slug }: { kind: PathKind; slug: string }) {
    const result = await fetchPublicPath(slug);
    const path = result.state === 'ok' ? result.data : null;
    // A roadmap opened under the learning-paths address (or the other way round) moves to its own page
    // (only to a well formed address of the other kind, never to the one that was asked for)
    const moved = path ? pathMoveTarget(kind, slug, path) : null;
    if (moved) permanentRedirect(moved);
    return (
        <>
            {path && <StructuredData data={JSON.parse(JSON.stringify(pathJsonLd(path)))} />}
            <LearningPathView slug={slug} kind={kind} initialPath={path} />
        </>
    );
}
