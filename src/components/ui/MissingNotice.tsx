import Link from 'next/link';
import { Briefcase, Code2, FlaskConical, GraduationCap, Trophy, type LucideIcon } from 'lucide-react';
import { btnSecondary, muted, pageBg } from '@/components/events/styles';

/** What each kind of page says when there is nothing at its address (or nothing public) */
const COPY = {
    job: { Icon: Briefcase, title: 'This job is not available', text: 'It may have been closed, ended or removed, or it is still waiting for review.', href: '/jobs', label: 'Browse jobs' },
    lab: { Icon: FlaskConical, title: 'This lab is not available', text: 'It may have been removed, or it is not published yet.', href: '/labs', label: 'Back to labs' },
    exercise: { Icon: Code2, title: 'This exercise is not available', text: 'It may have been removed, or it is not published yet.', href: '/code-review', label: 'Back to the exercises' },
    competition: { Icon: Trophy, title: 'This competition is not available', text: 'It may have been removed, or it is not published yet.', href: '/ctf/competitions', label: 'All competitions' },
    results: { Icon: Trophy, title: 'These results are not available', text: 'The competition may have been removed, or it is not published.', href: '/ctf/competitions', label: 'All competitions' },
    program: { Icon: GraduationCap, title: 'This program is not available', text: 'It may have been removed, or it is not published yet.', href: '/internships', label: 'Back to internships' },
} satisfies Record<string, { Icon: LucideIcon; title: string; text: string; href: string; label: string }>;

export type MissingKind = keyof typeof COPY;

/** The notice itself (icon, heading, a way back), for a page that already has its own frame */
export function MissingBody({ kind }: { kind: MissingKind }) {
    const { Icon, title, text, href, label } = COPY[kind];
    return (
        <>
            <Icon className="mx-auto mb-4 h-10 w-10 text-gray-500" aria-hidden="true" />
            <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
            <p className={`mb-6 text-sm ${muted}`}>{text}</p>
            <Link href={href} className={btnSecondary}>{label}</Link>
        </>
    );
}

/**
 * The whole page for an address that has nothing behind it. A server component: the not-found file of
 * a segment renders it, and the viewer who may still read a hidden item gets the real page instead.
 */
export function MissingPage({ kind }: { kind: MissingKind }) {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-2xl px-4 pb-16 pt-28 text-center sm:px-6"><MissingBody kind={kind} /></div>
        </div>
    );
}
