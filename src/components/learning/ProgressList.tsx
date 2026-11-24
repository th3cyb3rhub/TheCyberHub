'use client';

import Link from 'next/link';
import { ArrowRight, Award, CheckCircle2 } from 'lucide-react';
import { formatDate, pathHref } from '@/lib/learning/display';
import type { LearningSummary } from '@/types/learning';
import { Chip, ProgressBar } from './shared';
import { card, muted } from '@/components/events/styles';

/** The paths a member is part way through, each with the next step to do */
export function ContinueList({ items, compact = false }: { items: LearningSummary['continue']; compact?: boolean }) {
    return (
        <ul className="space-y-3" data-testid="continue-list">
            {items.map(({ path, progress, next }) => {
                const href = pathHref(path.kind, path.slug);
                return (
                    <li key={path.id} className={`${card} relative p-4 transition-shadow focus-within:ring-2 focus-within:ring-orange-500 hover:shadow-md`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{path.title}</Link>
                            </h3>
                            <Chip tone={path.kind === 'roadmap' ? 'blue' : 'gray'}>{path.kind === 'roadmap' ? 'Roadmap' : 'Path'}</Chip>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                            <ProgressBar className="flex-1" percent={progress.percent} label={`Your progress in ${path.title}`} size="sm" />
                            <span className="w-10 text-right text-xs font-medium text-gray-700 dark:text-gray-300">{progress.percent}%</span>
                        </div>
                        {next && (
                            <p className={`mt-2 flex items-center gap-1 text-sm ${muted}`}>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                                <span className="min-w-0 truncate"><span className="sr-only">Next step: </span>{compact ? '' : 'Next: '}{next.title}</span>
                            </p>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

export function CompletedList({ items }: { items: LearningSummary['recentlyCompleted'] }) {
    return (
        <ul className="space-y-3" data-testid="completed-list">
            {items.map(({ path, completedAt, certificateId }) => (
                <li key={path.id} className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
                    <div className="min-w-0">
                        <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" />
                            <Link href={pathHref(path.kind, path.slug)} className="truncate rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{path.title}</Link>
                        </h3>
                        <p className={`mt-0.5 text-xs ${muted}`}>Completed {formatDate(completedAt)}</p>
                    </div>
                    {certificateId && (
                        <Link href={`/certificates/${certificateId}`} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-orange-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-orange-400">
                            <Award className="h-4 w-4" aria-hidden="true" /> Certificate<span className="sr-only"> for {path.title}</span>
                        </Link>
                    )}
                </li>
            ))}
        </ul>
    );
}
