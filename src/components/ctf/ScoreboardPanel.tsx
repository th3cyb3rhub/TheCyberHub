'use client';

import { RefreshCw, Snowflake, Trophy } from 'lucide-react';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { btnSecondary, cardPad, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useCtfLeaderboard, useCtfLiveBoard, useCtfMe } from '@/hooks/queries/useCtf';
import { scoreText } from '@/lib/ctf/display';
import { isCtfWriter } from '@/lib/ctf/roles';
import { isMyEntry, liveText, type LiveMode } from '@/lib/ctf/scoreboard';
import { isPlayable } from '@/lib/ctf/status';
import type { CtfCompetition, CtfStatus } from '@/types/ctf';
import { BoardTable } from './BoardTable';
import { ErrorState, ListSkeleton } from './ListStates';

/**
 * The board of the competition: solo or team, top 100, frozen indicator, the viewer's own row
 * highlighted. It refreshes by push when the socket is joined, else by polling while the tab is in
 * front.
 */
export function ScoreboardPanel({ competition, status, signedIn }: { competition: CtfCompetition; status: CtfStatus; signedIn: boolean }) {
    const { user } = useAuth();
    const started = isPlayable(status) || status === 'ended';
    const pushed = useCtfLiveBoard(competition.slug, { enabled: status === 'live', dynamic: competition.scoringMode === 'dynamic' });
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
            {/* Only admins and owners get the live board during a freeze; a moderator sees the frozen one like everybody else */}
            {!data?.frozen && status === 'frozen' && isCtfWriter(user?.role) && (
                <p className={`mb-4 text-sm ${muted}`} data-testid="staff-live-note">You see the live board because you are an administrator. Everybody else sees it frozen.</p>
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
                <BoardTable
                    entries={rows}
                    mode={data?.mode === 'team' ? 'team' : 'solo'}
                    caption={`Scoreboard, ${data?.mode === 'team' ? 'teams' : 'players'} by points${data?.frozen ? ', frozen' : ''}`}
                    isMine={(entry) => !!mine && entry === mine}
                />
            )}
            {data?.updatedAt && <p className={`mt-3 text-xs ${muted}`}>Updated <ViewerTime iso={data.updatedAt} kind="stamp" /></p>}
        </div>
    );
}

export default ScoreboardPanel;
