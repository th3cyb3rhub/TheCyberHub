import { legacyRefreshToken, tokenSessionId, tokenStore, tokenUserId } from '@/lib/tokenStore';

/** Why this browser is no longer signed in, when it was not the member's own choice. */
export type SessionEndReason = 'expired' | 'revoked' | 'legacy' | 'disabled';

export const SESSION_END_NOTICES: Record<SessionEndReason, string> = {
    expired: 'Your session has expired. Please sign in again.',
    revoked: 'This device was signed out. Please sign in again.',
    legacy: 'Your sign-in is out of date. Please sign in again.',
    disabled: 'This account has been disabled. Contact support if you think this is a mistake.',
};

type Listener = (reason: SessionEndReason) => void;
const listeners = new Set<Listener>();

/** Runs when the API says this browser's session is over. Returns the way to stop listening. */
export function onSessionEnded(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/**
 * Drops the local sign-in and tells the app. Several failing requests can report the same end at
 * once; only the first one that finds a token to drop is announced.
 *
 * `forToken` is the access token the failing call carried. When the browser holds a different one by
 * now (the member signed in again meanwhile, here or in another tab), the answer is about a session
 * that is already gone and the newer one is left alone. A disabled account is the exception when the
 * newer token belongs to the same account: the ban applies to every session of it.
 */
export function endSession(reason: SessionEndReason, forToken?: string | null): void {
    const current = tokenStore.get();
    // A renewed token is a different string of the same session: an answer about the old one still ends it
    const sameSession = !!tokenSessionId(current) && tokenSessionId(current) === tokenSessionId(forToken);
    if (forToken !== undefined && current !== forToken && !sameSession) {
        const sameAccount = !!tokenUserId(current) && tokenUserId(current) === tokenUserId(forToken);
        if (!(reason === 'disabled' && sameAccount)) return;
    }
    const hadToken = current !== null;
    tokenStore.remove();
    legacyRefreshToken.remove();
    if (hadToken) listeners.forEach((listener) => listener(reason));
}

const NOTICE_KEY = 'sessionEndedReason';

/** Hands the reason to the sign-in page, which may be reached by more than one route. Session-scoped, read once. */
export function stashSessionNotice(reason: SessionEndReason): void {
    try { sessionStorage.setItem(NOTICE_KEY, reason); } catch { /* storage unavailable: the page opens without the note */ }
}

export function takeSessionNotice(): string | null {
    try {
        const reason = sessionStorage.getItem(NOTICE_KEY) as SessionEndReason | null;
        sessionStorage.removeItem(NOTICE_KEY);
        return reason && reason in SESSION_END_NOTICES ? SESSION_END_NOTICES[reason] : null;
    } catch {
        return null;
    }
}
