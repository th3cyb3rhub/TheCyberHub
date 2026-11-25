import type { Page, Route } from '@playwright/test';
import { json, preflight, testUser } from './helpers';

/**
 * A stand-in for the auth routes of the API, answering the way the real ones do: a bearer call with
 * a token the "server" does not know is a 401 `AUTH_TOKEN_INVALID`, a refresh trades the cookie for a
 * new token, and the sessions routes keep a list. Every call is recorded so a spec can assert what
 * the app sent, and with which token.
 */

export interface SeenRequest {
    method: string;
    path: string;
    /** The bearer token of the call, or null */
    token: string | null;
    body: Record<string, unknown> | null;
    credentials: boolean;
}

export interface MockSession {
    id: string;
    current: boolean;
    userAgent: string | null;
    ipAddress: string | null;
    lastUsedAt: string;
    createdAt: string;
}

export type RefreshAnswer =
    | { kind: 'ok'; token: string }
    | { kind: 'invalid' }
    | { kind: 'race'; then: RefreshAnswer }
    | { kind: 'unavailable' };

export interface AuthState {
    /** Access tokens the server accepts */
    valid: Set<string>;
    refresh: RefreshAnswer;
    /** How long a refresh takes, so that several failing requests are in flight together */
    refreshDelayMs: number;
    sessions: MockSession[];
    user: Record<string, unknown>;
    /** Answers `/auth/login`: `requires2FA` makes a second step */
    login: 'ok' | 'requires2FA' | 'refused';
    /** The code the second step accepts */
    code: string;
    /** Makes every call with this token answer 401 AUTH_SESSION_REVOKED (a device signed out elsewhere) */
    revokedTokens: Set<string>;
    /** The token stops working right after `/auth/me` has answered, as one that expires while the page loads */
    expireAfterMe: boolean;
}

export const chromeMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
export const iphoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
export const firefoxLinux = 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const sessionsFixture = (): MockSession[] => [
    { id: 'a'.repeat(32), current: true, userAgent: chromeMac, ipAddress: '203.0.113.7', lastUsedAt: minutesAgo(0), createdAt: minutesAgo(60 * 24) },
    { id: 'b'.repeat(32), current: false, userAgent: iphoneSafari, ipAddress: '198.51.100.9', lastUsedAt: minutesAgo(180), createdAt: minutesAgo(60 * 24 * 5) },
    { id: 'c'.repeat(32), current: false, userAgent: firefoxLinux, ipAddress: '192.0.2.44', lastUsedAt: minutesAgo(60 * 24 * 2), createdAt: minutesAgo(60 * 24 * 12) },
];

const failure = (route: Route, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
    json(route, { success: false, error: { code, message, ...extra }, timestamp: new Date().toISOString() }, status);

export async function mockAuthApi(page: Page, overrides: Partial<AuthState> = {}) {
    const state: AuthState = {
        valid: new Set(['good-token']),
        refresh: { kind: 'ok', token: 'fresh-token' },
        refreshDelayMs: 0,
        sessions: sessionsFixture(),
        user: testUser,
        login: 'ok',
        code: '123456',
        revokedTokens: new Set(),
        expireAfterMe: false,
        ...overrides,
    };
    const seen: SeenRequest[] = [];

    const bearer = (route: Route) => (route.request().headers()['authorization'] ?? '').replace(/^Bearer /, '') || null;
    const answerRefresh = async (route: Route, answer: RefreshAnswer): Promise<void> => {
        if (state.refreshDelayMs) await new Promise((resolve) => setTimeout(resolve, state.refreshDelayMs));
        if (answer.kind === 'ok') {
            state.valid.add(answer.token);
            return void (await json(route, { success: true, token: answer.token, refreshToken: 'r', expiresIn: 900 }));
        }
        if (answer.kind === 'race') return answerRefresh(route, answer.then);
        if (answer.kind === 'unavailable') return void (await json(route, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Try later' } }, 503));
        return void (await failure(route, 401, 'AUTH_TOKEN_INVALID', 'Invalid or expired refresh token'));
    };

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        if (request.method() === 'OPTIONS') return preflight(route);
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();
        const token = bearer(route);
        let body: Record<string, unknown> | null = null;
        try { body = request.postDataJSON(); } catch { /* no body */ }
        seen.push({ method, path, token, body, credentials: path.startsWith('/api/auth/') });

        // Public routes first
        if (path === '/api/auth/refresh') {
            return answerRefresh(route, state.refresh);
        }
        if (path === '/api/auth/login') {
            if (state.login === 'refused') return failure(route, 401, 'AUTH_TOKEN_INVALID', 'Invalid credentials');
            if (state.login === 'requires2FA') return json(route, { success: true, requires2FA: true, tempToken: 'temp-opaque' });
            state.valid.add('login-token');
            return json(route, { success: true, token: 'login-token', refreshToken: 'r', expiresIn: 900, data: state.user });
        }
        if (path === '/api/auth/2fa/verify') {
            if (body?.code !== state.code) return failure(route, 401, 'AUTH_TOKEN_INVALID', 'Invalid 2FA code');
            state.valid.add('login-token');
            return json(route, { success: true, token: 'login-token', refreshToken: 'r', expiresIn: 900, data: state.user });
        }
        if (path.startsWith('/api/auth/oauth/')) {
            state.valid.add('oauth-token');
            return json(route, { success: true, token: 'oauth-token', refreshToken: 'r', expiresIn: 900, data: state.user });
        }

        // Everything else is a bearer call
        if (token && state.revokedTokens.has(token)) return failure(route, 401, 'AUTH_SESSION_REVOKED', 'This session has ended. Please sign in again.');
        if (!token || !state.valid.has(token)) return failure(route, 401, 'AUTH_TOKEN_INVALID', 'Invalid or expired token');

        if (path === '/api/auth/me') {
            if (state.expireAfterMe) state.valid.delete(token);
            return json(route, { success: true, data: state.user });
        }
        if (path === '/api/auth/logout') return json(route, { success: true, message: 'Logged out' });
        if (path === '/api/auth/sessions' && method === 'GET') return json(route, { success: true, data: state.sessions });
        if (path === '/api/auth/sessions/others' && method === 'DELETE') {
            const revoked = state.sessions.filter((s) => !s.current).length;
            state.sessions = state.sessions.filter((s) => s.current);
            return json(route, { success: true, data: { revoked } });
        }
        if (path === '/api/auth/sessions' && method === 'DELETE') {
            state.sessions = [];
            return json(route, { success: true, data: { revoked: 3 } });
        }
        const one = path.match(/^\/api\/auth\/sessions\/([0-9a-f]{32})$/);
        if (one && method === 'DELETE') {
            const found = state.sessions.find((s) => s.id === one[1]);
            if (!found) return failure(route, 404, 'RESOURCE_NOT_FOUND', 'Session not found');
            state.sessions = state.sessions.filter((s) => s.id !== found.id);
            return json(route, { success: true, message: 'Session revoked', data: { id: found.id, current: found.current } });
        }
        if (path === '/api/auth/password' && method === 'PUT') return json(route, { success: true, token, revokedSessions: 2 });

        // Anything else the page asks for: an empty list
        return json(route, { success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1, hasMore: false } });
    });

    return {
        state,
        seen,
        calls: (path: string, method?: string) => seen.filter((r) => r.path === path && (!method || r.method === method)),
    };
}

/** Starts the browser with a stored access token, as a returning visitor has. */
export async function storeToken(page: Page, token: string) {
    await page.addInitScript((value) => window.localStorage.setItem('token', value), token);
}
