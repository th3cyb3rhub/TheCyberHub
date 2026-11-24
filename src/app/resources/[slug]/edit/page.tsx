import { EditView } from '@/components/resources/EditView';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
    return <EditView slug={(await params).slug} />;
}
