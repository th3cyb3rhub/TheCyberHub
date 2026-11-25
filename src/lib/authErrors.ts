import type { SessionEndReason } from '@/lib/authSession';

/** Error codes the API sends on the auth routes (`error.code` of a failed call). */
export const AUTH_CODES = {
    /** A bearer-token call whose access token is missing, invalid or expired: renew it, or sign in. */
    TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
    /** This device was signed out (revoked from the sessions list, a password change, a ban). Go to sign-in. */
    SESSION_REVOKED: 'AUTH_SESSION_REVOKED',
    /** A token from before sessions existed, no longer accepted. Sign in again. */
    LEGACY_TOKEN_REFUSED: 'AUTH_LEGACY_TOKEN_REFUSED',
    /** Another request of this browser just rotated the refresh token. Not a sign-out: read the cookie again and retry. */
    REFRESH_RACE: 'AUTH_REFRESH_RACE',
    /** The account is banned or disabled (403). */
    ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
    /** The current password in a change-password or 2FA form is wrong (400, a form error). */
    PASSWORD_INCORRECT: 'AUTH_PASSWORD_INCORRECT',
    /** The 2FA code in an enable or disable form is wrong (400, a form error). */
    TWO_FACTOR_CODE_INVALID: 'AUTH_2FA_CODE_INVALID',
    RATE_LIMITED: 'RATE_LIMIT_EXCEEDED',
} as const;

interface ErrorLike {
    status?: unknown;
    code?: unknown;
    message?: unknown;
    details?: unknown;
    meta?: unknown;
}

const asLike = (err: unknown): ErrorLike => (err && typeof err === 'object' ? (err as ErrorLike) : {});

export function errorCode(err: unknown): string | undefined {
    const code = asLike(err).code;
    return typeof code === 'string' ? code : undefined;
}

export function errorStatus(err: unknown): number | undefined {
    const status = asLike(err).status;
    return typeof status === 'number' ? status : undefined;
}

/** What a failed call says about the session: it is over (and why), or nothing. */
export function sessionEndReason(status: number | undefined, code: string | undefined): SessionEndReason | null {
    if (status === 401 && code === AUTH_CODES.SESSION_REVOKED) return 'revoked';
    if (status === 401 && code === AUTH_CODES.LEGACY_TOKEN_REFUSED) return 'legacy';
    if (status === 403 && code === AUTH_CODES.ACCOUNT_DISABLED) return 'disabled';
    return null;
}

/** Seconds a rate limiter asks the caller to wait, from `meta.retryAfter` (also read from the Retry-After header). */
export function retryAfterSeconds(err: unknown): number | undefined {
    const meta = asLike(err).meta;
    const wait = meta && typeof meta === 'object' ? Number((meta as { retryAfter?: unknown }).retryAfter) : NaN;
    return Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : undefined;
}

export function formatWait(seconds: number): string {
    if (seconds < 90) return `${seconds} second${seconds === 1 ? '' : 's'}`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 90) return `${minutes} minutes`;
    const hours = Math.ceil(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * The text to show for a failed auth call: the field problem when the API names one, otherwise the
 * server's own message, and for a rate limit how long to wait. The server's wording is kept on
 * purpose: a sign-in failure is one uniform answer and nothing here should reveal more than it does.
 */
export function authErrorMessage(err: unknown, fallback: string): string {
    const like = asLike(err);
    const details = Array.isArray(like.details) ? like.details : [];
    const first = details.find((d): d is { message: string } => !!d && typeof (d as { message?: unknown }).message === 'string');
    let message = first?.message || (typeof like.message === 'string' && like.message ? like.message : fallback);
    if (errorStatus(err) === 429) {
        const wait = retryAfterSeconds(err);
        if (wait) message = `${message} Try again in ${formatWait(wait)}.`;
    }
    return message;
}
