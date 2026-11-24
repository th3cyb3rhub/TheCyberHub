import Link from 'next/link';
import { Medal } from 'lucide-react';
import { card } from '@/components/events/styles';
import { scoreText } from '@/lib/ctf/display';
import { entryKey } from '@/lib/ctf/scoreboard';
import { isTeamEntry, type CtfBoardEntry } from '@/types/ctf';
import { Avatar, Username } from './Person';

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

/** The rows of a board: rank, name, solves and points. `isMine` marks the viewer's own row. */
export function BoardTable({ entries, mode, caption, isMine }: { entries: CtfBoardEntry[]; mode: 'solo' | 'team'; caption: string; isMine?: (entry: CtfBoardEntry) => boolean }) {
    return (
        <div className={`${card} overflow-hidden`}>
            <table className="w-full table-fixed text-left" data-testid="board-table">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:border-neutral-800 dark:text-gray-400">
                        <th scope="col" className="w-20 px-3 py-3 sm:px-4">Rank</th>
                        <th scope="col" className="px-3 py-3 sm:px-4">{mode === 'team' ? 'Team' : 'Player'}</th>
                        <th scope="col" className="w-16 px-3 py-3 text-right sm:w-20 sm:px-4">Solves</th>
                        <th scope="col" className="w-20 px-3 py-3 text-right sm:w-24 sm:px-4">Points</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                    {entries.map((entry) => <Entry key={entryKey(entry)} entry={entry} mine={isMine?.(entry) ?? false} />)}
                </tbody>
            </table>
        </div>
    );
}
