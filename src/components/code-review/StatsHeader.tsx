'use client';

import { Award, CheckCircle2, Target } from 'lucide-react';
import { card, muted } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { plural } from '@/lib/codeReview/display';
import type { CrStats } from '@/types/codeReview';

/** The member's own numbers (attempted, passed, points) from the stats viewer block, as a header above the list */
export function StatsHeader({ stats }: { stats: CrStats | undefined }) {
    const { user } = useAuth();
    if (!user || !stats?.viewer) return null;
    const v = stats.viewer;
    const percent = stats.total > 0 ? Math.min(100, Math.round((v.passed / stats.total) * 100)) : 0;
    return (
        <section aria-label="Your progress" className={`${card} mb-6 p-5`} data-testid="cr-stats">
            <dl className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-3">
                    <Target className="h-6 w-6 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                    <div><dt className={`text-xs ${muted}`}>Attempted</dt><dd className="text-xl font-semibold text-gray-900 dark:text-white" data-testid="stat-attempted">{v.attempted} <span className={`text-sm font-normal ${muted}`}>of {stats.total}</span></dd></div>
                </div>
                <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" />
                    <div><dt className={`text-xs ${muted}`}>Passed</dt><dd className="text-xl font-semibold text-gray-900 dark:text-white" data-testid="stat-passed">{v.passed}</dd></div>
                </div>
                <div className="flex items-center gap-3">
                    <Award className="h-6 w-6 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                    <div><dt className={`text-xs ${muted}`}>Points earned</dt><dd className="text-xl font-semibold text-gray-900 dark:text-white" data-testid="stat-points">{v.points}</dd></div>
                </div>
            </dl>
            <div className="mt-4">
                <div className="h-2 rounded-full bg-gray-200 dark:bg-neutral-800" role="img" aria-label={`${plural(v.passed, 'exercise')} passed of ${stats.total}`}>
                    <div className="h-2 rounded-full bg-green-600 dark:bg-green-500" style={{ width: `${percent}%` }} />
                </div>
            </div>
        </section>
    );
}
