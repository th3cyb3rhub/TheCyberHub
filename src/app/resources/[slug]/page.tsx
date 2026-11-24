import type { Metadata } from 'next';
import StructuredData from '@/components/StructuredData';
import { ResourceDetailView } from '@/components/resources/ResourceDetailView';
import { fetchPublicResource, resourceJsonLd, SITE_URL } from '@/lib/learning/server';

interface PageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const result = await fetchPublicResource(slug);
    if (result.state !== 'ok') {
        // Pending and rejected entries are private, so there is nothing to describe or index
        return { title: 'Resource', robots: { index: false, follow: false } };
    }
    const r = result.data;
    const url = `${SITE_URL}/resources/${r.slug}`;
    const description = r.description.replace(/\s+/g, ' ').trim().slice(0, 160);
    return {
        title: r.title,
        description,
        alternates: { canonical: url },
        openGraph: { title: r.title, description, url, type: 'website', siteName: 'TheCyberHub', images: [{ url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }] },
        twitter: { card: 'summary_large_image', title: r.title, description, images: ['/twitter-image.png'] },
    };
}

export default async function ResourcePage({ params }: PageProps) {
    const { slug } = await params;
    const result = await fetchPublicResource(slug);
    const resource = result.state === 'ok' ? result.data : null;
    return (
        <>
            {resource && <StructuredData data={JSON.parse(JSON.stringify(resourceJsonLd(resource)))} />}
            <ResourceDetailView slug={slug} initialResource={resource} />
        </>
    );
}
