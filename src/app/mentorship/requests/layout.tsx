import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Mentorship requests',
    description: 'Your mentorship requests and the requests waiting for you.',
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
