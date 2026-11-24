import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Mentorship',
    description: 'Your mentorship workspace.',
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
