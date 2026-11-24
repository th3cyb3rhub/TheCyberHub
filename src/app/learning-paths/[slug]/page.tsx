import type { Metadata } from 'next';
import { PathPage, pathMetadata } from '@/components/learning/PathPage';

interface PageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    return pathMetadata('path', (await params).slug);
}

export default async function LearningPathPage({ params }: PageProps) {
    return <PathPage kind="path" slug={(await params).slug} />;
}
