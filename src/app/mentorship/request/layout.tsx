import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Ask for a mentor',
    description: 'Tell us what you want to learn and we will find a mentor.',
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
