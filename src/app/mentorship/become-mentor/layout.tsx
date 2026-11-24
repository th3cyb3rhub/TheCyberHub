import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Become a mentor',
    description: 'Apply to mentor members of TheCyberHub.',
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
