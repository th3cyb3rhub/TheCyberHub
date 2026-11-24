import { isTeamEntry, type CtfBoardEntry, type CtfMe } from '@/types/ctf';

/** Whether a row of the board is the viewer (solo) or the viewer's team (team mode) */
export function isMyEntry(entry: CtfBoardEntry, me: Pick<CtfMe, 'team'> | null | undefined, username: string | null | undefined): boolean {
    if (isTeamEntry(entry)) return !!me?.team && me.team._id === entry.teamId;
    return !!username && entry.username === username;
}

export const entryName = (entry: CtfBoardEntry) => (isTeamEntry(entry) ? entry.teamName : entry.username);
export const entryKey = (entry: CtfBoardEntry) => (isTeamEntry(entry) ? `team:${entry.teamId}` : `user:${entry.username}`);

/** How the board is kept fresh, for the line above it */
export type LiveMode = 'push' | 'poll' | 'static';

export function liveText(mode: LiveMode, pollSeconds: number): string {
    if (mode === 'push') return 'Live: the board updates as flags are solved.';
    if (mode === 'poll') return `The board refreshes about every ${pollSeconds} seconds while this tab is open.`;
    return 'Final standings.';
}
