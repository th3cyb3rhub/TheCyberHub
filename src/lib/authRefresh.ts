import { API_URL } from '@/lib/apiBase';
import { API_ENDPOINTS } from '@/lib/constants/api-endpoints';
import { AUTH_CODES, sessionEndReason } from '@/lib/authErrors';
import { endSession, type SessionEndReason } from '@/lib/authSession';
import { legacyRefreshToken, tokenStore } from '@/lib/tokenStore';

/**
 * - `refreshed`: a new access token is stored; retry the request once.
 * - `ended`: the session is over (the sign-out was announced); do not retry.
 * - `unavailable`: the API could not be asked or is limiting us (network, 5xx, 429); the session may be fine, so nothing is cleared.
 */
export type RefreshOutcome = 'refreshed' | 'ended' | 'unavailable';

type Attempt = { kind: 'ok' } | { kind: 'race' } | { kind: 'unavailable' } | { kind: 'ended'; reason: SessionEndReason };

/** How long to wait before asking again after the API says another request just rotated the token. */
export const RACE_RETRY_MS = 200;
const LOCK_NAME = 'thecyberhub-auth-refresh';

async function readBody(response: Response): Promise<{ token?: string; code?: string }> {
    try {
        const data = await response.json();
        return {
            token: typeof data?.token === 'string' ? data.token : typeof data?.accessToken === 'string' ? data.accessToken : undefined,
            code: typeof data?.error?.code === 'string' ? data.error.code : undefined,
        };
    } catch {
        return {};
    }
}

async function attempt(): Promise<Attempt> {
    // The refresh token is an httpOnly cookie that `credentials: 'include'` sends. One that an older
    // version kept in localStorage is sent in the body as a fallback.
    const legacy = legacyRefreshToken.get();
    let response: Response;
    try {
        response = await fetch(`${API_URL}${API_ENDPOINTS.AUTH.REFRESH}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(legacy ? { refreshToken: legacy } : {}),
        });
    } catch {
        return { kind: 'unavailable' };
    }

    const { token, code } = await readBody(response);
    if (response.ok) {
        if (!token) return { kind: 'ended', reason: 'expired' };
        tokenStore.set(token);
        // The cookie now carries the session, and the old value was just used up
        legacyRefreshToken.remove();
        return { kind: 'ok' };
    }
    if (response.status === 401 && code === AUTH_CODES.REFRESH_RACE) return { kind: 'race' };
    const reason = sessionEndReason(response.status, code);
    if (reason) return { kind: 'ended', reason };
    // 401: the refresh token is gone, expired or reused. 400: there is none to send.
    if (response.status === 401 || response.status === 400) return { kind: 'ended', reason: 'expired' };
    return { kind: 'unavailable' };
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function renew(staleToken: string): Promise<RefreshOutcome> {
    // Another tab may have renewed while this one waited for the lock
    if (tokenStore.get() !== staleToken) return tokenStore.get() ? 'refreshed' : 'ended';

    let result = await attempt();
    if (result.kind === 'race') {
        // Another request of this browser rotated the token a moment ago and the new one is in the cookie. Do not
        // sign out: take the token that request stored, or ask once more with the cookie as it is now.
        await pause(RACE_RETRY_MS);
        const stored = tokenStore.get();
        if (stored && stored !== staleToken) return 'refreshed';
        result = await attempt();
        if (result.kind === 'race') return 'unavailable';
    }
    if (result.kind === 'ok') return 'refreshed';
    if (result.kind === 'ended') {
        endSession(result.reason);
        return 'ended';
    }
    return 'unavailable';
}

/** Runs `task` while no other tab of this browser is refreshing (Web Locks), or at once where they do not exist. */
function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    return locks?.request ? (locks.request(LOCK_NAME, task) as unknown as Promise<T>) : task();
}

let inFlight: Promise<RefreshOutcome> | null = null;

/**
 * Gets a new access token for a request that was refused with `staleToken`. One refresh runs at a
 * time: every request that fails while it is running waits for it and shares its outcome, and one
 * that fails after it has finished (with the token it already replaced) just retries.
 */
export function refreshAccessToken(staleToken: string): Promise<RefreshOutcome> {
    const current = tokenStore.get();
    if (!current) return Promise.resolve('ended');
    if (current !== staleToken) return Promise.resolve('refreshed');
    if (!inFlight) {
        inFlight = exclusive(() => renew(staleToken)).finally(() => { inFlight = null; });
    }
    return inFlight;
}
