import { EmployerDashboard } from '@/components/jobs/employer/EmployerDashboard';
import { EmployerGate } from '@/components/jobs/employer/EmployerGate';

export default function EmployerPage() {
    return (
        <EmployerGate returnTo="/employer">
            <EmployerDashboard />
        </EmployerGate>
    );
}
