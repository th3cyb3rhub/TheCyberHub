import { safeRedirectPath } from '@/lib/safeRedirect';

const KEY = 'oauthReturnTo';

/**
 * Remembers where to go after signing in with Google or GitHub: the round trip to the provider drops
 * the sign-in page's `?redirect=`. Only a same-site path is kept. Session-scoped, read once.
 */
export function stashOAuthReturn(target: string | null | undefined): void {
    try {
        const safe = safeRedirectPath(target, '');
        if (safe) sessionStorage.setItem(KEY, safe);
        else sessionStorage.removeItem(KEY);
    } catch {
        // storage unavailable: the member lands on the default page
    }
}

/** The remembered path (checked again, since storage can be written by anything on the page), or null. */
export function takeOAuthReturn(): string | null {
    try {
        const stored = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        return stored ? safeRedirectPath(stored, '') || null : null;
    } catch {
        return null;
    }
}
