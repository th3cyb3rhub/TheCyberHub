import type { CtfCompetitionCard, CtfStatus, CtfTeam } from '@/types/ctf';
import { isOpenForRoster } from './status';
import { isFull } from './display';

export interface TeamPermissions {
    isMember: boolean;
    isCaptain: boolean;
    /** The roster can still change: the competition has not ended or been cancelled */
    rosterOpen: boolean;
    canKick: (memberId: string) => boolean;
    /**
     * The team has scored: its roster is fixed until the competition ends, so nobody leaves or is
     * removed (the API answers CTF_TEAM_HAS_SOLVES). Otherwise a member could score the same
     * challenge again with another team.
     */
    rosterLocked: boolean;
    /** The captain cannot leave while others remain: the API refuses it */
    leaveBlocked: boolean;
    /** The captain is alone: leaving ends the team */
    leaveDisbands: boolean;
    canLeave: boolean;
}

/** What the signed-in member may do with a team. The API checks the same rules again. */
export function teamPermissions(team: CtfTeam | null, userId: string | null | undefined, status: CtfStatus): TeamPermissions {
    const isMember = !!team && !!userId && team.members.some((m) => m._id === userId);
    const isCaptain = !!team && !!userId && team.captain._id === userId;
    const rosterOpen = isOpenForRoster(status);
    const others = team ? team.members.filter((m) => m._id !== team.captain._id).length : 0;
    const rosterLocked = !!team && rosterOpen && team.solveCount > 0;
    return {
        isMember,
        isCaptain,
        rosterOpen,
        rosterLocked,
        canKick: (memberId) => isCaptain && rosterOpen && !rosterLocked && memberId !== userId,
        leaveBlocked: isCaptain && others > 0,
        leaveDisbands: isCaptain && others === 0,
        canLeave: isMember && rosterOpen && !rosterLocked && !(isCaptain && others > 0),
    };
}

export type JoinBlock = 'ended' | 'cancelled' | 'closed' | 'full' | null;

/** Why nobody can create or join a team right now, or null when they can */
export function joinBlock(card: Pick<CtfCompetitionCard, 'registrationOpen' | 'participantCount' | 'maxParticipants'>, status: CtfStatus): JoinBlock {
    if (status === 'ended') return 'ended';
    if (status === 'cancelled') return 'cancelled';
    if (!card.registrationOpen) return 'closed';
    if (isFull(card)) return 'full';
    return null;
}

export const JOIN_BLOCK_TEXT: Record<Exclude<JoinBlock, null>, string> = {
    ended: 'The competition has ended, so the teams are closed.',
    cancelled: 'The competition was cancelled, so the teams are closed.',
    closed: 'Registration is closed: new teams and new members are not accepted.',
    full: 'The competition is full: no seat is left for new players.',
};

/** Seats left in a team */
export const seatsLeft = (team: Pick<CtfTeam, 'members'>, maxTeamSize: number) => Math.max(0, maxTeamSize - team.members.length);

/** The team is below the size the competition asks for before flags are accepted */
export const teamTooSmall = (team: Pick<CtfTeam, 'members'> | null, minTeamSize: number) => !!team && team.members.length < minTeamSize;

/** An invite code as people type it: no spaces, upper case (codes are upper-case hex) */
export const normaliseInvite = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();

export const ROSTER_LOCKED_TEXT = 'Your team has solved a challenge, so the roster is fixed until the competition ends: nobody can leave or be removed.';
