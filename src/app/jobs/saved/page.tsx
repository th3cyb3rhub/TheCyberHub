import type { Metadata } from 'next';
import { SavedJobsView } from '@/components/jobs/SavedJobsView';

export const metadata: Metadata = {
    title: 'Saved jobs',
    description: 'The jobs you saved on TheCyberHub.',
    robots: { index: false, follow: false },
};

export default function SavedJobsPage() {
    return <SavedJobsView />;
}
