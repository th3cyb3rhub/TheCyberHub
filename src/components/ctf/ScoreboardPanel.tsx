'use client';

import Link from 'next/link';
import { Medal, RefreshCw, Snowflake, Trophy } from 'lucide-react';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { btnSecondary, card, cardPad, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useCtfLeaderboard, useCtfLiveBoard, useCtfMe } from '@/hooks/queries/useCtf';
import { scoreText } from '@/lib/ctf/display';
import { entryKey, isMyEntry, liveText, type LiveMode } from '@/lib/ctf/scoreboard';
import { isPlayable } from '@/lib/ctf/status';
import { isTeamEntry, type CtfBoardEntry, type CtfCompetition, type CtfStatus } from '@/types/ctf';
import { Avatar, Username } from './Person';
import { ErrorState, ListSkeleton } from './ListStates';

const rankStyle = (rank: number) =>
    rank === 1 ? 'bg-yellow-100 text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-300'
        : rank === 2 ? 'bg-gray-200 text-gray-900 dark:bg-gray-400/20 dark:text-gray-200'
            : rank === 3 ? 'bg-orange-100 text-orange-900 dark:bg-orange-600/20 dark:text-orange-300'
                : 'bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-gray-400';

/** The number is always there; the medal is a second signal for the top three, never the only one */
export function Rank({ rank }: { rank: number }) {
    return (
        <span className={`inline-flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-lg px-1.5 text-sm font-bold ${rankStyle(rank)}`}>
            {rank <= 3 && <Medal className="h-3.5 w-3.5" aria-hidden="true" />}
            {rank}<span className="sr-only"> place</span>
        </span>
    );
}

