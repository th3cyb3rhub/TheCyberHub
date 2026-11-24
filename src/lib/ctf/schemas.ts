import { z } from 'zod';
import { CTF_LIMITS } from './constants';
import { CTF_SCORING_MODES, CTF_STATUSES } from '@/types/ctf';

/**
 * Runtime checks for what comes back from the CTF API, used where a bad answer would break a page
 * rendered on the server, and for what the browser sends. The API stays the judge: these are lenient
 * about extra keys and strict about the few fields a page cannot render without.
 */

/** A flag as it is sent: trimmed, at least one character, at most 500 */
export const flagSchema = z.string().trim().min(1, 'Enter the flag before you send it').max(CTF_LIMITS.flagMax, `A flag has at most ${CTF_LIMITS.flagMax} characters`);

export const teamNameSchema = z.string().trim()
    .min(CTF_LIMITS.teamNameMin, `A team name needs at least ${CTF_LIMITS.teamNameMin} characters`)
    .max(CTF_LIMITS.teamNameMax, `A team name has at most ${CTF_LIMITS.teamNameMax} characters`);

export const inviteCodeSchema = z.string().trim()
    .min(CTF_LIMITS.inviteCodeMin, `An invite code has at least ${CTF_LIMITS.inviteCodeMin} characters`)
    .max(CTF_LIMITS.inviteCodeMax, `An invite code has at most ${CTF_LIMITS.inviteCodeMax} characters`)
    .regex(/^[A-Za-z0-9]+$/, 'An invite code has only letters and numbers');

const nullableString = z.string().nullable().optional();

const prizeSchema = z.object({
    place: z.number().int(),
    reward: z.string().default(''),
});

export const ctfCardSchema = z.object({
    _id: z.string(),
    title: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().default(''),
    shortDescription: nullableString,
    image: nullableString,
    startDate: z.string(),
    endDate: z.string(),
    timezone: z.string().default('UTC'),
    status: z.enum(CTF_STATUSES),
    isFeatured: z.boolean().default(false),
    teamsEnabled: z.boolean().default(false),
    minTeamSize: z.number().default(1),
    maxTeamSize: z.number().default(CTF_LIMITS.teamSizeDefault),
    scoringMode: z.enum(CTF_SCORING_MODES).default('static'),
    awardsPoints: z.boolean().default(false),
    prizes: z.array(prizeSchema).default([]),
    prizesNote: nullableString,
    registrationOpen: z.boolean().default(true),
    maxParticipants: z.number().default(0),
    participantCount: z.number().default(0),
    frozenAt: z.string().nullable().default(null),
    challengeCount: z.number().default(0),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
});

export const ctfDetailSchema = ctfCardSchema.extend({
    /** False for a link only competition. Older API builds do not send it. */
    isPublic: z.boolean().optional(),
    rules: z.string().default(''),
    challenges: z.array(z.string()).default([]),
});

const boardEntry = z.looseObject({
    rank: z.number(),
    points: z.number().default(0),
    solves: z.number().default(0),
    lastSolveAt: z.string().nullable().default(null),
});

const person = z.object({ username: z.string(), avatar: z.string().nullable().default(null) });

export const ctfResultsSchema = z.object({
    competition: z.object({
        slug: z.string(),
        title: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        timezone: z.string().default('UTC'),
        teamsEnabled: z.boolean().default(false),
        scoringMode: z.enum(CTF_SCORING_MODES).default('static'),
        prizes: z.array(prizeSchema).default([]),
        status: z.enum(CTF_STATUSES),
        isPublic: z.boolean().optional(),
    }),
    mode: z.enum(['solo', 'team']),
    /** The standings are the ones of the freeze, not the final ones */
    frozen: z.boolean().default(false),
    podium: z.array(boardEntry).default([]),
    standings: z.array(boardEntry).default([]),
    challenges: z.array(z.object({
        _id: z.string(),
        title: z.string(),
        category: z.string().default(''),
        difficulty: z.string().default(''),
        basePoints: z.number().default(0),
        solveCount: z.number().default(0),
        firstBlood: z.object({ username: z.string(), solvedAt: z.string() }).nullable().default(null),
    })).default([]),
    totals: z.object({ participants: z.number().default(0), solves: z.number().default(0), challenges: z.number().default(0) }),
    generatedAt: z.string().default(''),
});

export const ctfPageSchema = z.object({
    data: z.array(z.unknown()),
    pagination: z.object({ page: z.number(), limit: z.number(), total: z.number(), pages: z.number() }),
});

export { person as ctfPersonSchema };
