import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Resource library',
    description: 'Courses, write-ups, tools and videos shared by the cybersecurity community and reviewed by moderators.',
    alternates: { canonical: 'https://thecyberhub.org/resources' },
    openGraph: {
        title: 'Resource library | TheCyberHub',
        description: 'Community-shared cybersecurity learning resources, reviewed by moderators.',
        type: 'website',
    },
};

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
