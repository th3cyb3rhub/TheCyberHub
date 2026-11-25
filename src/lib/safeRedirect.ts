const PROBE_ORIGIN = 'http://redirect-check.invalid';
const MAX_LENGTH = 2048;

/** The sign-in page and the OAuth callbacks: sending someone there after signing in would loop. */
const AUTH_LOOP = /^\/auth(?:[/?#]|$)/i;

/** Percent-decodes up to a few layers, so `/%2F/host` and `/%255C/host` read as what a browser may end up with. */
function decodeLayers(value: string): string | null {
    let current = value;
    for (let i = 0; i < 4; i += 1) {
        let next: string;
        try {
            next = decodeURIComponent(current);
        } catch {
            return null;
        }
        if (next === current) return current;
        current = next;
    }
    return current;
}

function isOffSite(value: string): boolean {
    // `//host` is a protocol-relative URL; browsers also read `\` as `/`, and drop tabs and line breaks inside a URL
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return true;
    if (/[\u0000-\u001f\u007f-\u009f]/.test(value) || value.includes(String.fromCharCode(0x2028)) || value.includes(String.fromCharCode(0x2029))) return true;
    return false;
}

/**
 * Returns `target` only when it is a path on this site, otherwise `fallback`.
 *
 * Accepted: a path that starts with a single `/`. Refused: absolute URLs and other schemes,
 * protocol-relative `//host`, backslashes (`/\host`), control characters, any of those hidden behind
 * percent-encoding (`/%2F/host`, `/%5Chost`), and the sign-in page itself (a redirect loop).
 * So `?redirect=` can never send a signed-in user off-site.
 */
export function safeRedirectPath(target: string | null | undefined, fallback = '/profile'): string {
    if (!target || target.length > MAX_LENGTH) return fallback;
    if (isOffSite(target)) return fallback;
    const decoded = decodeLayers(target);
    if (decoded === null || isOffSite(decoded)) return fallback;
    if (AUTH_LOOP.test(target) || AUTH_LOOP.test(decoded)) return fallback;
    try {
        // The final word is the URL parser: whatever it resolves must still be this site
        if (new URL(target, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return fallback;
    } catch {
        return fallback;
    }
    return target;
}

/** The sign-in URL that brings the person back to `returnTo` (only a safe path is kept). */
export function signInHref(returnTo?: string | null): string {
    const safe = safeRedirectPath(returnTo, '');
    return safe ? `/auth?redirect=${encodeURIComponent(safe)}` : '/auth';
}
