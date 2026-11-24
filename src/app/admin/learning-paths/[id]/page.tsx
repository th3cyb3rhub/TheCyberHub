import { PathEditor } from '@/components/learning/admin/PathEditor';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <PathEditor pathRef={id} />;
}
