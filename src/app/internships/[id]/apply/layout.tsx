import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Apply for an internship',
    description: 'Send your application for this program on TheCyberHub.',
    robots: { index: false, follow: false },
};

export default function InternshipApplyLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
