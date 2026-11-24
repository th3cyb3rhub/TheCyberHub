import { EditLabView } from '@/components/labs/LabFormPages';

export default async function EditLabPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    return <EditLabView slug={slug} />;
}
