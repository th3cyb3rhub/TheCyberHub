import type { CveDetail, DnsResult, HeadersResult, IpResult, SslResult, TakeoverResult, WhoisResult } from '@/types/tools';

/** Plain-text versions of results, for the "copy summary" button */

const or = (value: unknown, fallback = 'Not published') => (value === null || value === undefined || value === '' ? fallback : String(value));

export function whoisSummary(r: WhoisResult): string {
    return [
        `Domain: ${r.domain}`,
        `Registrar: ${or(r.registrar)}`,
        `Created: ${or(r.created)}`,
        `Expires: ${or(r.expires)}`,
        `Updated: ${or(r.updated)}`,
        `Status: ${or(r.status.join(', '), 'None listed')}`,
        `Name servers: ${or(r.nameservers.join(', '), 'None listed')}`,
        `DNSSEC: ${r.dnssec === null ? 'Unknown' : r.dnssec ? 'Signed' : 'Unsigned'}`,
    ].join('\n');
}

export function dnsSummary(r: DnsResult): string {
    const lines = [`Name: ${r.name}`, `Exists: ${r.exists === null ? 'unknown' : r.exists ? 'yes' : 'no'}`];
    for (const type of Object.keys(r.results)) {
        const entry = r.results[type];
        if (entry.status === 'ok') {
            for (const rec of entry.records) lines.push(`${type}\t${typeof rec === 'string' ? rec : rec.value}`);
        } else {
            lines.push(`${type}\t(${entry.status}${entry.error ? `: ${entry.error}` : ''})`);
        }
    }
    return lines.join('\n');
}

export function ipSummary(r: IpResult): string {
    const lines = [`IP: ${r.ip}`, `Classification: ${r.classification}`];
    if (r.reverseDns.length) lines.push(`Reverse DNS: ${r.reverseDns.join(', ')}`);
    if (r.network) {
        const n = r.network;
        lines.push(`Network: ${or(n.name)}${n.handle ? ` (${n.handle})` : ''}`, `Range: ${or(n.startAddress)} - ${or(n.endAddress)}`);
        if (n.cidr.length) lines.push(`CIDR: ${n.cidr.join(', ')}`);
        if (n.country) lines.push(`Country: ${n.country}`);
    }
    return lines.join('\n');
}

export function cveSummary(r: CveDetail): string {
    return [
        r.id,
        r.cvss ? `CVSS ${or(r.cvss.version, '')} ${or(r.cvss.score, 'n/a')} ${or(r.cvss.severity, '')}`.replace(/\s+/g, ' ').trim() : 'CVSS: not scored',
        `Published: ${or(r.published)}`,
        r.summary,
        ...r.refs.slice(0, 10).map((ref) => ref.url),
    ].join('\n');
}

export function headersSummary(r: HeadersResult): string {
    return [
        `URL: ${r.requestedUrl}`,
        `Final URL: ${r.finalUrl}`,
        `Status: ${r.status}`,
        '',
        ...r.checks.map((c) => `[${c.status.toUpperCase()}] ${c.header ?? c.id}: ${c.message}`),
    ].join('\n');
}

export function sslSummary(r: SslResult): string {
    return [
        `Host: ${r.host}:${r.port}`,
        `Protocol: ${or(r.protocol, 'unknown')}`,
        `Cipher: ${r.cipher ? r.cipher.name : 'unknown'}`,
        `Trusted: ${r.verified ? 'yes' : `no (${or(r.verificationError, 'unknown')})`}`,
        `Name matches: ${r.hostnameMatch ? 'yes' : 'no'}`,
        `Valid from: ${or(r.certificate.validFrom)}`,
        `Valid to: ${or(r.certificate.validTo)}`,
        `Issuer: ${r.certificate.issuer.CN ?? r.certificate.issuer.O ?? 'unknown'}`,
        ...r.findings.map((f) => `[${f.severity.toUpperCase()}] ${f.message}`),
    ].join('\n');
}

export function takeoverSummary(r: TakeoverResult): string {
    return [
        `Scope: ${r.scope} (checked ${r.checked})`,
        ...r.results.map((h) => `${h.status}\t${h.host}${h.provider ? `\t${h.provider}` : ''}${h.cname.length ? `\t-> ${h.cname[h.cname.length - 1]}` : ''}`),
        '',
        r.note,
    ].join('\n');
}

export function subdomainsSummary(domain: string, names: string[]): string {
    return `${names.join('\n')}${names.length ? '\n' : ''}`.replace(/^$/, `# no subdomains found for ${domain}`);
}
