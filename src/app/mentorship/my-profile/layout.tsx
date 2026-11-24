import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'My mentor profile',
    description: 'Your mentor application and listing.',
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
