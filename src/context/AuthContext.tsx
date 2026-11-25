"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchApi } from '@/lib/api';
import { API_ENDPOINTS } from '@/lib/constants/api-endpoints';
import { authErrorMessage } from '@/lib/authErrors';
import { refreshAccessToken } from '@/lib/authRefresh';
import { onSessionEnded, stashSessionNotice } from '@/lib/authSession';
import { takePending2fa } from '@/lib/pending2fa';
import { unsubscribeThisDevice } from '@/lib/push';
import { signInHref } from '@/lib/safeRedirect';
import { legacyRefreshToken, tokenStore, tokenUserId } from '@/lib/tokenStore';
import { meKey, useMe } from '@/hooks/queries/useMe';
import type { AuthUser } from '@/types/auth';

export type { AuthUser };
export type TwoFactorChallenge = { requires2FA: true; tempToken: string };

interface ProfileUpdate {
    name?: string;
    username?: string;
    avatar?: string;
    bio?: string | null;
    location?: string | null;
    skills?: string[];
    socialLinks?: { website?: string | null; github?: string | null; twitter?: string | null; linkedin?: string | null };
}

interface AuthContextType {
    user: AuthUser | null;
    /** The access token, kept current when the request layer renews it */
    token: string | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<{ requires2FA: boolean; tempToken: string } | void>;
    verify2faLogin: (tempToken: string, code: string) => Promise<void>;
    register: (name: string, email: string, password: string, username?: string) => Promise<void>;
    /**
     * Ends the session on the server, then clears everything this browser holds for it. With
     * `allDevices` it ends every session and clears nothing until the server has confirmed.
     */
    logout: (options?: { allDevices?: boolean }) => Promise<void>;
    /** Re-read the signed-in user from the API (after something changed on the server) */
    refreshUser: () => Promise<void>;
    updateProfile: (data: ProfileUpdate) => Promise<void>;
    /** Resolves with how many other devices were signed out by the change */
    updatePassword: (currentPassword: string, newPassword: string) => Promise<{ revokedSessions: number }>;
    forgotPassword: (email: string) => Promise<string>;
    resetPassword: (token: string, password: string) => Promise<void>;
    requestVerification: () => Promise<string>;
    verifyEmail: (token: string) => Promise<void>;
    loginWithGoogle: (idToken: string) => Promise<TwoFactorChallenge | void>;
    loginWithGithub: (code: string) => Promise<TwoFactorChallenge | void>;
    updateBookmarks: (data: Partial<NonNullable<AuthUser['bookmarks']>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

/** How long a sign-out waits for the server before this browser signs out anyway */
const LOGOUT_WAIT_MS = 5000;

const noopSubscribe = () => () => {};

/** A call to the API that does not carry the access token (sign-in, reset, the second factor): its errors never renew or sign out. */
async function publicCall(endpoint: string, body: unknown, fallback: string) {
    try {
        return await fetchApi(endpoint, { method: 'POST', requireAuth: false, body: JSON.stringify(body) });
    } catch (err) {
        throw withMessage(err, fallback);
    }
}

/** A call made as the signed-in member. */
async function memberCall(endpoint: string, method: string, body: unknown, fallback: string) {
    try {
        return await fetchApi(endpoint, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch (err) {
        throw withMessage(err, fallback);
    }
}

/** The same error with the text a form should show (a field problem first, a rate limit with its wait). */
function withMessage(err: unknown, fallback: string): unknown {
    if (!(err instanceof ApiError)) return err;
    return new ApiError(authErrorMessage(err, fallback), err.status, err.code, err.details, err.meta);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const queryClient = useQueryClient();
    const router = useRouter();

    // Before hydration the server and the first client render both say "not known yet"
    const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
    const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, () => null);
    const me = useMe(token);

    const user = token ? me.data ?? null : null;
    const loading = !hydrated || (!!token && me.isPending);

    const userRef = useRef(user);
    userRef.current = user;
    const signingOut = useRef(false);

    /** Everything this browser keeps for the session, apart from the cookie the server clears */
    const clearClientState = useCallback(() => {
        tokenStore.remove();
        legacyRefreshToken.remove();
        takePending2fa();
        queryClient.clear();
    }, [queryClient]);

    // The API says this session is over (signed out from another device, a ban, an old token) or a
    // refresh failed: clear everything. A member who was signed in is told why on the sign-in page
    // (the note waits there). Pages that need a member send them to sign-in themselves, and come back
    // afterwards; a public page just carries on as signed out. A disabled account is taken to
    // sign-in at once, wherever it was.
    useEffect(() => onSessionEnded((reason) => {
        if (signingOut.current) return;
        const hadUser = userRef.current !== null;
        clearClientState();
        if (!hadUser || window.location.pathname.startsWith('/auth')) return;
        stashSessionNotice(reason);
        if (reason === 'disabled') router.replace(signInHref(window.location.pathname + window.location.search));
    }), [clearClientState, router]);

    // A token an older version of the site kept for renewing is replaced by the cookie flow at once
    // instead of whenever the first renewal happens: it is readable by any script on the page
    useEffect(() => {
        if (!legacyRefreshToken.get()) return;
        const current = tokenStore.get();
        if (current) void refreshAccessToken(current);
        else legacyRefreshToken.remove();
    }, []);

    // The token changed to another account's, here or in another tab: nothing cached for the previous
    // account stays. This runs when the token changes, before React renders for the new one, so it
    // cannot remove what the new account's components start asking for. The new account's own `me`
    // entry (seeded by a sign-in) is kept.
    useEffect(() => {
        const identityOf = (value: string | null) => (value ? tokenUserId(value) ?? 'unknown' : null);
        let last = identityOf(tokenStore.get());
        return tokenStore.subscribe(() => {
            const next = identityOf(tokenStore.get());
            if (next === last) return;
            const hadAccount = last !== null;
            last = next;
            if (!hadAccount) return;
            queryClient.removeQueries({ predicate: (query) => !(query.queryKey[0] === 'auth' && query.queryKey[1] === 'me' && query.queryKey[2] === next) });
        });
    }, [queryClient]);

    /** Stores the session a sign-in answered with. The previous account's cache goes first. */
    const startSession = useCallback((result: { token?: string; data?: AuthUser }) => {
        if (!result.token) throw new Error('The server did not return a session');
        queryClient.clear();
        if (result.data) queryClient.setQueryData(meKey(result.token), result.data);
        tokenStore.set(result.token);
        legacyRefreshToken.remove();
    }, [queryClient]);

    const setUser = useCallback((data: AuthUser | undefined) => {
        if (data) queryClient.setQueryData(meKey(tokenStore.get()), data);
    }, [queryClient]);

    const login = async (email: string, password: string): Promise<{ requires2FA: boolean; tempToken: string } | void> => {
        const result = await publicCall(API_ENDPOINTS.AUTH.LOGIN, { email, password }, 'Login failed');
        if (result.requires2FA) return { requires2FA: true, tempToken: result.tempToken };
        startSession(result);
    };

    const verify2faLogin = async (tempToken: string, code: string) => {
        startSession(await publicCall(API_ENDPOINTS.AUTH.TWO_FACTOR_VERIFY, { tempToken, code }, '2FA Verification failed'));
    };

    const register = async (name: string, email: string, password: string, username?: string) => {
        startSession(await publicCall(API_ENDPOINTS.AUTH.REGISTER, { name, email, password, ...(username && { username }) }, 'Registration failed'));
    };

    const oauth = async (endpoint: string, body: Record<string, string>, fallback: string): Promise<TwoFactorChallenge | void> => {
        const result = await publicCall(endpoint, body, fallback);
        if (result.requires2FA) return { requires2FA: true, tempToken: result.tempToken };
        startSession(result);
    };

    const loginWithGoogle = (idToken: string) => oauth(API_ENDPOINTS.AUTH.OAUTH_GOOGLE, { idToken }, 'Google login failed');
    const loginWithGithub = (code: string) => oauth(API_ENDPOINTS.AUTH.OAUTH_GITHUB, { code }, 'GitHub login failed');

    const logout = async (options?: { allDevices?: boolean }) => {
        const current = tokenStore.get();
        // "Everywhere" needs a signed-in session to speak for; without one it is the ordinary sign-out
        const allDevices = !!options?.allDevices && !!current;
        if (current) {
            // This browser must stop getting the member's pushes. Started before the token goes, with that token, and never allowed to block or break signing out.
            try {
                void Promise.resolve(unsubscribeThisDevice(current)).catch(() => { /* best effort */ });
            } catch {
                // Nothing to do
            }
        }
        // The server is always asked, with or without a usable access token: it ends the session the
        // refresh cookie belongs to and clears the cookie, which this page cannot do itself.
        signingOut.current = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const request = fetchApi(API_ENDPOINTS.AUTH.LOGOUT, { method: 'POST', body: JSON.stringify(allDevices ? { allDevices: true } : {}) });
            const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Sign out timed out')), LOGOUT_WAIT_MS); });
            await Promise.race([request, timeout]);
        } catch (err) {
            // Signing out of one device always completes here: a session that is already gone, or an
            // API that cannot be reached, must not keep the member signed in. "Everywhere" is a promise
            // about other devices, so it is only kept when the server confirmed it.
            if (allDevices) {
                signingOut.current = false;
                // A forced end (a failed renewal) may already have dropped the token: this device is signed out then
                if (tokenStore.get() === null) clearClientState();
                throw err instanceof ApiError ? withMessage(err, 'Could not sign out of all devices.') : new Error('Could not sign out of all devices. Check your connection and try again.');
            }
        } finally {
            clearTimeout(timer);
        }
        clearClientState();
        signingOut.current = false;
    };

    // Unlike a sign-in check this never signs anyone out by itself: a failed read just keeps what we have
    const refreshUser = async () => {
        if (!tokenStore.get()) return;
        await queryClient.invalidateQueries({ queryKey: meKey(tokenStore.get()) });
    };

    const updateProfile = async (data: ProfileUpdate) => {
        setUser((await memberCall(API_ENDPOINTS.AUTH.ME, 'PUT', data, 'Update failed')).data);
    };

    const updatePassword = async (currentPassword: string, newPassword: string) => {
        const result = await memberCall(API_ENDPOINTS.AUTH.PASSWORD, 'PUT', { currentPassword, newPassword }, 'Password update failed');
        // The change ended every other session; this one continues on the new access token the API returns
        if (result.token) tokenStore.set(result.token);
        legacyRefreshToken.remove();
        return { revokedSessions: typeof result.revokedSessions === 'number' ? result.revokedSessions : 0 };
    };

    const forgotPassword = async (email: string): Promise<string> => (await publicCall(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, { email }, 'Request failed')).message;

    const resetPassword = async (resetToken: string, password: string) => {
        const result = await publicCall(API_ENDPOINTS.AUTH.RESET_PASSWORD, { token: resetToken, password }, 'Reset failed');
        // The reset signs the member in (and ended every other session)
        if (result.token) startSession(result);
    };

    const requestVerification = async (): Promise<string> => (await memberCall(API_ENDPOINTS.AUTH.VERIFY_REQUEST, 'POST', {}, 'Verification request failed')).message;

    const verifyEmail = async (verificationToken: string) => {
        const result = await publicCall(API_ENDPOINTS.AUTH.VERIFY_CONFIRM, { token: verificationToken }, 'Verification failed');
        if (result.token) startSession(result);
    };

    const updateBookmarks = async (data: Partial<NonNullable<AuthUser['bookmarks']>>) => {
        setUser((await memberCall(API_ENDPOINTS.AUTH.BOOKMARKS, 'PUT', data, 'Bookmark update failed')).data);
    };

    const value = useMemo<AuthContextType>(() => ({
        user, token, loading,
        login, verify2faLogin, register, logout, refreshUser, updateProfile, updatePassword,
        forgotPassword, resetPassword, requestVerification, verifyEmail,
        loginWithGoogle, loginWithGithub, updateBookmarks,
    // The actions only read the stores and the query client, so they change when those do
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [user, token, loading, queryClient, clearClientState, startSession, setUser]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
