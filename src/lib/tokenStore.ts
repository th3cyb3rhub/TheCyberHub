const TOKEN_KEY = 'token';
const LEGACY_REFRESH_KEY = 'refreshToken';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function read(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try { return window.localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string | null): void {
    if (typeof window === 'undefined') return;
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
    } catch { /* quota or private browsing: the token then lives for this page only */ }
}

/**
 * The access token of this browser. Every read and write goes through here, and it tells subscribers
 * when the token changes, here or in another tab, so React state never lags behind a refresh.
 * The refresh token is not kept here: it lives in an httpOnly cookie.
 */
export const tokenStore = {
    get: (): string | null => read(TOKEN_KEY),
    set: (token: string): void => {
        if (read(TOKEN_KEY) === token) return;
        write(TOKEN_KEY, token);
        notify();
    },
    remove: (): void => {
        const had = read(TOKEN_KEY) !== null;
        write(TOKEN_KEY, null);
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
    remove: (): void => write(LEGACY_REFRESH_KEY, null),
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
