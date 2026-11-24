import { EditCtfView } from '@/components/ctf/admin/CtfFormPages';

export default async function EditCtfPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    return <EditCtfView slug={slug} />;
}
