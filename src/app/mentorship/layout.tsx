import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Mentorship',
    description: 'Connect with experienced cybersecurity mentors and get one-to-one guidance for your security career.',
    openGraph: {
        title: 'Cybersecurity Mentorship | TheCyberHub',
        description: 'Connect with cybersecurity mentors and accelerate your infosec career.',
        type: 'website',
    },
};

export default function MentorshipLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
