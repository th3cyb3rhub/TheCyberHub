import type { Metadata } from 'next';
import StructuredData from '@/components/StructuredData';
import { EventDetailView } from '@/components/events/EventDetailView';
import { plainExcerpt } from '@/lib/events/display';
import { eventJsonLd, fetchPublicEvent, SITE_URL } from '@/lib/events/server';

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const result = await fetchPublicEvent(slug);

    if (result.state !== 'ok') {
        // Pending and rejected events are private, so there is nothing to describe or index
        return { title: 'Event', robots: { index: false, follow: false } };
    }

    const { event } = result;
    const description = plainExcerpt(event.shortDescription || event.description || '', 160)
        || `Details about ${event.title}, a ${event.category} on TheCyberHub.`;
    const image = event.image || event.bannerImage;
    const url = `${SITE_URL}/events/${event.slug}`;

    return {
        title: event.title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title: event.title,
            description,
            url,
            type: 'website',
            siteName: 'TheCyberHub',
            images: [image ? { url: image, alt: event.title } : { url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }],
        },
        twitter: {
            card: 'summary_large_image',
            title: event.title,
            description,
            images: [image || '/twitter-image.png'],
        },
    };
}

export default async function EventPage({ params }: PageProps) {
    const { slug } = await params;
    const result = await fetchPublicEvent(slug);
    const event = result.state === 'ok' ? result.event : null;

    return (
        <>
            {event && <StructuredData data={JSON.parse(JSON.stringify(eventJsonLd(event)))} />}
            <EventDetailView slug={slug} initialEvent={event} />
        </>
    );
}
