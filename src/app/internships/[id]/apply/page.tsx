import { ApplyView } from '@/components/internships/ApplyView';

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ApplyView id={id} />;
}
