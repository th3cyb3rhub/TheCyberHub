import { ApiError } from '@/lib/api';
import { retryAfterSeconds, waitText } from '@/lib/labs/errors';

export { fieldErrors, unattachedDetails, retryAfterSeconds, waitText } from '@/lib/labs/errors';

/**
 * What a person should read for each error the CTF API answers with. The server message is the
 * fallback, so a new code never shows a blank toast.
 */
const MESSAGES: Record<string, string> = {
    CTF_NOT_FOUND: 'This competition could not be found. It may have been removed, or it is not published yet.',
    CTF_CHALLENGE_NOT_FOUND: 'This challenge is not part of the competition any more. Reload the list.',
    CTF_NOT_STARTED: 'This competition has not started yet. The challenges open when it starts.',
    CTF_ENDED: 'This competition has ended, so nothing can change any more.',
    CTF_CANCELLED: 'This competition was cancelled, so nothing can change any more.',
    CTF_ALREADY_SOLVED: 'This challenge is already solved for you or your team. Points are counted once.',
    CTF_TEAM_REQUIRED: 'This competition is played in teams. Create a team or join one with an invite code, then send your flag.',
    CTF_FULL: 'This competition is full.',
    CTF_REGISTRATION_CLOSED: 'Registration is closed for this competition.',
    CTF_TEAMS_DISABLED: 'This competition is played solo: there are no teams.',
    CTF_USE_TEAM: 'This competition is played in teams. Create a team or join one instead of registering.',
    CTF_CAPTAIN_CANNOT_LEAVE: 'You are the captain. Remove the other members first, then you can leave. Handing the team over is not possible yet.',
    CTF_CANNOT_KICK_SELF: 'You cannot remove yourself. Leave the team instead.',
    CTF_NOT_CAPTAIN: 'Only the team captain can do that.',
    CTF_INVITE_INVALID: 'That invite code does not match any team in this competition. Check it and try again.',
    CTF_NOT_IN_TEAM: 'You are not in a team in this competition.',
    CTF_MEMBER_NOT_FOUND: 'That player is not in your team any more.',
    CTF_ALREADY_IN_TEAM: 'You are already in a team in this competition.',
    CTF_TEAM_NAME_TAKEN: 'Another team already uses that name. Choose a different one.',
    CTF_TEAM_FULL: 'This team is full.',
    CTF_MEMBER_HAS_SOLVES: 'A player who has solved a challenge cannot leave or be removed while the competition runs: their points belong to the team.',
    CTF_RESULTS_NOT_AVAILABLE: 'The results are published when the competition ends.',
    CTF_SLUG_TAKEN: 'Another competition already uses this slug. Choose a different one.',
    CTF_CHALLENGE_INVALID: 'Some challenges cannot be used in a competition. A challenge must exist and be active.',
    CTF_CHALLENGE_DUPLICATE: 'That challenge is already in the competition.',
    CTF_CHALLENGE_LIMIT: 'A competition holds at most 200 challenges.',
    CTF_CHALLENGE_HAS_SOLVES: 'A challenge that has solves cannot be removed from the competition: earned points stay.',
};

export function ctfErrorCode(err: unknown): string | undefined {
    return err instanceof ApiError ? err.code : undefined;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The fields CTF_LOCKED names, or an empty list */
export function lockedFields(err: unknown): string[] {
    if (!(err instanceof ApiError) || err.code !== 'CTF_LOCKED') return [];
    const fields = err.meta?.fields;
    return Array.isArray(fields) ? fields.filter((f): f is string => typeof f === 'string') : [];
}

/** The challenge ids CTF_CHALLENGE_HAS_SOLVES names, or an empty list */
export function challengesWithSolves(err: unknown): string[] {
    if (!(err instanceof ApiError) || err.code !== 'CTF_CHALLENGE_HAS_SOLVES') return [];
    const ids = err.meta?.challenges;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

const FIELD_NAMES: Record<string, string> = {
    teamsEnabled: 'team play',
    scoringMode: 'the scoring mode',
    maxTeamSize: 'the largest team size',
};
export const lockedFieldName = (field: string) => FIELD_NAMES[field] ?? field;

/** The message to show for a failed CTF call */
export function ctfErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (err instanceof ApiError) {
        if (err.status === 429 || err.code === 'RATE_LIMIT_EXCEEDED') {
            const seconds = retryAfterSeconds(err);
            return seconds ? `Too many attempts. Try again in about ${waitText(seconds)}.` : 'Too many attempts. Wait a moment and try again.';
        }
        if (err.code === 'CTF_TEAM_TOO_SMALL') {
            const min = Number(err.meta?.minTeamSize);
            const members = Number(err.meta?.members);
            if (Number.isFinite(min) && Number.isFinite(members)) {
                return `Your team has ${plural(members, 'member', 'members')}. It needs at least ${min} to send flags. Invite more players with your invite code.`;
            }
            return 'Your team is too small to send flags. Invite more players with your invite code.';
        }
        if (err.code === 'CTF_LOCKED') {
            const fields = lockedFields(err);
            return fields.length
                ? `You cannot change ${fields.map(lockedFieldName).join(' and ')} once teams or solves exist.`
                : 'That cannot change once teams or solves exist.';
        }
        if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
        if (err.status === 401) return 'Sign in to do that.';
        if (err.status === 403) return 'You are not allowed to do that.';
        if (err.status === 404) return MESSAGES.CTF_NOT_FOUND;
        if (err.code === 'VALIDATION_ERROR' && err.details?.length) return err.details.map((d) => d.message).join(' ');
        return err.message || fallback;
    }
    return err instanceof Error && err.message ? err.message : fallback;
}

/** Whether the error means "the page shows an old state": the screen should show the truth again */
const STALE_CODES = new Set([
    'CTF_NOT_FOUND', 'CTF_CHALLENGE_NOT_FOUND', 'CTF_NOT_STARTED', 'CTF_ENDED', 'CTF_CANCELLED', 'CTF_ALREADY_SOLVED',
    'CTF_TEAM_REQUIRED', 'CTF_TEAM_TOO_SMALL', 'CTF_NOT_IN_TEAM', 'CTF_ALREADY_IN_TEAM', 'CTF_NOT_CAPTAIN', 'CTF_MEMBER_NOT_FOUND', 'CTF_TEAM_FULL',
]);
export const isStaleState = (err: unknown): boolean => err instanceof ApiError && !!err.code && STALE_CODES.has(err.code);

/** The error a team form shows under a field rather than in a toast */
export const isTeamNameError = (err: unknown) => ctfErrorCode(err) === 'CTF_TEAM_NAME_TAKEN';
export const isInviteError = (err: unknown) => ctfErrorCode(err) === 'CTF_INVITE_INVALID';
