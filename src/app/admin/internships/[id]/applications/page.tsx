import { CohortApplicationsView } from '@/components/internships/CohortApplicationsView';

export default async function CohortApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <CohortApplicationsView id={id} />;
}
