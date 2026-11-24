import { EmployerGate } from '@/components/jobs/employer/EmployerGate';
import { PostJobView } from '@/components/jobs/employer/PostJobView';

export default function PostJobPage() {
    return (
        <EmployerGate returnTo="/employer/post">
            <PostJobView />
        </EmployerGate>
    );
}
