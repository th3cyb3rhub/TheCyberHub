import { Info } from 'lucide-react';
import { DECAY_TABLE, DYNAMIC_FLOOR_PERCENT } from '@/lib/ctf/constants';
import { muted } from '@/components/events/styles';
import type { CtfScoringMode } from '@/types/ctf';

const range = (from: number, to: number | null) => (to === null ? `${from} or more` : from === to ? `${from}` : `${from} to ${to}`);

/** How points work in this competition. A dynamic one shows the table the API uses. */
export function ScoringExplainer({ mode, teamsEnabled, awardsPoints }: { mode: CtfScoringMode; teamsEnabled: boolean; awardsPoints: boolean }) {
    const who = teamsEnabled ? 'teams' : 'players';
    return (
        <div data-testid="scoring-explainer">
            {mode === 'static' ? (
                <p className="text-sm text-gray-800 dark:text-gray-200">Static scoring: every challenge pays the same fixed points to everyone who solves it.</p>
            ) : (
                <>
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                        Dynamic scoring: a challenge pays a share of its base points that falls with the number of {who} that solved it before you.
                        The value is fixed at the moment you solve it, so earlier solvers keep what they earned. It never falls below {DYNAMIC_FLOOR_PERCENT} % of the base points, or 1 point.
                    </p>
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full max-w-md text-left text-sm">
                            <caption className="sr-only">Share of the base points by number of earlier solves</caption>
                            <thead>
                                <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-neutral-800 dark:text-gray-400">
                                    <th scope="col" className="py-2 pr-4">Solved before</th>
                                    <th scope="col" className="py-2 text-right">Share of the base points</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                                {DECAY_TABLE.map((row) => (
                                    <tr key={row.from}>
                                        <td className="py-1.5 pr-4 text-gray-800 dark:text-gray-200">{range(row.from, row.to)}</td>
                                        <td className="py-1.5 text-right font-medium text-gray-900 dark:text-white">{row.percent} %</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
            <p className={`mt-3 flex items-start gap-2 text-sm ${muted}`}>
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {awardsPoints
                    ? 'Points you earn here can also be added to your account and count on the global leaderboard. A challenge that was already paid to your account through another source is not paid twice.'
                    : 'Points you earn here count on this competition’s board only, not on the global leaderboard.'}
            </p>
        </div>
    );
}
