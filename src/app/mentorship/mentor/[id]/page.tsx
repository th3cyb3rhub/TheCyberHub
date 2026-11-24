import type { Metadata } from 'next';
import { MentorProfileView } from '@/components/mentorship/MentorProfileView';
import { displayName } from '@/lib/mentorship/display';
import { fetchPublicMentor } from '@/lib/mentorship/server';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;
    const found = await fetchPublicMentor(id);
    if (found.state !== 'ok') {
        return { title: 'Mentor profile', description: 'A mentor profile on TheCyberHub.', robots: found.state === 'missing' ? { index: false, follow: false } : undefined };
    }
    const name = displayName(found.mentor.user);
    const description = `${name} mentors on ${found.mentor.expertiseAreas.slice(0, 3).join(', ')}. ${found.mentor.bio}`.slice(0, 200);
    return {
        title: `${name} - Mentor`,
        description,
        alternates: { canonical: `/mentorship/mentor/${id}` },
        openGraph: { title: `${name} - Mentor | TheCyberHub`, description, type: 'profile' },
    };
}

export default async function MentorProfilePage({ params }: Props) {
    const { id } = await params;
    const found = await fetchPublicMentor(id);
    return <MentorProfileView id={id} initial={found.state === 'ok' ? found.mentor : null} />;
}
