import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Learning paths',
    description: 'Guided cybersecurity learning paths for every level. Finish a path to earn a certificate.',
    alternates: { canonical: 'https://thecyberhub.org/learning-paths' },
    openGraph: {
        title: 'Learning paths | TheCyberHub',
        description: 'Guided cybersecurity learning paths from beginner to advanced.',
        type: 'website',
    },
};

export default function LearningPathsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
