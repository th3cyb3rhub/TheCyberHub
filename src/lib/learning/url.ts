/**
 * Link rules shared by the resource form and the roadmap editor. They mirror the API's checks
 * (http or https only, no credentials, a public-looking host), so a link that passes here passes
 * there. The server has the last word and also blocks link shorteners.
 */

/** Parse a link. Returns a URL, or null unless it is http(s) without credentials and with a host. */
export function parseHttpUrl(value: string): URL | null {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (!url.hostname) return null;
    return url;
}

/** Hosts that never belong in a public library: addresses, local names, single-label names */
export function isInternalHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (host.includes(':')) return true; // IPv6
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (/\.(local|internal|lan|home|corp|intranet|test|invalid|example)$/.test(host)) return true;
    if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
    return !host.includes('.');
}

export type LinkProblem = 'invalid' | 'internal';

/** null when the link is acceptable */
export function linkProblem(value: string): LinkProblem | null {
    const url = parseHttpUrl(value);
    if (!url) return 'invalid';
    if (isInternalHost(url.hostname)) return 'internal';
    return null;
}

export const LINK_MESSAGES: Record<LinkProblem, string> = {
    invalid: 'Enter a valid http or https link, without a username or password',
    internal: 'The link must point to a public website',
};

export function domainOf(value: string): string {
    const url = parseHttpUrl(value);
    return url ? url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '') : '';
}
