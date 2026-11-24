/**
 * Shapes of the CTF competitions API (`/api/ctf-competitions`). A competition is read by its slug
 * and written by its id. The API never returns a flag, a flag hash or hint text: the browser sends
 * a flag and the server decides what it is worth and who it counts for.
 */

export const CTF_STATUSES = ['draft', 'upcoming', 'live', 'frozen', 'ended', 'cancelled'] as const;
export type CtfStatus = (typeof CTF_STATUSES)[number];

export const CTF_SCORING_MODES = ['static', 'dynamic'] as const;
export type CtfScoringMode = (typeof CTF_SCORING_MODES)[number];

/** What the list page offers: `ongoing` is the API's word for live and frozen together */
export const CTF_LIST_FILTERS = ['all', 'live', 'upcoming', 'ended'] as const;
export type CtfListFilter = (typeof CTF_LIST_FILTERS)[number];

export interface CtfPrize {
    place: number;
    reward: string;
}

export interface CtfPagination {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

export interface CtfPage<T> {
    success?: boolean;
    data: T[];
    pagination: CtfPagination;
}

/** A competition as the list sends it. `status` is the one the clock says, not the stored one. */
export interface CtfCompetitionCard {
    _id: string;
    title: string;
    slug: string;
    description: string;
    shortDescription?: string | null;
    image?: string | null;
    startDate: string;
    /** Exclusive: the competition is over at this instant */
    endDate: string;
    timezone: string;
    status: CtfStatus;
    isFeatured: boolean;
    teamsEnabled: boolean;
    minTeamSize: number;
    maxTeamSize: number;
    scoringMode: CtfScoringMode;
    awardsPoints: boolean;
    prizes: CtfPrize[];
    prizesNote?: string | null;
    registrationOpen: boolean;
    /** 0 means unlimited */
    maxParticipants: number;
    participantCount: number;
    frozenAt: string | null;
    challengeCount: number;
    createdAt?: string;
    updatedAt?: string;
}

/** What staff see for each challenge of the set: never a flag */
export interface CtfChallengeDetail {
    _id: string;
    position?: number;
    /** The challenge was deleted after it joined the set */
    missing?: boolean;
    title?: string;
    category?: string;
    difficulty?: string;
    basePoints?: number;
    status?: string;
    solveCount?: number;
}

export interface CtfCompetition extends CtfCompetitionCard {
    /** Markdown: render sanitised, never as raw HTML */
    rules: string;
    /** Challenge ids; empty before the start for everybody but staff */
    challenges: string[];
    // Staff only
    isPublic?: boolean;
    createdBy?: string | { _id: string; username?: string } | null;
    storedStatus?: CtfStatus;
    backfillDone?: boolean;
    challengeDetails?: CtfChallengeDetail[];
}

export interface CtfFile {
    filename: string;
    url: string;
    size?: number | null;
}

export interface CtfChallenge {
    _id: string;
    title: string;
    category: string;
    difficulty: string;
    description?: string;
    shortDescription?: string;
    flagFormat?: string | null;
    tags: string[];
    basePoints: number;
    /** What the next solve is worth: the base points in a static competition */
    currentPoints: number;
    files: CtfFile[];
    instanceType?: string;
    /** Only for signed-in members and only when the challenge has a shared instance */
    instanceUrl?: string;
    hintCount: number;
    solveCount: number;
    /** For the viewer, or the viewer's team. Real only when the request carried the token. */
    solved: boolean;
}

export interface CtfAvatarPerson {
    username: string;
    avatar: string | null;
}

export interface CtfSoloEntry {
    rank: number;
    username: string;
    avatar: string | null;
    points: number;
    solves: number;
    lastSolveAt: string | null;
}

export interface CtfTeamEntry {
    rank: number;
    teamId: string;
    teamName: string;
    captain: CtfAvatarPerson | null;
    /** How many members the team has */
    members: number;
    points: number;
    solves: number;
    lastSolveAt: string | null;
}

export type CtfBoardEntry = CtfSoloEntry | CtfTeamEntry;

export const isTeamEntry = (entry: CtfBoardEntry): entry is CtfTeamEntry => 'teamId' in entry;

export interface CtfLeaderboard {
    data: CtfBoardEntry[];
    mode: 'solo' | 'team';
    frozen: boolean;
    frozenAt: string | null;
    status: CtfStatus;
    updatedAt: string;
}

export interface CtfTeamMember {
    _id: string;
    username: string;
    avatar: string | null;
}

export interface CtfTeam {
    _id: string;
    competition?: string;
    name: string;
    /** Shown to members of the team only */
    inviteCode: string;
    captain: CtfTeamMember;
    members: CtfTeamMember[];
    points: number;
    solveCount: number;
    lastSolveAt: string | null;
    createdAt?: string;
}

export interface CtfMySolve {
    challenge: { _id: string; title?: string; category?: string; difficulty?: string };
    pointsEarned: number;
    solvedAt: string;
    /** For a team, the member who sent the flag */
    solvedBy: string | null;
}

export interface CtfMe {
    status: CtfStatus;
    registered: boolean;
    team: CtfTeam | null;
    points: number;
    solveCount: number;
    rank: number | null;
    /** The rank is the one of the frozen board */
    rankFrozen: boolean;
    solves: CtfMySolve[];
}

export interface CtfFirstBlood {
    username: string;
    solvedAt: string;
}

export interface CtfResultChallenge {
    _id: string;
    title: string;
    category: string;
    difficulty: string;
    basePoints: number;
    solveCount: number;
    firstBlood: CtfFirstBlood | null;
}

export interface CtfResults {
    competition: {
        slug: string;
        title: string;
        startDate: string;
        endDate: string;
        timezone: string;
        teamsEnabled: boolean;
        scoringMode: CtfScoringMode;
        prizes: CtfPrize[];
        status: CtfStatus;
    };
    mode: 'solo' | 'team';
    /** The standings are the public, frozen ones */
    frozen?: boolean;
    podium: CtfBoardEntry[];
    standings: CtfBoardEntry[];
    challenges: CtfResultChallenge[];
    totals: { participants: number; solves: number; challenges: number };
    generatedAt: string;
}

export interface CtfBadge {
    code?: string;
    name?: string;
    icon?: string | null;
    rarity?: string | null;
}

/** A wrong flag is an ordinary answer (HTTP 200): the counters tell how close the limit is */
export interface CtfWrongFlag {
    correct: false;
    message: string;
    attemptsRecent: number;
    attemptLimit: number;
    windowSeconds: number;
}

export interface CtfRightFlag {
    correct: true;
    message: string;
    pointsEarned: number;
    firstBlood: boolean;
    scope: 'user' | 'team';
    teamId: string | null;
    accountPointsAwarded: boolean;
    newBadges: CtfBadge[];
}

export type CtfSubmitResult = CtfWrongFlag | CtfRightFlag;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** What an admin can set. A create sends the required four and anything else; an update sends a subset. */
export interface CtfPayload {
    title?: string;
    slug?: string;
    description?: string;
    shortDescription?: string | null;
    image?: string | null;
    rules?: string | null;
    startDate?: string;
    endDate?: string;
    timezone?: string;
    status?: 'draft' | 'upcoming' | 'live' | 'frozen' | 'ended' | 'cancelled';
    isPublic?: boolean;
    isFeatured?: boolean;
    teamsEnabled?: boolean;
    minTeamSize?: number;
    maxTeamSize?: number;
    challenges?: string[];
    scoringMode?: CtfScoringMode;
    prizes?: CtfPrize[];
    prizesNote?: string | null;
    registrationOpen?: boolean;
    maxParticipants?: number;
    awardsPoints?: boolean;
    frozenAt?: string | null;
}

export interface CtfDeleteResult {
    deleted: boolean;
    cancelled: boolean;
    status: CtfStatus;
}

/** A challenge of the existing admin list, for the picker */
export interface CtfPickerChallenge {
    _id: string;
    title: string;
    category: string;
    difficulty: string;
    basePoints: number;
    status: string;
}

export interface CtfListFilters {
    status?: CtfListFilter | CtfStatus | '';
    page?: number;
    limit?: number;
}
