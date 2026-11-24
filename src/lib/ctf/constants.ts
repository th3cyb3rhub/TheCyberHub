import type { CtfListFilter, CtfStatus } from '@/types/ctf';

/** Every limit mirrors the ones the API checks, so a form never sends what the server refuses */
export const CTF_LIMITS = {
    titleMin: 3,
    titleMax: 100,
    slugMin: 3,
    slugMax: 80,
    descriptionMax: 5000,
    shortDescriptionMax: 200,
    rulesMax: 10000,
    prizesMax: 10,
    prizeRewardMax: 200,
    prizesNoteMax: 5000,
    imageMax: 500,
    challengesMax: 200,
    teamNameMin: 2,
    teamNameMax: 50,
    teamSizeMin: 2,
    teamSizeMax: 10,
    teamSizeDefault: 4,
    participantsMax: 100000,
    flagMax: 500,
    inviteCodeMin: 4,
    inviteCodeMax: 32,
    pageMax: 50,
    pageDefault: 12,
    boardSize: 100,
    /** The size of a direct upload; the server answers 413 above it */
    uploadMaxBytes: 5 * 1024 * 1024,
} as const;

/** The share of a challenge's base points a solve pays in a dynamic competition, by solves before it */
export const DECAY_TABLE: readonly { from: number; to: number | null; percent: number }[] = [
    { from: 0, to: 0, percent: 100 },
    { from: 1, to: 2, percent: 90 },
    { from: 3, to: 5, percent: 80 },
    { from: 6, to: 10, percent: 70 },
    { from: 11, to: 20, percent: 60 },
    { from: 21, to: 40, percent: 50 },
    { from: 41, to: 80, percent: 40 },
    { from: 81, to: 150, percent: 30 },
    { from: 151, to: null, percent: 25 },
];
export const DYNAMIC_FLOOR_PERCENT = 25;

export const STATUS_LABELS: Record<CtfStatus, string> = {
    draft: 'Draft',
    upcoming: 'Upcoming',
    live: 'Live',
    frozen: 'Frozen',
    ended: 'Ended',
    cancelled: 'Cancelled',
};

export const LIST_FILTER_LABELS: Record<CtfListFilter, string> = {
    all: 'All',
    live: 'Live',
    upcoming: 'Upcoming',
    ended: 'Ended',
};

/** The API's `status` for each list tab: live and frozen are both "ongoing" */
export const LIST_FILTER_QUERY: Record<CtfListFilter, string> = {
    all: '',
    live: 'ongoing',
    upcoming: 'upcoming',
    ended: 'ended',
};

/** Every outbound link carries these */
export const LINK_REL = 'noopener noreferrer nofollow ugc';

/** Queries for the public pages tagged on the app server, so an admin save can purge them */
export const CTF_CACHE_TAG = 'ctf';
