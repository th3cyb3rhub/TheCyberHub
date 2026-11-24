'use client';

import Link from 'next/link';
import { CalendarClock, CalendarDays, Users } from 'lucide-react';
import { card, chip, focusRing, muted } from '@/components/events/styles';
import { excerpt, spotsInfo, TYPE_LABELS } from '@/lib/internships/display';
import type { CohortCard as Cohort } from '@/types/internship';
import { CohortStatusBadge } from './StatusBadges';
import { ViewerTime } from './ViewerTime';

const MAX_TECH = 4;

export function CohortCard({ cohort }: { cohort: Cohort }) {
    const spots = spotsInfo(cohort);
    const tech = cohort.technologies.slice(0, MAX_TECH);
    const more = cohort.technologies.length - tech.length;

    return (
        <article className={`${card} relative flex h-full flex-col p-5 transition-shadow hover:shadow-md`} data-testid="cohort-card" data-status={cohort.status}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <CohortStatusBadge status={cohort.status} />
                <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{TYPE_LABELS[cohort.type] ?? cohort.type}</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                <Link href={`/internships/${cohort._id}`} className={`rounded after:absolute after:inset-0 after:rounded-2xl hover:underline ${focusRing}`}>{cohort.title}</Link>
            </h3>
            <p className={`mb-4 line-clamp-3 text-sm ${muted}`}>{excerpt(cohort.description, 220)}</p>

            {tech.length > 0 && (
                <ul className="mb-4 flex flex-wrap gap-1.5" aria-label="Technologies">
                    {tech.map((t) => <li key={t} className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{t}</li>)}
                    {more > 0 && <li className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>+{more}</li>}
                </ul>
            )}

            <dl className="mt-auto space-y-1.5 text-sm">
                <div className="flex items-start gap-2">
                    <dt className="sr-only">Runs</dt>
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                    <dd className="text-gray-800 dark:text-gray-200"><ViewerTime iso={cohort.startDate} /> to <ViewerTime iso={cohort.endDate} /></dd>
                </div>
                {cohort.applicationsOpen && (
                    <div className="flex items-start gap-2">
                        <dt className="sr-only">Apply by</dt>
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                        <dd className="font-medium text-gray-900 dark:text-white">Apply by <ViewerTime iso={cohort.applicationDeadline} kind="moment" /></dd>
                    </div>
                )}
                <div className="flex items-start gap-2">
                    <dt className="sr-only">Seats</dt>
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                    <dd className={spots.full ? 'font-medium text-red-800 dark:text-red-300' : 'text-gray-800 dark:text-gray-200'}>
                        {spots.unlimited ? (cohort.status === 'open' ? 'Open seats' : 'No seat limit') : spots.label}
                    </dd>
                </div>
            </dl>
        </article>
    );
}
