import { CompanyView } from '@/components/jobs/employer/CompanyView';
import { EmployerGate } from '@/components/jobs/employer/EmployerGate';

export default function EmployerCompanyPage() {
    return (
        <EmployerGate returnTo="/employer/company">
            <CompanyView />
        </EmployerGate>
    );
}
