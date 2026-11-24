import { EditJobView } from '@/components/jobs/employer/EditJobView';
import { EmployerGate } from '@/components/jobs/employer/EmployerGate';

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <EmployerGate returnTo={`/employer/edit/${encodeURIComponent(id)}`}>
            <EditJobView />
        </EmployerGate>
    );
}
