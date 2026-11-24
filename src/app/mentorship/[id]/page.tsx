import { WorkspaceView } from '@/components/mentorship/WorkspaceView';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <WorkspaceView id={id} />;
}
