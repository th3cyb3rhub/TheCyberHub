import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'My mentorships',
    description: 'Your mentorships, sessions and messages.',
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
