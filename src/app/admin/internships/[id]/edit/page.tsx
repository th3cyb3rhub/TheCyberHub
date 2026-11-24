import { EditCohortView } from '@/components/internships/CohortFormPages';

export default async function EditCohortPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <EditCohortView id={id} />;
}
