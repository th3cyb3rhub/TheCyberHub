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

type Attempt = { kind: 'ok' } | { kind: 'superseded' } | { kind: 'race' } | { kind: 'unavailable' } | { kind: 'ended'; reason: SessionEndReason };

/** How long to wait before asking again after the API says another request just rotated the token. */
export const RACE_RETRY_MS = 200;
const LOCK_NAME = 'thecyberhub-auth-refresh';
/** A refresh request that has not answered by then is given up on, so one stalled connection cannot hang the page */
export const REFRESH_TIMEOUT_MS = 10_000;
/** Waiting for another tab's refresh (the lock) is bounded too: that tab may be frozen */
export const LOCK_TIMEOUT_MS = 30_000;

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

async function attempt(staleToken: string): Promise<Attempt> {
    // The refresh token is an httpOnly cookie that `credentials: 'include'` sends. One that an older
    // version kept in localStorage is sent in the body as a fallback.
    const legacy = legacyRefreshToken.get();
    let response: Response;
    let body: { token?: string; code?: string };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    try {
        response = await fetch(`${API_URL}${API_ENDPOINTS.AUTH.REFRESH}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(legacy ? { refreshToken: legacy } : {}),
            signal: controller.signal,
        });
        body = await readBody(response);
    } catch {
        return { kind: 'unavailable' };
    } finally {
        clearTimeout(timer);
    }

    const { token, code } = body;
    if (response.ok) {
        if (!token) return { kind: 'ended', reason: 'expired' };
        // The member may have signed out, or in as someone else, while this was in flight: that answer is not theirs to store
        if (tokenStore.get() !== staleToken) return { kind: 'superseded' };
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

    let result = await attempt(staleToken);
    if (result.kind === 'race') {
        // Another request of this browser rotated the token a moment ago and the new one is in the cookie. Do not
        // sign out: take the token that request stored, or ask once more with the cookie as it is now.
        await pause(RACE_RETRY_MS);
        const stored = tokenStore.get();
        if (stored && stored !== staleToken) return 'refreshed';
        result = await attempt(staleToken);
        if (result.kind === 'race') return 'unavailable';
    }
    if (result.kind === 'ok') return 'refreshed';
    if (result.kind === 'superseded') return tokenStore.get() ? 'refreshed' : 'ended';
    if (result.kind === 'ended') {
        // Only this session is ended: a newer token stored meanwhile is left alone
        endSession(result.reason, staleToken);
        return tokenStore.get() ? 'refreshed' : 'ended';
    }
    return 'unavailable';
}

/** Runs `task` while no other tab of this browser is refreshing (Web Locks), or at once where they do not exist. */
function exclusive(task: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks?.request) return task();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOCK_TIMEOUT_MS);
    const granted = () => { clearTimeout(timer); return task(); };
    // An aborted wait (another tab holds the lock for too long) is "could not ask", not a sign-out
    return (locks.request(LOCK_NAME, { signal: controller.signal }, granted) as unknown as Promise<RefreshOutcome>)
        .catch(() => 'unavailable' as const)
        .finally(() => clearTimeout(timer));
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