function Entry({ entry, mine }: { entry: CtfBoardEntry; mine: boolean }) {
    return (
        <tr className={mine ? 'bg-orange-50 dark:bg-orange-500/10' : undefined} data-testid="board-row" data-mine={mine || undefined} aria-current={mine ? 'true' : undefined}>
            <td className="px-3 py-2.5 sm:px-4"><Rank rank={entry.rank} /></td>
            <td className="min-w-0 px-3 py-2.5 sm:px-4">
                {isTeamEntry(entry) ? (
                    <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={entry.teamName} src={entry.captain?.avatar} />
                        <span className="min-w-0">
                            <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{entry.teamName}</span>
                                {mine && <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">Your team</span>}
                            </span>
                            <span className="block truncate text-xs text-gray-600 dark:text-gray-400">
                                {entry.captain ? <>Captain <Link href={`/user/${encodeURIComponent(entry.captain.username)}`} className="hover:underline">@{entry.captain.username}</Link> {'·'} </> : null}
                                {entry.members} {entry.members === 1 ? 'member' : 'members'}
                            </span>
                        </span>
                    </span>
                ) : (
                    <Username username={entry.username} avatar={entry.avatar} you={mine} />
                )}
            </td>
            <td className="px-3 py-2.5 text-right text-sm tabular-nums text-gray-800 dark:text-gray-200 sm:px-4">{entry.solves}</td>
            <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums text-gray-900 dark:text-white sm:px-4">{scoreText(entry.points)}</td>
        </tr>
    );
}

/**
 * The board of the competition: solo or team, top 100, frozen indicator, the viewer's own row
 * highlighted. It refreshes by push when the socket is joined, else by polling while the tab is in
 * front.
 */
export function ScoreboardPanel({ competition, status, signedIn }: { competition: CtfCompetition; status: CtfStatus; signedIn: boolean }) {
    const { user } = useAuth();
    const started = isPlayable(status) || status === 'ended';
    const pushed = useCtfLiveBoard(competition.slug, { enabled: isPlayable(status), dynamic: competition.scoringMode === 'dynamic' });
    const board = useCtfLeaderboard(competition.slug, { enabled: started, status, pushed });
    const meQuery = useCtfMe(competition.slug, signedIn && started);
    const me = meQuery.data;

    if (!started) {
        return (
            <EmptyState
                icon={Trophy}
                title={status === 'cancelled' ? 'This competition was cancelled' : 'The scoreboard opens when the competition starts'}
                description={status === 'cancelled' ? 'There is no board to show.' : 'Nobody has scored yet.'}
            />
        );
    }
    if (board.isLoading) return <ListSkeleton count={4} label="Loading the scoreboard" />;
    if (board.isError && !board.data) return <ErrorState error={board.error} onRetry={() => void board.refetch()} title="Could not load the scoreboard" />;

    const data = board.data;
    const rows = data?.data ?? [];
    const mode: LiveMode = status === 'ended' ? 'static' : pushed ? 'push' : 'poll';
    const mine = signedIn ? rows.find((r) => isMyEntry(r, me, user?.username)) : undefined;

    return (
        <div data-testid="scoreboard" data-mode={data?.mode}>
            {data?.frozen && (
                <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100" data-testid="frozen-note">
                    <Snowflake className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                        <strong>Frozen.</strong> This is the board as it stood{data.frozenAt ? <> at <ViewerTime iso={data.frozenAt} kind="moment" /></> : ''}.
                        Flags sent since still count; the final standings appear when the competition ends.
                    </span>
                </p>
            )}
            {!data?.frozen && status === 'frozen' && (
                <p className={`mb-4 text-sm ${muted}`}>You see the live board because you are staff. Everybody else sees it frozen.</p>
            )}

            {signedIn && me && (
                <div className={`${cardPad} mb-4 flex flex-wrap items-center gap-x-8 gap-y-2`} data-testid="my-standing">
                    <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>{competition.teamsEnabled ? 'Your team' : 'You'}</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {me.rank ? <>Rank {me.rank}</> : 'Not ranked yet'}
                            {me.rank && me.rankFrozen && <span className="ml-2 text-xs font-medium text-cyan-800 dark:text-cyan-300">(frozen rank)</span>}
                        </p>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200"><strong>{scoreText(me.points)}</strong> {me.points === 1 ? 'point' : 'points'} {'·'} <strong>{me.solveCount}</strong> {me.solveCount === 1 ? 'solve' : 'solves'}</p>
                    {competition.teamsEnabled && !me.team && <p className={`text-sm ${muted}`}>Join or create a team to score.</p>}
                </div>
            )}

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className={`text-xs ${muted}`} data-testid="live-note">{liveText(mode, status === 'ended' ? 0 : 20)}</p>
                {status !== 'ended' && (
                    <button type="button" className={`${btnSecondary} !px-3 !py-1.5 text-xs`} onClick={() => void board.refetch()} disabled={board.isFetching}>
                        <RefreshCw className={`h-3.5 w-3.5 ${board.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
                    </button>
                )}
            </div>

            {rows.length === 0 ? (
                <EmptyState icon={Trophy} title="No scores yet" description={competition.teamsEnabled ? 'No team has solved a challenge yet. Be the first.' : 'Nobody has solved a challenge yet. Be the first.'} />
            ) : (
                <div className={`${card} overflow-hidden`}>
                    <table className="w-full table-fixed text-left" data-testid="board-table">
                        <caption className="sr-only">Scoreboard, {data?.mode === 'team' ? 'teams' : 'players'} by points{data?.frozen ? ', frozen' : ''}</caption>
                        <thead>
                            <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:border-neutral-800 dark:text-gray-400">
                                <th scope="col" className="w-20 px-3 py-3 sm:px-4">Rank</th>
                                <th scope="col" className="px-3 py-3 sm:px-4">{data?.mode === 'team' ? 'Team' : 'Player'}</th>
                                <th scope="col" className="w-16 px-3 py-3 text-right sm:w-20 sm:px-4">Solves</th>
                                <th scope="col" className="w-20 px-3 py-3 text-right sm:w-24 sm:px-4">Points</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                            {rows.map((entry) => <Entry key={entryKey(entry)} entry={entry} mine={!!mine && entryKey(mine) === entryKey(entry)} />)}
                        </tbody>
                    </table>
                </div>
            )}
            {data?.updatedAt && <p className={`mt-3 text-xs ${muted}`}>Updated <ViewerTime iso={data.updatedAt} kind="stamp" /></p>}
        </div>
    );
}

export default ScoreboardPanel;
