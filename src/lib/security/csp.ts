/**
 * The production Content-Security-Policy, built in one place so a test can pin it.
 *
 * connect-src lists only what the browser itself calls:
 *  - our own origin and the API (http(s) for fetch, ws(s) for Socket.IO), taken from NEXT_PUBLIC_API_URL
 *  - *.amazonaws.com, for direct uploads to S3 with a presigned URL (the admin OVA uploader)
 *  - analytics
 * The security tools reach DNS, WHOIS, IP, TLS and certificate data through our API, so no third-party
 * lookup service is listed. Keep it that way: a new tool that needs a new origin must say why here.
 */

const ANALYTICS_CONNECT = ['https://www.google-analytics.com', 'https://www.googletagmanager.com', 'https://va.vercel-scripts.com'];

// Every origin the browser may fetch from other than the API; used by the tests to fail on additions
export const STATIC_CONNECT_SOURCES = ["'self'", 'https://*.amazonaws.com', ...ANALYTICS_CONNECT];

/** The http(s) origin for fetch and the ws(s) origin for sockets of the API. An unset or invalid URL adds nothing. */
export function apiConnectSources(apiUrl: string | undefined): string[] {
    if (!apiUrl) return [];
    try {
        const { protocol, host } = new URL(apiUrl);
        if (protocol !== 'https:' && protocol !== 'http:') return [];
        return [`${protocol}//${host}`, `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}`];
    } catch {
        return [];
    }
}

export function connectSrc(apiUrl: string | undefined): string {
    return ['connect-src', ...STATIC_CONNECT_SOURCES, ...apiConnectSources(apiUrl)].join(' ');
}

export function contentSecurityPolicy(apiUrl: string | undefined): string {
    return [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://www.google-analytics.com https://www.googletagmanager.com https://va.vercel-scripts.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        connectSrc(apiUrl),
        "frame-ancestors 'none'",
    ].join('; ') + ';';
}
