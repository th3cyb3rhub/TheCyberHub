import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Roadmaps',
    description: 'Staged cybersecurity roadmaps from first steps to specialist skills, with links to practice, tools and reading at every step. Track your progress and earn a certificate.',
    alternates: { canonical: 'https://thecyberhub.org/roadmaps' },
    openGraph: {
        title: 'Roadmaps | TheCyberHub',
        description: 'Staged cybersecurity roadmaps with practice, tools and reading at every step.',
        type: 'website',
    },
};

export default function RoadmapsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
