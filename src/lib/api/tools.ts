import { fetchApi } from '@/lib/api';
import type { LiveRegistry } from '@/lib/tools/registry';
import type {
    AdminToolSettings, AdminToolSettingsChange, AdminToolStats, CorsResult, CveDetail, CveSearchResult, CveSeverity,
    DnsResult, HeadersResult, IpResult, SslResult, SubdomainsResult, TakeoverResult, ToolCapabilities, ToolMetaInfo,
    ToolResponse, WhoisResult,
} from '@/types/tools';

interface Envelope<T> {
    success?: boolean;
    data: T;
    meta?: ToolMetaInfo;
}

const unwrap = <T>(body: Envelope<T> | null): ToolResponse<T> => {
    if (!body || body.data === undefined || body.data === null) throw new Error('The server sent an empty answer.');
    return { data: body.data, meta: { cached: false, ...(body.meta ?? {}) } };
};

const enc = encodeURIComponent;

// ---- The registry ----------------------------------------------------------

/** The tools the site lists, with their enabled state. Public; no token needed. */
export async function getToolsRegistry(): Promise<LiveRegistry> {
    const body = await fetchApi('/api/tools', { requireAuth: false });
    return (body?.data ?? {}) as LiveRegistry;
}

export async function getToolCapabilities(): Promise<ToolCapabilities> {
    const body = await fetchApi('/api/tools/capabilities', { requireAuth: false });
    return (body?.data?.tools ?? {}) as ToolCapabilities;
}

// ---- Passive tools (anonymous allowed; a signed-in token gets the higher limit) ----

export function searchCves(params: { keyword: string; severity?: CveSeverity | ''; page?: number; pageSize?: number }): Promise<ToolResponse<CveSearchResult>> {
    const qs = new URLSearchParams({ keyword: params.keyword.trim() });
    if (params.severity) qs.set('severity', params.severity);
    if (params.page && params.page > 1) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return fetchApi(`/api/tools/cve?${qs.toString()}`).then(unwrap<CveSearchResult>);
}

export function getCve(id: string): Promise<ToolResponse<CveDetail>> {
    return fetchApi(`/api/tools/cve/${enc(id.trim().toUpperCase())}`).then(unwrap<CveDetail>);
}

export function lookupWhois(domain: string): Promise<ToolResponse<WhoisResult>> {
    return fetchApi(`/api/tools/whois?domain=${enc(domain.trim())}`).then(unwrap<WhoisResult>);
}

export function lookupDns(name: string, types?: string[]): Promise<ToolResponse<DnsResult>> {
    const qs = new URLSearchParams({ name: name.trim() });
    if (types && types.length) qs.set('types', types.join(','));
    return fetchApi(`/api/tools/dns?${qs.toString()}`).then(unwrap<DnsResult>);
}

export function lookupIp(ip: string): Promise<ToolResponse<IpResult>> {
    return fetchApi(`/api/tools/ip?ip=${enc(ip.trim())}`).then(unwrap<IpResult>);
}

// ---- Active tools (signed in, verified e-mail, acknowledged) ---------------
// `ack: true` is the visitor's confirmation that they own the target or have written permission.
// The type is the literal `true` so a caller cannot send these without it.

const post = <T>(path: string, body: Record<string, unknown>) =>
    fetchApi(path, { method: 'POST', body: JSON.stringify({ ...body, ack: true }) }).then(unwrap<T>);

export function scanHeaders(input: { url: string; ack: true }): Promise<ToolResponse<HeadersResult>> {
    return post('/api/tools/headers', { url: input.url.trim() });
}

export function testCors(input: { url: string; origins?: string[]; ack: true }): Promise<ToolResponse<CorsResult>> {
    return post('/api/tools/cors', { url: input.url.trim(), origins: (input.origins ?? []).map((o) => o.trim()).filter(Boolean) });
}

export function findSubdomains(input: { domain: string; ack: true }): Promise<ToolResponse<SubdomainsResult>> {
    return post('/api/tools/subdomains', { domain: input.domain.trim() });
}

export function checkTakeover(input: { domain?: string; subdomains?: string[]; ack: true }): Promise<ToolResponse<TakeoverResult>> {
    return post('/api/tools/takeover', input.subdomains && input.subdomains.length ? { subdomains: input.subdomains } : { domain: (input.domain ?? '').trim() });
}

export function checkSsl(input: { host: string; port?: number; ack: true }): Promise<ToolResponse<SslResult>> {
    return post('/api/tools/ssl', { host: input.host.trim(), ...(input.port && input.port !== 443 ? { port: input.port } : {}) });
}

// ---- Admin -----------------------------------------------------------------

export async function getAdminToolSettings(): Promise<AdminToolSettings> {
    return (await fetchApi('/api/admin/tools/settings')).data;
}

export async function updateAdminToolSettings(change: AdminToolSettingsChange): Promise<AdminToolSettings> {
    return (await fetchApi('/api/admin/tools/settings', { method: 'PATCH', body: JSON.stringify(change) })).data;
}

/** The API sends the per-tool counts as an object; arrays of rows are accepted too */
export async function getAdminToolStats(days = 7): Promise<AdminToolStats> {
    const data = (await fetchApi(`/api/admin/tools/stats?days=${days}`)).data as Partial<AdminToolStats> & { tools?: unknown; blockedReasons?: unknown };
    const tools: AdminToolStats['tools'] = {};
    const rawTools = data.tools;
    if (Array.isArray(rawTools)) {
        for (const row of rawTools as ({ tool?: string; id?: string } & Partial<AdminToolStats['tools'][string]>)[]) {
            const key = row.tool ?? row.id;
            if (key) tools[key] = { ok: row.ok ?? 0, blocked: row.blocked ?? 0, error: row.error ?? 0, limited: row.limited ?? 0, cached: row.cached ?? 0 };
        }
    } else if (rawTools && typeof rawTools === 'object') {
        for (const [key, row] of Object.entries(rawTools as AdminToolStats['tools'])) {
            tools[key] = { ok: row.ok ?? 0, blocked: row.blocked ?? 0, error: row.error ?? 0, limited: row.limited ?? 0, cached: row.cached ?? 0 };
        }
    }
    const blockedReasons: Record<string, number> = {};
    const rawReasons = data.blockedReasons;
    if (Array.isArray(rawReasons)) {
        for (const row of rawReasons as { reason?: string; count?: number }[]) if (row.reason) blockedReasons[row.reason] = row.count ?? 0;
    } else if (rawReasons && typeof rawReasons === 'object') {
        Object.assign(blockedReasons, rawReasons);
    }
    return { days: data.days ?? days, since: data.since ?? '', tools, blockedReasons };
}
