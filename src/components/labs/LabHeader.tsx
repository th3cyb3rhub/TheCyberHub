import Link from 'next/link';
import { ArrowLeft, Clock, FileText, Lightbulb, Pencil, Star, Users } from 'lucide-react';
import { btnSecondary, cardPad, chip, focusRing, muted } from '@/components/events/styles';
import { categoryLabel, minutesLabel } from '@/lib/labs/display';
import type { LabDetail } from '@/types/lab';
import { DifficultyBadge, LabStatusBadge, ViewerStatusBadge } from './StatusBadges';

function Fact({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-gray-200 p-3 dark:border-neutral-800">
            <Icon className="mb-1.5 h-4 w-4 text-orange-700 dark:text-orange-400" aria-hidden="true" />
            <dt className={`text-xs ${muted}`}>{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{children}</dd>
        </div>
    );
}

/** Points as the member would be paid now: the base value, and what is left after the hints opened */
function PointsFact({ lab }: { lab: LabDetail }) {
    const viewer = lab.viewer;
    const base = lab.points;
    if (viewer && viewer.myStatus === 'completed') {
        return <>{viewer.pointsAwarded} of {base} pts earned</>;
    }
    if (viewer && viewer.myStatus === 'in-progress' && viewer.pointsAvailable !== base) {
        return <><span data-testid="points-available">{viewer.pointsAvailable}</span> of {base} pts left</>;
    }
    return <><span data-testid="points-available">{base}</span> pts</>;
}

export function LabHeader({ lab, signedIn }: { lab: LabDetail; signedIn: boolean }) {
    const time = minutesLabel(lab.estimatedMinutes);
    const viewer = lab.viewer;
    const admin = lab.admin;
    return (
        <>
            <Link href="/labs" className={`mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${focusRing}`}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All labs
            </Link>

            {admin && (
                <div role="note" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="staff-note">
                    <p>
                        <strong>Staff view.</strong>{' '}
                        {admin.status !== 'published' ? `This lab is ${admin.status}: members cannot see it. ` : ''}
                        {admin.flagCount === 0 ? 'It has no flag, so nobody can complete it yet. ' : `${admin.flagCount} ${admin.flagCount === 1 ? 'flag is' : 'flags are'} set (hidden). `}
                        {admin.startCount} {admin.startCount === 1 ? 'member has' : 'members have'} started it. All hints are shown to you.
                    </p>
                    <Link href={`/admin/labs/${encodeURIComponent(lab.slug)}/edit`} className={btnSecondary}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit lab</Link>
                </div>
            )}

            <header className={`${cardPad} mb-6 !p-6 sm:!p-8`}>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <DifficultyBadge difficulty={lab.difficulty} />
                    <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{categoryLabel(lab.category)}</span>
                    {admin && admin.status !== 'published' && <LabStatusBadge status={admin.status} />}
                    {signedIn && viewer && <ViewerStatusBadge status={viewer.myStatus} />}
                </div>
                <h1 className="mb-3 break-words text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">{lab.title}</h1>
                {lab.description && <p className="mb-6 whitespace-pre-wrap break-words text-base text-gray-700 dark:text-gray-300">{lab.description}</p>}

                <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <Fact icon={Star} label="Points"><PointsFact lab={lab} /></Fact>
                    <Fact icon={Clock} label="Estimated time">{time ?? 'Not given'}</Fact>
                    <Fact icon={Lightbulb} label="Hints">{lab.hintCount}</Fact>
                    <Fact icon={FileText} label="Files">{lab.fileCount}</Fact>
                    <Fact icon={Users} label="Solved by">{lab.completionCount}</Fact>
                </dl>

                {lab.tags.length > 0 && (
                    <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Tags">
                        {lab.tags.map((t) => <li key={t} className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{t}</li>)}
                    </ul>
                )}
            </header>
        </>
    );
}
