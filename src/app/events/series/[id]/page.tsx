import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SeriesView } from '@/components/events/SeriesView';
import { plainExcerpt } from '@/lib/events/display';
import { fetchPublicSeries, SITE_URL } from '@/lib/events/server';
import { describeRecurrence, isSeriesId } from '@/lib/events/series';

interface PageProps {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    if (!isSeriesId(id)) return { title: 'Series', robots: { index: false, follow: false } };
    const result = await fetchPublicSeries(id);
    // A failing API says nothing about the series: no robots rule
    if (result.state !== 'ok') return result.state === 'error' ? { title: 'Series' } : { title: 'Series', robots: { index: false, follow: false } };

    const { series } = result;
    const description = `${describeRecurrence(series.recurrence)}. ${plainExcerpt(series.shortDescription || series.description || '', 120)}`.trim();
    const url = `${SITE_URL}/events/series/${series.id}`;
    return {
        title: series.title,
        description,
        alternates: { canonical: url },
        openGraph: { title: series.title, description, url, type: 'website', siteName: 'TheCyberHub' },
    };
}

export default async function SeriesPage({ params }: PageProps) {
    const { id } = await params;
    // Not an id, so not a series: no request is made
    if (!isSeriesId(id)) notFound();
    const result = await fetchPublicSeries(id);
    // A real 404 for a series that is gone; a failed lookup falls through so the page can ask again in the browser
    if (result.state === 'missing') notFound();
    return <SeriesView id={id} initialSeries={result.state === 'ok' ? result.series : null} />;
}
