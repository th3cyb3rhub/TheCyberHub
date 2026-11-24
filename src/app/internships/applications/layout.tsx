import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'My applications',
    description: 'Follow your internship applications on TheCyberHub.',
    robots: { index: false, follow: false },
};

export default function MyApplicationsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
