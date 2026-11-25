import { CohortRecovery } from '@/components/internships/CohortRecovery';
import { MissingPage } from '@/components/ui/MissingNotice';

// A server component: the notice is part of the page the server sends, the island asks again only for a viewer with a token
export default function NotFound() {
    return <CohortRecovery missing={<MissingPage kind="program" />} />;
}
