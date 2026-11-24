import type { Metadata } from 'next';
import { SetupView } from '@/components/jobs/employer/SetupView';

export const metadata: Metadata = {
    title: 'Become an employer | TheCyberHub',
    description: 'Register your organisation to post cybersecurity jobs on TheCyberHub.',
    robots: { index: false, follow: false },
};

export default function EmployerSetupPage() {
    return <SetupView />;
}
