/** Shapes the tools API answers with (see docs/TOOLS-API.md in the API repository) */

export interface ToolQuota {
    limit: number;
    remaining: number;
    resetSeconds: number;
}

export interface ToolMetaInfo {
    cached: boolean;
    stale?: boolean;
    tookMs?: number;
    quota?: ToolQuota;
}

/** A successful answer: the data and what the API says about how it was produced */
export interface ToolResponse<T> {
    data: T;
    meta: ToolMetaInfo;
}

export interface ToolCapability {
    enabled: boolean;
    reason?: string;
    tier?: 'anon' | 'user';
    auth?: 'optional' | 'verified';
    mode?: 'passive' | 'active';
    requiresAcknowledgement?: boolean;
    limits?: { perMinute?: number; perHour?: number; concurrent?: number; anonymousPerHour?: number; signedInPerHour?: number };
}

export type ToolCapabilities = Record<string, ToolCapability>;

// ---- Passive tools ---------------------------------------------------------

export type CveSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CveScore {
    score: number | null;
    severity: string | null;
    version?: string | null;
    vector?: string | null;
}

export interface CveSummary {
    id: string;
    summary: string;
    cvss: CveScore | null;
    published: string | null;
    knownExploited: boolean;
}

export interface CveSearchResult {
    items: CveSummary[];
    total: number;
    page: number;
    pageSize: number;
    source: string;
}

export interface CveDetail {
    id: string;
    summary: string;
    cvss: CveScore | null;
    published: string | null;
    modified: string | null;
    status: string | null;
    cwe: string[];
    refs: { url: string; source: string | null; tags: string[] }[];
    knownExploited: { name: string | null; addedOn: string | null; dueDate: string | null; requiredAction: string | null } | null;
    source: string;
}

export interface WhoisResult {
    domain: string;
    registrar: string | null;
    status: string[];
    created: string | null;
    expires: string | null;
    updated: string | null;
    nameservers: string[];
    dnssec: boolean | null;
    source: string;
    rdapServer?: string;
}

export type DnsRecordStatus = 'ok' | 'empty' | 'nxdomain' | 'error';

export interface DnsRecord {
    value: string;
    ttl?: number | null;
    [key: string]: unknown;
}

export interface DnsTypeResult {
    status: DnsRecordStatus;
    records: (DnsRecord | string)[];
    error?: string;
}

export interface DnsResult {
    name: string;
    kind: 'domain' | 'ip';
    exists: boolean | null;
    resolvers?: string;
    results: Record<string, DnsTypeResult>;
}

export interface IpResult {
    ip: string;
    version: number | string;
    public: boolean;
    classification: string;
    reverseDns: string[];
    network: {
        name: string | null;
        handle: string | null;
        type: string | null;
        country: string | null;
        startAddress: string | null;
        endAddress: string | null;
        cidr: string[];
        status: string[];
    } | null;
    source: string | null;
}

// ---- Active tools ----------------------------------------------------------

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info' | 'na';

export interface HeaderCheck {
    id: string;
    header: string | null;
    status: CheckStatus;
    message: string;
    value?: string;
}

export interface HeaderCookie {
    name: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: string | null;
    session: boolean;
    prefix: string | null;
}

export interface HeadersResult {
    requestedUrl: string;
    finalUrl: string;
    status: number;
    statusText?: string;
    redirects: { url?: string; status?: number; location?: string; from?: string; to?: string }[];
    headers: { name: string; value: string }[];
    checks: HeaderCheck[];
    summary: Record<CheckStatus, number>;
    cookies: HeaderCookie[];
    scannedAt: string;
}

export type CorsSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface CorsFinding {
    severity: CorsSeverity;
    code: string;
    message: string;
    origin?: string;
}

export interface CorsProbe {
    status: number;
    headers: Record<string, string>;
}

export interface CorsResult {
    url: string;
    results: { origin: string; simple: CorsProbe; preflight: CorsProbe; findings: CorsFinding[]; severity: CorsSeverity }[];
    findings: CorsFinding[];
    severity: CorsSeverity;
    scannedAt: string;
}

export interface SubdomainsResult {
    domain: string;
    subdomains: string[];
    count: number;
    total: number;
    truncated: boolean;
    source: string;
    note: string;
}

export type TakeoverStatus = 'takeover_likely' | 'potential' | 'no_issue_found' | 'not_applicable' | 'unresolved' | 'blocked' | 'error';

export interface TakeoverHost {
    host: string;
    status: TakeoverStatus;
    cname: string[];
    provider: string | null;
    evidence: string | null;
}

export interface TakeoverResult {
    scope: string;
    mode: 'domain' | 'list';
    checked: number;
    totalFound: number;
    truncated: boolean;
    counts: Record<string, number>;
    results: TakeoverHost[];
    note: string;
    scannedAt: string;
}

export type SslSeverity = 'info' | 'low' | 'medium' | 'high';

export interface SslCertificate {
    subject: Record<string, string>;
    issuer: Record<string, string>;
    validFrom: string | null;
    validTo: string | null;
    daysRemaining: number | null;
    serialNumber: string | null;
    fingerprint256: string | null;
    key: { type: string | null; curve?: string; bits: number | null };
    sans?: { type: string; value: string }[];
    selfSigned?: boolean;
}

export interface SslResult {
    host: string;
    port: number;
    protocol: string | null;
    cipher: { name: string; version: string | null } | null;
    alpn: string | false | null;
    verified: boolean;
    verificationError: string | null;
    certificate: SslCertificate;
    chain: SslCertificate[];
    hostnameMatch: boolean;
    hostnameError: string | null;
    findings: { severity: SslSeverity; code: string; message: string }[];
    sslLabsUrl: string | null;
    note: string;
    scannedAt: string;
}

// ---- Admin -----------------------------------------------------------------

export interface AdminToolState {
    id: string;
    mode: 'passive' | 'active';
    enabled: boolean;
    reason: string | null;
    dailyCap: number | null;
    defaultDailyCap: number | null;
    usedToday: number;
}

export interface AdminToolSettings {
    masterEnabled: boolean;
    activeToolsAllowed: boolean;
    countersStore?: unknown;
    tools: AdminToolState[];
    blockedTargets: string[];
}

export interface AdminToolSettingsChange {
    tools?: Record<string, { enabled?: boolean; dailyCap?: number | null }>;
    blockedTargets?: string[];
}

export interface AdminToolStats {
    days: number;
    since: string;
    tools: Record<string, { ok: number; blocked: number; error: number; limited: number; cached: number }>;
    blockedReasons: Record<string, number>;
}
