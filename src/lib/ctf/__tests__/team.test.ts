import { describe, expect, it } from 'vitest';
import { joinBlock, normaliseInvite, seatsLeft, teamPermissions, teamTooSmall } from '../team';
import { makeCompetition, makeTeam } from './fixtures';

const captainId = 'u1';
const memberId = 'u2';
const three = makeTeam({
    members: [
        { _id: 'u1', username: 'captain', avatar: null },
        { _id: 'u2', username: 'second', avatar: null },
        { _id: 'u3', username: 'third', avatar: null },
    ],
    solveCount: 0,
});

describe('team permissions', () => {
    it('lets the captain remove other members but not themselves, and blocks leaving while members remain', () => {
        const p = teamPermissions(three, captainId, 'live');
        expect(p).toMatchObject({ isMember: true, isCaptain: true, rosterOpen: true, leaveBlocked: true, leaveDisbands: false, canLeave: false })
        expect(p.canKick('u2')).toBe(true)
        expect(p.canKick('u3')).toBe(true)
        expect(p.canKick(captainId)).toBe(false)
    })

    it('lets a member leave and gives them no power over others', () => {
        const p = teamPermissions(three, memberId, 'live');
        expect(p).toMatchObject({ isMember: true, isCaptain: false, leaveBlocked: false, canLeave: true })
        expect(p.canKick('u3')).toBe(false)
        expect(p.canKick('u1')).toBe(false)
    })

    it('lets a captain who is alone leave, which ends the team', () => {
        const alone = makeTeam({ members: [{ _id: 'u1', username: 'captain', avatar: null }], solveCount: 0 });
        const p = teamPermissions(alone, captainId, 'upcoming');
        expect(p).toMatchObject({ leaveBlocked: false, leaveDisbands: true, canLeave: true })
    })

    it('gives a stranger nothing', () => {
        const p = teamPermissions(three, 'someone-else', 'live');
        expect(p).toMatchObject({ isMember: false, isCaptain: false, canLeave: false })
        expect(p.canKick('u2')).toBe(false)
        const none = teamPermissions(null, captainId, 'live');
        expect(none).toMatchObject({ isMember: false, canLeave: false, rosterLocked: false })
    })

    it.each(['ended', 'cancelled', 'draft'] as const)('closes the roster when the competition is %s', (status) => {
        const p = teamPermissions(three, captainId, status);
        expect(p.rosterOpen).toBe(false)
        expect(p.canKick('u2')).toBe(false)
        expect(p.canLeave).toBe(false)
    })

    it('fixes the roster once the team has solved something, for the captain and the members', () => {
        const solved = { ...three, solveCount: 1 };
        const captain = teamPermissions(solved, captainId, 'live');
        expect(captain.rosterLocked).toBe(true)
        expect(captain.canKick('u2')).toBe(false)
        const member = teamPermissions(solved, memberId, 'live');
        expect(member.rosterLocked).toBe(true)
        expect(member.canLeave).toBe(false)
    })

    it('opens the roster again for nobody after the end: the lock is only about a running competition', () => {
        const solved = { ...three, solveCount: 3 };
        expect(teamPermissions(solved, captainId, 'ended').rosterLocked).toBe(false)
    })
})

describe('joining', () => {
    const open = makeCompetition({ registrationOpen: true, maxParticipants: 0, participantCount: 5 });

    it('says why nobody can create or join a team', () => {
        expect(joinBlock(open, 'live')).toBeNull()
        expect(joinBlock(open, 'ended')).toBe('ended')
        expect(joinBlock(open, 'cancelled')).toBe('cancelled')
        expect(joinBlock({ ...open, registrationOpen: false }, 'live')).toBe('closed')
        expect(joinBlock({ ...open, maxParticipants: 5 }, 'live')).toBe('full')
        expect(joinBlock({ ...open, maxParticipants: 6 }, 'live')).toBeNull()
    })

    it('counts seats and the minimum team size', () => {
        expect(seatsLeft(three, 4)).toBe(1)
        expect(seatsLeft(three, 3)).toBe(0)
        expect(seatsLeft(three, 2)).toBe(0)
        expect(teamTooSmall(three, 4)).toBe(true)
        expect(teamTooSmall(three, 3)).toBe(false)
        expect(teamTooSmall(null, 3)).toBe(false)
    })

    it('reads an invite code the way people type it', () => {
        expect(normaliseInvite(' ab cd\n12 ')).toBe('ABCD12')
    })
})
