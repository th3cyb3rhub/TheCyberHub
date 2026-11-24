'use client';

import Link from 'next/link';
import { ArrowRight, Award, PartyPopper, Trophy } from 'lucide-react';
import { btnPrimary, btnSecondary, cardPad, muted } from '@/components/events/styles';
import { useNextLabCards } from '@/hooks/queries/useLabs';
import { categoryLabel, pickNextLab, pointsText } from '@/lib/labs/display';
import type { LabBadge, LabDetail } from '@/types/lab';
import { DifficultyBadge } from './StatusBadges';
import { ViewerTime } from '@/components/internships/ViewerTime';

/** What the member sees once the lab is done: the points, any new badge and a lab to do next */
export function CompletedPanel({ lab, pointsEarned, badges = [], justNow = false }: { lab: LabDetail; pointsEarned: number; badges?: LabBadge[]; justNow?: boolean }) {
    const cards = useNextLabCards(lab.category, true);
    const next = cards.data ? pickNextLab(cards.data, lab) : null;
    const completedAt = lab.viewer?.completedAt ?? null;
    return (
        <section aria-labelledby="lab-completed" className={`${cardPad} border-green-300 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10`} data-testid="completed-panel">
            <h2 id="lab-completed" className="mb-1 flex items-center gap-2 text-lg font-semibold text-green-950 dark:text-green-100">
                {justNow ? <PartyPopper className="h-5 w-5" aria-hidden="true" /> : <Trophy className="h-5 w-5" aria-hidden="true" />}
                {justNow ? 'Flag accepted' : 'Lab completed'}
            </h2>
            <p className="text-sm text-green-950 dark:text-green-100" data-testid="points-earned">
                You earned <strong>{pointsText(pointsEarned)}</strong>
                {lab.points > pointsEarned && <> of {lab.points} (hints you opened took the rest off)</>}.
                {completedAt && !justNow && <> Finished <ViewerTime iso={completedAt} kind="moment" />.</>}
            </p>
            <p className={`mt-1 text-xs ${muted}`}>Points are paid once, so sending the flag again changes nothing.</p>

            {badges.length > 0 && (
                <div className="mt-4" data-testid="new-badges">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-950 dark:text-green-100"><Award className="h-4 w-4" aria-hidden="true" /> New {badges.length === 1 ? 'badge' : 'badges'}</h3>
                    <ul className="flex flex-wrap gap-2">
                        {badges.map((b) => (
                            <li key={b.code} className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-green-500/30 dark:bg-neutral-900 dark:text-white">
                                {b.name} <span className={`text-xs ${muted}`}>({b.rarity})</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="mt-4 border-t border-green-200 pt-4 dark:border-green-500/20" data-testid="next-lab">
                <h3 className="mb-2 text-sm font-semibold text-green-950 dark:text-green-100">What next</h3>
                {next ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                        <div className="min-w-0">
                            <p className="break-words text-sm font-medium text-gray-900 dark:text-white">{next.title}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-700 dark:text-gray-300"><DifficultyBadge difficulty={next.difficulty} /> {categoryLabel(next.category)} {'·'} {next.points} pts</p>
                        </div>
                        <Link href={`/labs/${next.slug}`} className={btnPrimary}>Next lab <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                    </div>
                ) : (
                    <p className={`text-sm ${muted}`}>{cards.isLoading ? 'Looking for another lab in this category.' : `No other open lab in ${categoryLabel(lab.category).toLowerCase()} right now.`}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/labs" className={btnSecondary}>All labs</Link>
                    <Link href="/labs?tab=leaderboard" className={btnSecondary}><Trophy className="h-4 w-4" aria-hidden="true" /> Leaderboard</Link>
                </div>
            </div>
        </section>
    );
}
