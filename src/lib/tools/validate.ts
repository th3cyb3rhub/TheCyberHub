import { z } from 'zod';

/**
 * Quick checks that give the visitor an answer before a request is spent. The API repeats every
 * rule (and decides which targets may be contacted at all), so these only mirror its shape.
 */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

// Built from a string: the project targets ES5, which rejects the `u` flag on a literal
const LABEL = new RegExp('^[\\p{L}\\p{N}_]([\\p{L}\\p{N}_-]{0,61}[\\p{L}\\p{N}_])?$', 'u');

/** A pasted URL or host reduced to a bare lower-case host name: no scheme, credentials, port, path or trailing dot */
export function cleanHostInput(raw: string): string {
    let value = raw.trim().toLowerCase();
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    value = value.replace(/[/?#].*$/, '');
    value = value.replace(/^[^@]*@/, '');
    if (!value.startsWith('[')) value = value.replace(/:\d+$/, '');
    return value.replace(/\.$/, '');
}

export function isIPv4(value: string): boolean {
    const parts = value.split('.');
    return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && String(Number(p)) === p);
}

export function isIPv6(value: string): boolean {
    if (!value.includes(':') || !/^[0-9a-f:.]+$/i.test(value) || value.length > 45) return false;
    try {
        return new URL(`http://[${value}]/`).hostname.length > 0;
    } catch {
        return false;
    }
}

export const isIp = (value: string) => isIPv4(value) || isIPv6(value);

export function isDomainName(value: string, { allowUnderscore = false } = {}): boolean {
    if (value.length < 3 || value.length > 253 || isIPv4(value)) return false;
    const labels = value.split('.');
    if (labels.length < 2) return false;
    return labels.every((label) => LABEL.test(label) && (allowUnderscore || !label.includes('_')));
}

const run = <T>(schema: z.ZodType<T>, value: unknown): Checked<T> => {
    const parsed = schema.safeParse(value);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
};

export const domainSchema = z.string().transform(cleanHostInput).pipe(
    z.string().min(1, 'Enter a domain name such as example.com.').refine((v) => isDomainName(v), 'Enter a domain name such as example.com (not an IP address).'),
);

/** A name for DNS: a domain (underscores allowed, for _dmarc and friends) or an IP address */
export const dnsNameSchema = z.string().transform((v) => {
    const cleaned = cleanHostInput(v);
    return cleaned.startsWith('[') && cleaned.endsWith(']') ? cleaned.slice(1, -1) : cleaned;
}).pipe(
    z.string().min(1, 'Enter a domain name or an IP address.').refine((v) => isIp(v) || isDomainName(v, { allowUnderscore: true }), 'Enter a domain name such as example.com, or an IP address.'),
);

/** A host for a TLS check: a domain or an IP address */
export const hostSchema = z.string().transform((v) => {
    const cleaned = cleanHostInput(v);
    return cleaned.startsWith('[') && cleaned.endsWith(']') ? cleaned.slice(1, -1) : cleaned;
}).pipe(
    z.string().min(1, 'Enter a host name or an IP address.').refine((v) => isIp(v) || isDomainName(v), 'Enter a host name such as example.com, or an IP address.'),
);

export const ipSchema = z.string().trim().transform((v) => (v.startsWith('[') && v.endsWith(']') ? v.slice(1, -1) : v)).pipe(
    z.string().min(1, 'Enter an IPv4 or IPv6 address.').refine(isIp, 'That is not a valid IPv4 or IPv6 address.'),
);

export const cveIdSchema = z.string().trim().toUpperCase().regex(/^CVE-\d{4}-\d{4,19}$/, 'A CVE id looks like CVE-2021-44228.');

export const portSchema = z.coerce.number({ error: 'Enter a port number from 1 to 65535.' }).int('Enter a port number from 1 to 65535.').min(1, 'Enter a port number from 1 to 65535.').max(65535, 'Enter a port number from 1 to 65535.');

/** An http(s) address. A bare host such as example.com is read as https://example.com */
export const httpUrlSchema = z.string().trim().min(1, 'Enter a URL such as https://example.com.').max(2048, 'That URL is too long.').transform((v) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`)).pipe(
    z.string().refine((v) => {
        try {
            const url = new URL(v);
            return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
        } catch {
            return false;
        }
    }, 'Enter an http or https URL such as https://example.com.'),
);

/** An origin such as https://example.com, or the word null */
export const originSchema = z.string().trim().refine((v) => {
    if (v === 'null') return true;
    try {
        const url = new URL(v);
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === v.replace(/\/$/, '');
    } catch {
        return false;
    }
}, 'An origin looks like https://example.com (no path), or null.');

export const checkDomain = (value: string) => run(domainSchema, value);
export const checkDnsName = (value: string) => run(dnsNameSchema, value);
export const checkHost = (value: string) => run(hostSchema, value);
export const checkIp = (value: string) => run(ipSchema, value);
export const checkCveId = (value: string) => run(cveIdSchema, value);
export const checkPort = (value: string | number) => run(portSchema, value);
export const checkHttpUrl = (value: string) => run(httpUrlSchema, value);

/** Origins, one per line or comma separated, at most five; returns the first problem */
export function checkOrigins(raw: string): Checked<string[]> {
    const list = Array.from(new Set(raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)));
    if (list.length > 5) return { ok: false, error: 'Enter at most 5 origins.' };
    for (const origin of list) {
        const result = run(originSchema, origin);
        if (!result.ok) return { ok: false, error: `"${origin.slice(0, 60)}": ${result.error}` };
    }
    return { ok: true, value: list };
}

/** Subdomains, one per line or comma separated, between 1 and 20 */
export function checkSubdomainList(raw: string): Checked<string[]> {
    const list = Array.from(new Set(raw.split(/[\s,]+/).map(cleanHostInput).filter(Boolean)));
    if (list.length === 0) return { ok: false, error: 'Enter at least one host name.' };
    if (list.length > 20) return { ok: false, error: `Enter at most 20 host names (you entered ${list.length}).` };
    const bad = list.find((h) => !isDomainName(h));
    if (bad) return { ok: false, error: `"${bad.slice(0, 60)}" is not a valid host name.` };
    return { ok: true, value: list };
}
