import type { Metadata } from 'next';
import { PathPage, pathMetadata } from '@/components/learning/PathPage';

interface PageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    return pathMetadata('roadmap', (await params).slug);
}

export default async function RoadmapPage({ params }: PageProps) {
    return <PathPage kind="roadmap" slug={(await params).slug} />;
}
