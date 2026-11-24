import type { Metadata } from 'next';

/** The employer area is private: it is not indexed, and every page in it asks the API who is calling */
export const metadata: Metadata = {
    title: 'Employer dashboard | TheCyberHub',
    description: 'Post and manage your cybersecurity job listings on TheCyberHub.',
    robots: { index: false, follow: false },
};

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
