import { Gauge } from 'lucide-react';
import { cardPad, muted } from '@/components/events/styles';
import { CR_LIMITS } from '@/lib/codeReview/constants';
import { plural, pointsText } from '@/lib/codeReview/display';
import type { CrViewer } from '@/types/codeReview';
import { StatusBadge } from './Badges';

/** The member's own state on this exercise: status, best score, points and the attempts left today */
export function ProgressPanel({ viewer, staff }: { viewer: CrViewer; staff: boolean }) {
    return (
        <section aria-labelledby="cr-progress" className={cardPad} data-testid="progress-panel" data-status={viewer.status}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 id="cr-progress" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                    <Gauge className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Your progress
                </h2>
                <StatusBadge status={viewer.status} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className={muted}>Best score</dt><dd className="font-semibold text-gray-900 dark:text-white">{viewer.attempts > 0 ? `${viewer.bestPercent}%` : 'No attempt yet'}</dd></div>
                <div><dt className={muted}>Attempts</dt><dd className="font-semibold text-gray-900 dark:text-white">{viewer.attempts}</dd></div>
                <div>
                    <dt className={muted}>{staff ? 'Points' : viewer.passed ? 'Points earned' : 'A pass pays up to'}</dt>
                    <dd className="font-semibold text-gray-900 dark:text-white" data-testid="points-value">
                        {staff ? 'Not scored for staff' : viewer.passed ? pointsText(viewer.pointsEarned) : pointsText(viewer.pointsAvailable)}
                    </dd>
                </div>
                <div><dt className={muted}>Left today</dt><dd className="font-semibold text-gray-900 dark:text-white">{viewer.attemptsLeftToday} of {CR_LIMITS.attemptsPerDay}</dd></div>
            </dl>
            {viewer.hintCost > 0 && <p className={`mt-3 text-xs ${muted}`}>{plural(viewer.hintsUnlocked.length, 'hint')} opened: {pointsText(viewer.hintCost)} off the points.</p>}
            {staff && <p className={`mt-3 text-xs ${muted}`}>Staff accounts are graded but never earn points.</p>}
            {!staff && !viewer.passed && viewer.solutionViewed && <p className="mt-3 text-xs text-amber-900 dark:text-amber-300">You opened the solution, so a pass pays 0 points.</p>}
            {!staff && !viewer.passed && viewer.pointsForfeited && !viewer.solutionViewed && (
                <p className="mt-3 text-xs text-amber-900 dark:text-amber-300" data-testid="forfeited-note">An attempt had more wrong marks than this exercise has findings, so its points are gone. You can still pass it for the practice.</p>
            )}
        </section>
    );
}
