import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CertificateView } from '@/components/learning/CertificateView';
import { fetchCertificate } from '@/lib/learning/server';

interface PageProps { params: Promise<{ id: string }> }

// A certificate is a personal record: anyone with the link can check it, search engines do not list it
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const result = await fetchCertificate(id);
    const title = result.state === 'ok' ? `Certificate: ${result.data.path.title}` : 'Certificate';
    return { title, robots: { index: false, follow: false } };
}

export default async function CertificatePage({ params }: PageProps) {
    const { id } = await params;
    const result = await fetchCertificate(id);
    if (result.state === 'missing') notFound();
    return <CertificateView id={id} initial={result.state === 'ok' ? result.data : null} />;
}
