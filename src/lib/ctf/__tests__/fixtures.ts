import type {
    CtfChallenge, CtfCompetition, CtfLeaderboard, CtfMe, CtfResults, CtfTeam,
} from '@/types/ctf';

export const SLUG = 'winter-ctf';

export const makeCompetition = (over: Partial<CtfCompetition> = {}): CtfCompetition => ({
    _id: 'c1',
    title: 'Winter CTF',
    slug: SLUG,
    description: 'Solve challenges, climb the board.',
    shortDescription: 'A weekend of challenges',
    image: null,
    startDate: '2026-12-05T10:00:00.000Z',
    endDate: '2026-12-07T10:00:00.000Z',
    timezone: 'Europe/Berlin',
    status: 'live',
    isFeatured: false,
    teamsEnabled: false,
    minTeamSize: 1,
    maxTeamSize: 4,
    scoringMode: 'static',
    awardsPoints: false,
    prizes: [{ place: 1, reward: 'A hardware key' }],
    prizesNote: null,
    registrationOpen: true,
    maxParticipants: 0,
    participantCount: 12,
    frozenAt: null,
    challengeCount: 2,
    rules: '## Rules\n\nBe kind. No attacks on the platform.',
    challenges: ['ch1', 'ch2'],
    ...over,
});

export const makeChallenge = (over: Partial<CtfChallenge> = {}): CtfChallenge => ({
    _id: 'ch1',
    title: 'Cookie Monster',
    category: 'web-security',
    difficulty: 'easy',
    description: 'Find the cookie.',
    shortDescription: 'A cookie',
    flagFormat: 'flag{...}',
    tags: ['web'],
    basePoints: 100,
    currentPoints: 100,
    files: [],
    instanceType: 'static',
    hintCount: 0,
    solveCount: 3,
    solved: false,
    ...over,
});

export const makeTeam = (over: Partial<CtfTeam> = {}): CtfTeam => ({
    _id: 't1',
    competition: 'c1',
    name: 'Red Pandas',
    inviteCode: 'ABCDEF0123456789ABCD',
    captain: { _id: 'u1', username: 'captain', avatar: null },
    members: [
        { _id: 'u1', username: 'captain', avatar: null },
        { _id: 'u2', username: 'second', avatar: null },
    ],
    points: 200,
    solveCount: 2,
    lastSolveAt: null,
    ...over,
});

export const makeMe = (over: Partial<CtfMe> = {}): CtfMe => ({
    status: 'live', registered: true, team: null, points: 100, solveCount: 1, rank: 3, rankFrozen: false, solves: [], ...over,
});

export const soloBoard = (over: Partial<CtfLeaderboard> = {}): CtfLeaderboard => ({
    mode: 'solo', frozen: false, frozenAt: null, status: 'live', updatedAt: '2026-12-05T12:00:00.000Z',
    data: [
        { rank: 1, username: 'ada', avatar: null, points: 500, solves: 5, lastSolveAt: '2026-12-05T11:00:00.000Z' },
        { rank: 2, username: 'linus', avatar: null, points: 300, solves: 3, lastSolveAt: '2026-12-05T11:30:00.000Z' },
    ],
    ...over,
});

export const teamBoard = (over: Partial<CtfLeaderboard> = {}): CtfLeaderboard => ({
    mode: 'team', frozen: false, frozenAt: null, status: 'live', updatedAt: '2026-12-05T12:00:00.000Z',
    data: [
        { rank: 1, teamId: 't1', teamName: 'Red Pandas', captain: { username: 'captain', avatar: null }, members: 2, points: 500, solves: 5, lastSolveAt: null },
        { rank: 2, teamId: 't2', teamName: 'Blue Foxes', captain: { username: 'fox', avatar: null }, members: 4, points: 300, solves: 3, lastSolveAt: null },
    ],
    ...over,
});

export const makeResults = (over: Partial<CtfResults> = {}): CtfResults => {
    const standings = soloBoard().data;
    return {
        competition: {
            slug: SLUG, title: 'Winter CTF', startDate: '2026-12-05T10:00:00.000Z', endDate: '2026-12-07T10:00:00.000Z', timezone: 'Europe/Berlin',
            teamsEnabled: false, scoringMode: 'static', prizes: [{ place: 1, reward: 'A hardware key' }], status: 'ended',
        },
        mode: 'solo',
        podium: standings,
        standings,
        challenges: [
            { _id: 'ch1', title: 'Cookie Monster', category: 'web-security', difficulty: 'easy', basePoints: 100, solveCount: 7, firstBlood: { username: 'ada', solvedAt: '2026-12-05T10:05:00.000Z' } },
            { _id: 'ch2', title: 'Unsolved', category: 'crypto', difficulty: 'hard', basePoints: 300, solveCount: 0, firstBlood: null },
        ],
        totals: { participants: 12, solves: 30, challenges: 2 },
        generatedAt: '2026-12-07T10:01:00.000Z',
        ...over,
    };
};
