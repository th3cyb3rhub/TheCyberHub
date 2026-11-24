'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Medal, Trophy } from 'lucide-react';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { card, cardPad, input, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useGlobalLeaderboard, useLabLeaderboard, useLabStats } from '@/hooks/queries/useLabs';
import { categoryLabel, DIFFICULTY_LABELS, safeHref } from '@/lib/labs/display';
import { LAB_CATEGORIES, LAB_DIFFICULTIES, type LabCategory, type LeaderUser } from '@/types/lab';
import { ErrorState, ListSkeleton } from './ListStates';

const rankStyle = (rank: number) =>
    rank === 1 ? 'bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-300'
        : rank === 2 ? 'bg-gray-200 text-gray-900 dark:bg-gray-400/20 dark:text-gray-200'
            : rank === 3 ? 'bg-orange-100 text-orange-900 dark:bg-orange-600/20 dark:text-orange-300'
                : 'bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-gray-400';

/** Name, username and avatar only: that is all the API gives for a person on a board */
function Person({ user }: { user: LeaderUser }) {
    const avatar = safeHref(user.avatar);
    const label = user.name || user.username;
    return (
        <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 text-xs font-bold text-gray-800 dark:bg-white/10 dark:text-gray-300" aria-hidden="true">
                {avatar ? <Image src={avatar} alt="" width={32} height={32} className="h-full w-full object-cover" unoptimized /> : label.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
                <Link href={`/user/${encodeURIComponent(user.username)}`} className="block truncate text-sm font-medium text-gray-900 hover:text-orange-700 dark:text-white dark:hover:text-orange-400">
                    {label}
                </Link>
                <span className="block truncate text-xs text-gray-600 dark:text-gray-500">@{user.username}</span>
            </span>
        </div>
    );
}

function Rank({ rank }: { rank: number }) {
    return (
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${rankStyle(rank)}`}>
            {rank}<span className="sr-only"> place</span>
        </span>
    );
}

/** The global board, or one category's. Public data: the same for everyone. */
export function LabsLeaderboard({ category, onCategoryChange }: { category: LabCategory | ''; onCategoryChange: (category: LabCategory | '') => void }) {
    const { user } = useAuth();
    const board = useGlobalLeaderboard({ category, limit: 25 });
    const rows = board.data ?? [];

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className={`text-sm ${muted}`}>
                    Ranked by points from labs, then labs completed, then who got there first. Only name, username and avatar are shown. The board can be up to five minutes behind.
                </p>
                <div>
                    <label htmlFor="board-category" className="sr-only">Category</label>
                    <select id="board-category" value={category} onChange={(e) => onCategoryChange(e.target.value as LabCategory | '')} className={`${input} !w-auto`}>
                        <option value="">All categories</option>
                        {LAB_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                    </select>
                </div>
            </div>

            {board.isLoading ? (
                <ListSkeleton count={4} label="Loading the leaderboard" />
            ) : board.isError ? (
                <ErrorState error={board.error} onRetry={() => void board.refetch()} title="Could not load the leaderboard" />
            ) : rows.length === 0 ? (
                <EmptyState icon={Trophy} title="No completions yet" description={category ? `Nobody has completed a ${categoryLabel(category).toLowerCase()} lab yet. Be the first.` : 'Nobody has completed a lab yet. Be the first.'} actionLabel="Browse labs" actionHref="/labs" />
            ) : (
                <div className={`${card} overflow-x-auto`} data-testid="labs-board">
                    <table className="w-full text-left">
                        <caption className="sr-only">Labs leaderboard{category ? `, ${categoryLabel(category)}` : ''}</caption>
                        <thead>
                            <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:border-neutral-800 dark:text-gray-400">
                                <th scope="col" className="w-16 px-3 py-3 sm:px-4">Rank</th>
                                <th scope="col" className="px-3 py-3 sm:px-4">Player</th>
                                <th scope="col" className="hidden px-4 py-3 text-right sm:table-cell">Labs</th>
                                <th scope="col" className="px-3 py-3 text-right sm:px-4">Points</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                            {rows.map((row) => {
                                const me = !!user?.username && row.user.username === user.username;
                                return (
                                    <tr key={row.user.username} aria-current={me ? 'true' : undefined} className={me ? 'bg-orange-50 dark:bg-orange-500/10' : ''} data-testid="board-row">
                                        <td className="px-3 py-3 sm:px-4"><Rank rank={row.rank} /></td>
                                        <td className="px-3 py-3 sm:px-4"><Person user={row.user} />{me && <span className="sr-only"> (you)</span>}</td>
                                        <td className="hidden px-4 py-3 text-right text-sm text-gray-800 dark:text-gray-200 sm:table-cell">{row.labsCompleted}</td>
                                        <td className="px-3 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white sm:px-4">{row.totalPoints}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/** The best completions of one lab: who solved it, with how many points and hints */
export function LabTopSolvers({ slug }: { slug: string }) {
    const board = useLabLeaderboard(slug, 10);
    const rows = board.data ?? [];
    return (
        <section aria-labelledby="lab-solvers" className={cardPad} data-testid="top-solvers">
            <h2 id="lab-solvers" className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                <Medal className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Top solvers
            </h2>
            {board.isLoading ? (
                <div className="space-y-2" role="status" aria-label="Loading top solvers">
                    {[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />)}
                </div>
            ) : board.isError ? (
                <p className={`text-sm ${muted}`}>The top solvers could not be loaded. <button type="button" className="underline" onClick={() => void board.refetch()}>Try again</button></p>
            ) : rows.length === 0 ? (
                <p className={`text-sm ${muted}`}>Nobody has solved this lab yet. Be the first.</p>
            ) : (
                <ol className="space-y-3">
                    {rows.map((row) => (
                        <li key={row.user.username} className="flex items-center gap-3" data-testid="solver-row">
                            <Rank rank={row.rank} />
                            <div className="min-w-0 flex-1"><Person user={row.user} /></div>
                            <div className="shrink-0 text-right text-xs text-gray-700 dark:text-gray-300">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{row.pointsEarned} pts</p>
                                <p>{row.hintsUsed} {row.hintsUsed === 1 ? 'hint' : 'hints'}{row.completedAt && <> {'·'} <ViewerTime iso={row.completedAt} /></>}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

/** The signed-in member's totals and how they split by difficulty */
export function LabsStatsCard() {
    const stats = useLabStats();
    if (stats.isLoading) return <div className={`${card} mb-6 h-24 animate-pulse`} role="status" aria-label="Loading your lab stats" />;
    if (stats.isError || !stats.data) return null;
    const s = stats.data;
    const tile = (label: string, value: number | string, id: string) => (
        <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-neutral-800" data-testid={id}>
            <dt className={`text-xs ${muted}`}>{label}</dt>
            <dd className="text-xl font-bold text-gray-900 dark:text-white">{value}</dd>
        </div>
    );
    return (
        <section aria-labelledby="lab-stats" className={`${card} mb-6 p-5`} data-testid="labs-stats">
            <h2 id="lab-stats" className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Your labs</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {tile('Started', s.totalStarted, 'stat-started')}
                {tile('Completed', s.totalCompleted, 'stat-completed')}
                {tile('Points', s.totalPoints, 'stat-points')}
                {tile('Hints opened', s.totalHintsUsed, 'stat-hints')}
            </dl>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-800 dark:text-gray-200" aria-label="By difficulty">
                {LAB_DIFFICULTIES.map((d) => {
                    const row = s.byDifficulty?.[d];
                    return (
                        <li key={d} data-testid={`stat-${d}`}>
                            <strong>{DIFFICULTY_LABELS[d]}</strong>: {row?.completed ?? 0} of {row?.started ?? 0} completed, {row?.points ?? 0} pts
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
