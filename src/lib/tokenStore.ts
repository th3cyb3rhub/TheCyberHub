const TOKEN_KEY = 'token';
const LEGACY_REFRESH_KEY = 'refreshToken';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function read(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try { return window.localStorage.getItem(key); } catch { return null; }
}

/** Returns false when the browser refused the write (blocked site data, quota). */
function write(key: string, value: string | null): boolean {
    if (typeof window === 'undefined') return false;
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Where the token lives when the browser refuses to store it. It then lasts for this page only, and
 * other tabs do not see it, but signing in still works instead of silently doing nothing.
 */
let memoryToken: string | null = null;
let memoryOnly = false;

function readToken(): string | null {
    if (memoryOnly) return memoryToken;
    if (typeof window === 'undefined') return null;
    try { return window.localStorage.getItem(TOKEN_KEY); } catch { return memoryToken; }
}

/**
 * The access token of this browser. Every read and write goes through here, and it tells subscribers
 * when the token changes, here or in another tab, so React state never lags behind a refresh.
 * The refresh token is not kept here: it lives in an httpOnly cookie.
 */
export const tokenStore = {
    get: readToken,
    set: (token: string): void => {
        if (readToken() === token) return;
        memoryOnly = !write(TOKEN_KEY, token);
        memoryToken = memoryOnly ? token : null;
        notify();
    },
    remove: (): void => {
        const had = readToken() !== null;
        memoryToken = null;
        memoryOnly = !write(TOKEN_KEY, null);
        if (had) notify();
    },
    subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener);
        const onStorage = (event: StorageEvent) => {
            if (event.key === TOKEN_KEY || event.key === null) listener();
        };
        if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
        return () => {
            listeners.delete(listener);
            if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
        };
    },
};

/** A refresh token that an older version of the site kept in localStorage. Sent once as a fallback, then dropped. */
export const legacyRefreshToken = {
    get: (): string | null => read(LEGACY_REFRESH_KEY),
    remove: (): void => { write(LEGACY_REFRESH_KEY, null); },
};

/**
 * The account id an access token names. Only used to key cached data per account: the token is not
 * verified here (the API does that on every call) and nothing is decided from this value.
 */
export function tokenUserId(token: string | null | undefined): string | null {
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    try {
        const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
        const claims = JSON.parse(atob(padded)) as { id?: unknown };
        return typeof claims.id === 'string' && claims.id ? claims.id : null;
    } catch {
        return null;
    }
}
