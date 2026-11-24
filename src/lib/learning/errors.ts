import { ApiError } from '@/lib/api';

/**
 * What a person should read for each error the roadmap and resource APIs answer with. The server
 * message is the fallback, so a new code never shows a blank toast.
 */
const MESSAGES: Record<string, string> = {
    PATH_NOT_FOUND: 'This roadmap could not be found. It may have been unpublished or removed.',
    MODULE_NOT_FOUND: 'That step is not part of this roadmap any more. Reload the page to see the current steps.',
    PATH_NOT_ENROLLED: 'Join this roadmap first to track your progress.',
    PATH_ALREADY_ENROLLED: 'You have already joined this one.',
    PATH_INVALID_STATE: 'This roadmap cannot do that in its current state. Reload to see where it stands.',
    PATH_CONFLICT: 'Someone else saved changes to this roadmap after you opened it.',
    PATH_KIND_LOCKED: 'The type cannot change once members have joined.',
    PATH_NOT_COMPLETED: 'Finish every required step to get your certificate.',
    PATH_NOT_PUBLISHABLE: 'This roadmap is not ready to publish yet. Fix the points listed below.',
    PATH_ITEM_INVALID: 'Some links in your steps point at something that does not exist. Check the highlighted items.',
    PATH_KEY_CONFLICT: 'Two steps share a key, or a step requires one that does not exist.',
    PATH_NODE_UNKNOWN: 'A step does not belong to this roadmap. Reload it and try again.',
    PATH_FORBIDDEN: 'You are not allowed to edit this roadmap.',
    CERTIFICATE_NOT_FOUND: 'This certificate could not be verified. Check the id and try again.',
    RESOURCE_NOT_FOUND: 'This resource could not be found. It may have been removed or is not public yet.',
    RESOURCE_DUPLICATE: 'This link is already in the library or waiting for review.',
    RESOURCE_NOT_PENDING: 'This resource has already been reviewed. Reload the queue to see the latest.',
    RESOURCE_URL_INVALID: 'Enter a public http or https link, without a username or password.',
    RESOURCE_BLOCKED_DOMAIN: 'Link shorteners and blocked sites cannot be shared. Use the full address of the page.',
    RESOURCE_SELF_VOTE: 'You cannot vote on a resource you submitted.',
    RESOURCE_SELF_REVIEW: 'You cannot review your own submission. Another moderator will do it.',
    RESOURCE_FORBIDDEN: 'You are not allowed to change this resource.',
    RESOURCE_DAILY_LIMIT: 'You have reached the daily limit for submissions. Try again tomorrow.',
    RESOURCE_PENDING_LIMIT: 'You already have the maximum number of submissions waiting for review. Wait for a decision before sending another.',
    AUTHZ_FORBIDDEN: 'You are not allowed to do that.',
};

const NOT_FOUND = 'This could not be found. It may have been removed.';

/** `retryAfter` is in seconds; a wait of an hour or more is shown in hours */
export function waitText(seconds: unknown): string {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return 'a little while';
    if (s < 90) return 'a minute';
    if (s < 3600) return `${Math.ceil(s / 60)} minutes`;
    const hours = Math.ceil(s / 3600);
    return hours === 1 ? 'an hour' : `${hours} hours`;
}

/** The titles of the paths a member still has to finish, from the error's `meta.missing` */
function missingTitles(meta: Record<string, unknown> | undefined): string[] {
    const missing = meta?.missing;
    if (!Array.isArray(missing)) return [];
    return missing.map((m) => (m && typeof m === 'object' && typeof (m as { title?: unknown }).title === 'string' ? (m as { title: string }).title : null)).filter((t): t is string => !!t);
}

export function learningErrorCode(err: unknown): string | undefined {
    return err instanceof ApiError ? err.code : undefined;
}

/** The message to show for a failed roadmap or resource call */
export function learningErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (err instanceof ApiError) {
        switch (err.code) {
            case 'PATH_PREREQUISITES_NOT_MET': {
                const titles = missingTitles(err.meta);
                return titles.length
                    ? `Finish ${titles.join(', ')} before starting this one.`
                    : 'Finish the prerequisite paths before starting this one.';
            }
            case 'RESOURCE_ACCOUNT_NOT_ELIGIBLE': {
                if (err.meta?.reason === 'email_not_verified') return 'Verify your email address to submit a resource.';
                if (err.meta?.reason === 'account_too_new') return `New accounts can submit resources after a short wait. Try again in ${waitText(err.meta?.retryAfter)}.`;
                return 'Your account cannot submit resources yet.';
            }
            case 'VALIDATION_ERROR':
                if (err.details?.length) return err.details.map((d) => d.message).join(' ');
                break;
            case 'RATE_LIMIT_EXCEEDED':
                return 'You are doing that too quickly. Please wait a minute and try again.';
            default:
                break;
        }
        if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
        if (err.status === 401) return 'Sign in to do that.';
        if (err.status === 404) return NOT_FOUND;
        if (err.status === 429) return 'You are doing that too quickly. Please wait a minute and try again.';
        return err.message || fallback;
    }
    return err instanceof Error && err.message ? err.message : fallback;
}

export const resourceErrorMessage = learningErrorMessage;

/** Field level problems from a 400, keyed by the API field name (`title`, `modules.2.items.0.ref`) */
export function fieldErrors(err: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (err instanceof ApiError && err.details) {
        for (const d of err.details) {
            if (d.field && !out[d.field]) out[d.field] = d.message;
        }
    }
    return out;
}

/** The existing entry a RESOURCE_DUPLICATE answer points at */
export function duplicateOf(err: unknown): { status?: string; id?: string; slug?: string; title?: string } | null {
    if (err instanceof ApiError && err.code === 'RESOURCE_DUPLICATE') {
        const existing = err.meta?.existing;
        if (existing && typeof existing === 'object') return existing as { status?: string; id?: string; slug?: string; title?: string };
        return {};
    }
    return null;
}

export const isAuthError = (err: unknown): boolean => err instanceof ApiError && err.status === 401;
export const isNotFound = (err: unknown): boolean => err instanceof ApiError && err.status === 404;
export const isConflict = (err: unknown): boolean => err instanceof ApiError && err.code === 'PATH_CONFLICT';
