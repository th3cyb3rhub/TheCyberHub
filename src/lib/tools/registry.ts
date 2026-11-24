/**
 * The tools registry: the one list the tools index, the global search, the home section, the
 * navbar count and the sitemap read.
 *
 * `GET /api/tools` is the source of truth (names, categories, enabled state, sign-in rules). This
 * module holds the fallback copy used while that request is loading or when the API is down, and
 * the front-end-only details the API does not know (icons, search keywords, related reading).
 * `mergeRegistry` lays the live answer over the fallback. A tool the API lists that has no page
 * here is ignored, because there would be nothing to open.
 *
 * Keep it free of JSX so the sitemap and tests can import it; icons are looked up by name in
 * `components/tools/ToolIcon.tsx`.
 */

export type ToolCategoryId = 'recon' | 'web' | 'crypto' | 'payloads' | 'network' | 'reference';
export type ToolKind = 'server' | 'offline' | 'reference';
export type ToolAuth = 'optional' | 'verified';
export type ToolStatus = 'stable' | 'disabled';

export type ToolIconName =
    | 'bug' | 'search' | 'wifi' | 'globe' | 'shield' | 'shield-check' | 'lock' | 'key' | 'terminal'
    | 'hash' | 'file-code' | 'database' | 'file-text' | 'radio' | 'link' | 'network' | 'diff' | 'markdown';

export interface ToolCategory {
    id: ToolCategoryId;
    name: string;
}

export interface ToolMeta {
    /** Server id (`cve`, `ssl`) for tools the API runs; the page slug for the rest */
    id: string;
    /** The route under /tools */
    slug: string;
    name: string;
    description: string;
    category: ToolCategoryId;
    kind: ToolKind;
    needsServer: boolean;
    /** Sign-in rule of a server tool: `verified` means a signed-in, e-mail verified account */
    auth?: ToolAuth;
    /** The visitor must confirm they may test the target before each run */
    requiresAcknowledgement: boolean;
    popular: boolean;
    /** False when an admin or the environment switched the tool off */
    enabled: boolean;
    status: ToolStatus;
    icon: ToolIconName;
    keywords: string[];
    /** Cheatsheet slugs under /cheatsheets and the challenge category that follow on from the tool */
    related?: { cheatsheets?: string[]; challengeCategory?: string };
}

export const CATEGORIES: readonly ToolCategory[] = [
    { id: 'recon', name: 'Recon & OSINT' },
    { id: 'web', name: 'Web testing' },
    { id: 'crypto', name: 'Crypto & encoding' },
    { id: 'payloads', name: 'Payloads' },
    { id: 'network', name: 'Network' },
    { id: 'reference', name: 'Reference & utilities' },
];

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

type Seed = Omit<ToolMeta, 'id' | 'needsServer' | 'requiresAcknowledgement' | 'popular' | 'enabled' | 'status'> & Partial<Pick<ToolMeta, 'id' | 'popular' | 'requiresAcknowledgement'>>;

const make = (seed: Seed): ToolMeta => ({
    id: seed.slug,
    needsServer: seed.kind === 'server',
    requiresAcknowledgement: false,
    popular: false,
    enabled: true,
    status: 'stable',
    ...seed,
});

/** Used until `GET /api/tools` answers, and when it cannot. Mirrors the API's own list. */
export const FALLBACK_TOOLS: readonly ToolMeta[] = [
    // Tools that use our server
    make({ id: 'cve', slug: 'cve-search', name: 'CVE Search', category: 'reference', kind: 'server', auth: 'optional', popular: true, icon: 'bug',
        description: 'Look up a CVE or search the National Vulnerability Database.',
        keywords: ['cve', 'vulnerability', 'nvd', 'cvss', 'advisory'], related: { cheatsheets: ['web-security'], challengeCategory: 'web' } }),
    make({ id: 'whois', slug: 'whois-lookup', name: 'WHOIS Lookup', category: 'recon', kind: 'server', auth: 'optional', icon: 'search',
        description: 'Registration data for a domain, from the registry RDAP service.',
        keywords: ['whois', 'rdap', 'domain', 'registrar', 'expiry'], related: { cheatsheets: ['osint'] } }),
    make({ id: 'dns', slug: 'dns-lookup', name: 'DNS Lookup', category: 'recon', kind: 'server', auth: 'optional', popular: true, icon: 'wifi',
        description: 'A, AAAA, MX, NS, TXT, CNAME, SOA and CAA records, with an honest status per record type.',
        keywords: ['dns', 'records', 'mx', 'txt', 'spf', 'nameserver'], related: { cheatsheets: ['networking', 'osint'] } }),
    make({ id: 'ip', slug: 'ip-lookup', name: 'IP Lookup', category: 'recon', kind: 'server', auth: 'optional', icon: 'globe',
        description: 'Network ownership and reverse DNS of a public IP address.',
        keywords: ['ip', 'asn', 'rdap', 'reverse dns', 'network owner'], related: { cheatsheets: ['networking', 'osint'] } }),
    make({ id: 'headers', slug: 'header-analyzer', name: 'HTTP Header Analyzer', category: 'web', kind: 'server', auth: 'verified', requiresAcknowledgement: true, popular: true, icon: 'shield',
        description: 'Fetch a site and review its security headers, cookies and redirect chain.',
        keywords: ['headers', 'http', 'csp', 'hsts', 'cookies', 'security headers'], related: { cheatsheets: ['web-security'], challengeCategory: 'web' } }),
    make({ id: 'cors', slug: 'cors-tester', name: 'CORS Tester', category: 'web', kind: 'server', auth: 'verified', requiresAcknowledgement: true, icon: 'globe',
        description: 'Send test origins to a URL and report how it answers cross-origin requests.',
        keywords: ['cors', 'cross-origin', 'origin', 'preflight'], related: { cheatsheets: ['web-security'], challengeCategory: 'web' } }),
    make({ id: 'subdomains', slug: 'subfinder', name: 'Subdomain Finder', category: 'recon', kind: 'server', auth: 'verified', requiresAcknowledgement: true, icon: 'network',
        description: 'Subdomains seen in public certificate transparency logs (the target is not contacted).',
        keywords: ['subdomain', 'enumeration', 'certificate transparency', 'crt.sh', 'recon'], related: { cheatsheets: ['osint'] } }),
    make({ id: 'takeover', slug: 'sub-takeover', name: 'Subdomain Takeover Check', category: 'recon', kind: 'server', auth: 'verified', requiresAcknowledgement: true, icon: 'link',
        description: 'Look for dangling CNAMEs and unclaimed service pages on up to 20 subdomains.',
        keywords: ['subdomain', 'takeover', 'cname', 'dangling dns'], related: { cheatsheets: ['osint', 'web-security'], challengeCategory: 'web' } }),
    make({ id: 'ssl', slug: 'ssl-checker', name: 'SSL/TLS Checker', category: 'network', kind: 'server', auth: 'verified', requiresAcknowledgement: true, popular: true, icon: 'lock',
        description: 'Certificate chain, expiry, protocol and cipher of a TLS endpoint, from our own handshake.',
        keywords: ['ssl', 'tls', 'certificate', 'https', 'expiry', 'cipher'], related: { cheatsheets: ['networking'] } }),

    // Tools that run in the browser
    make({ slug: 'google-dork', name: 'Google Dork Builder', category: 'recon', kind: 'offline', icon: 'search',
        description: 'Build search operators for open-source intelligence.',
        keywords: ['google', 'dork', 'osint', 'search operators'], related: { cheatsheets: ['osint'] } }),
    make({ slug: 'jwt-analyzer', name: 'JWT Analyzer', category: 'crypto', kind: 'offline', popular: true, icon: 'key',
        description: 'Decode a JWT, inspect its claims and test it for weak secrets in your browser.',
        keywords: ['jwt', 'token', 'hmac', 'claims', 'auth'], related: { cheatsheets: ['web-security'], challengeCategory: 'web' } }),
    make({ slug: 'encoder-decoder', name: 'Encoder / Decoder', category: 'crypto', kind: 'offline', popular: true, icon: 'terminal',
        description: 'Base64, URL, HTML, hex and binary encodings.',
        keywords: ['base64', 'url encode', 'hex', 'binary', 'html entities'], related: { challengeCategory: 'crypto' } }),
    make({ slug: 'hash-analyzer', name: 'Hash Analyzer', category: 'crypto', kind: 'offline', icon: 'hash',
        description: 'Guess the type of a hash from its length and format.',
        keywords: ['hash', 'md5', 'sha', 'ntlm', 'identify'], related: { challengeCategory: 'crypto' } }),
    make({ slug: 'password-generator', name: 'Password Generator', category: 'crypto', kind: 'offline', icon: 'key',
        description: 'Random passwords generated in your browser.',
        keywords: ['password', 'random', 'generator', 'passphrase'] }),
    make({ slug: 'text-diff', name: 'Text Diff', category: 'reference', kind: 'offline', icon: 'diff',
        description: 'Compare two texts line by line.',
        keywords: ['diff', 'compare', 'text'] }),
    make({ slug: 'markdown-editor', name: 'Markdown Editor', category: 'reference', kind: 'offline', icon: 'markdown',
        description: 'Write and preview Markdown.',
        keywords: ['markdown', 'editor', 'preview', 'notes', 'report'] }),
    make({ slug: 'reverse-shell', name: 'Reverse Shell Generator', category: 'payloads', kind: 'offline', icon: 'terminal',
        description: 'Reverse shell one-liners for labs and CTFs.',
        keywords: ['reverse shell', 'payload', 'netcat', 'bash', 'pentest'], related: { cheatsheets: ['reverse-shells', 'privesc'] } }),
    make({ slug: 'xss-payloads', name: 'XSS Payloads', category: 'payloads', kind: 'offline', icon: 'file-code',
        description: 'Cross-site scripting payloads by context.',
        keywords: ['xss', 'cross-site scripting', 'payload', 'injection'], related: { cheatsheets: ['xss'], challengeCategory: 'web' } }),
    make({ slug: 'sql-injection', name: 'SQL Injection Payloads', category: 'payloads', kind: 'offline', icon: 'database',
        description: 'SQL injection payloads by database and technique.',
        keywords: ['sql', 'sqli', 'injection', 'database', 'payload'], related: { cheatsheets: ['sql-injection'], challengeCategory: 'web' } }),
    make({ slug: 'ssrf-tester', name: 'SSRF Payload Builder', category: 'web', kind: 'offline', icon: 'shield-check',
        description: 'SSRF payloads; bring your own callback URL to watch for hits.',
        keywords: ['ssrf', 'server-side request forgery', 'payload', 'metadata', 'callback'], related: { cheatsheets: ['web-security'], challengeCategory: 'web' } }),
    make({ slug: 'port-scanner', name: 'Port Reference & Nmap Builder', category: 'network', kind: 'reference', icon: 'radio',
        description: 'Common ports and an Nmap command builder. This site does not scan hosts.',
        keywords: ['port', 'nmap', 'scan', 'network', 'command builder'], related: { cheatsheets: ['networking'] } }),
    make({ slug: 'exploit-db', name: 'Exploit Database Links', category: 'reference', kind: 'reference', icon: 'bug',
        description: 'Search links and resources for public exploit databases.',
        keywords: ['exploit', 'exploit-db', 'searchsploit', 'poc'], related: { cheatsheets: ['privesc'] } }),
];

// ---------------------------------------------------------------------------
// Live data from GET /api/tools
// ---------------------------------------------------------------------------

export interface LiveTool {
    id?: string;
    slug?: string;
    name?: string;
    description?: string;
    category?: string;
    kind?: string;
    needsServer?: boolean;
    popular?: boolean;
    enabled?: boolean;
    status?: string;
    auth?: string;
    requiresAcknowledgement?: boolean;
}

export interface LiveRegistry {
    categories?: { id: string; name: string }[];
    tools?: LiveTool[];
}

export interface Registry {
    tools: ToolMeta[];
    categories: ToolCategory[];
    /** True when the tools came from the API rather than the fallback list */
    live: boolean;
}

const asKind = (value: unknown, fallback: ToolKind): ToolKind => (value === 'server' || value === 'offline' || value === 'reference' ? value : fallback);
const asAuth = (value: unknown, fallback?: ToolAuth): ToolAuth | undefined => (value === 'optional' || value === 'verified' ? value : fallback);

/** The fallback list with the API's answer laid over it, matched by slug */
export function mergeRegistry(live?: LiveRegistry | null): Registry {
    const liveTools = live && Array.isArray(live.tools) ? live.tools : null;
    const categories: ToolCategory[] = live && Array.isArray(live.categories) && live.categories.length
        ? live.categories.filter((c): c is ToolCategory => !!c && CATEGORY_IDS.has(c.id) && typeof c.name === 'string')
        : [...CATEGORIES];
    const knownCategories = new Set<string>(categories.map((c) => c.id));

    const tools = FALLBACK_TOOLS.map((base): ToolMeta => {
        const match = liveTools?.find((t) => t.slug === base.slug);
        if (!match) return { ...base };
        const kind = asKind(match.kind, base.kind);
        const enabled = match.enabled !== false && match.status !== 'disabled';
        return {
            ...base,
            id: typeof match.id === 'string' && match.id ? match.id : base.id,
            name: match.name || base.name,
            description: match.description || base.description,
            category: match.category && knownCategories.has(match.category) ? (match.category as ToolCategoryId) : base.category,
            kind,
            needsServer: typeof match.needsServer === 'boolean' ? match.needsServer : kind === 'server',
            auth: kind === 'server' ? asAuth(match.auth, base.auth) : undefined,
            requiresAcknowledgement: typeof match.requiresAcknowledgement === 'boolean' ? match.requiresAcknowledgement : base.requiresAcknowledgement,
            popular: typeof match.popular === 'boolean' ? match.popular : base.popular,
            enabled,
            status: enabled ? 'stable' : 'disabled',
        };
    });
    return { tools, categories, live: !!liveTools };
}

export const FALLBACK_REGISTRY: Registry = mergeRegistry(null);

export const toolHref = (slug: string) => `/tools/${slug}`;

export function findTool(tools: readonly ToolMeta[], slug: string): ToolMeta | undefined {
    return tools.find((t) => t.slug === slug);
}

export function popularTools(tools: readonly ToolMeta[], limit = 12): ToolMeta[] {
    const popular = tools.filter((t) => t.popular);
    const rest = tools.filter((t) => !t.popular);
    return [...popular, ...rest].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Where a tool runs, as a badge
// ---------------------------------------------------------------------------

export type TrustKind = 'browser' | 'server' | 'server-login' | 'reference';

export function trustKind(tool: Pick<ToolMeta, 'kind' | 'auth'>): TrustKind {
    if (tool.kind === 'offline') return 'browser';
    if (tool.kind === 'reference') return 'reference';
    return tool.auth === 'verified' ? 'server-login' : 'server';
}

export const TRUST_LABELS: Record<TrustKind, { label: string; hint: string }> = {
    browser: { label: 'Runs in your browser', hint: 'Nothing you type is sent to a server.' },
    reference: { label: 'Reference', hint: 'Static help and links. Nothing is run for you.' },
    server: { label: 'Uses our server', hint: 'Your input is sent to our API, which looks it up in public data sources. No sign-in needed.' },
    'server-login': { label: 'Needs sign-in', hint: 'Runs from our server against a target you are allowed to test. Needs a signed-in account with a verified e-mail address.' },
};

// ---------------------------------------------------------------------------
// Search and filters (shared by the index and the global search)
// ---------------------------------------------------------------------------

export type ToolFilter = 'all' | 'popular' | ToolCategoryId;

export interface ToolFilters {
    q: string;
    cat: ToolFilter;
}

export const isToolFilter = (value: string | null | undefined): value is ToolFilter =>
    value === 'all' || value === 'popular' || (!!value && CATEGORY_IDS.has(value));

/** Filters from the URL query; anything unknown falls back to "all" */
export function parseToolFilters(params: { get(name: string): string | null }): ToolFilters {
    const cat = params.get('cat');
    return { q: (params.get('q') ?? '').slice(0, 80), cat: isToolFilter(cat) ? cat : 'all' };
}

/** The query string for the filters, leaving out defaults. Empty when nothing is set. */
export function toolFilterQuery(filters: ToolFilters): string {
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.cat !== 'all') params.set('cat', filters.cat);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

const haystack = (tool: ToolMeta, categories: readonly ToolCategory[]) =>
    [tool.name, tool.description, tool.slug, ...tool.keywords, categories.find((c) => c.id === tool.category)?.name ?? ''].join(' ').toLowerCase();

/** Every word of the query must appear somewhere in the tool's name, description, keywords or category */
export function matchesQuery(tool: ToolMeta, query: string, categories: readonly ToolCategory[] = CATEGORIES): boolean {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const text = haystack(tool, categories);
    return words.every((w) => text.includes(w));
}

export function filterTools(tools: readonly ToolMeta[], filters: ToolFilters, categories: readonly ToolCategory[] = CATEGORIES): ToolMeta[] {
    return tools.filter((tool) => {
        if (filters.cat === 'popular' && !tool.popular) return false;
        if (filters.cat !== 'all' && filters.cat !== 'popular' && tool.category !== filters.cat) return false;
        return matchesQuery(tool, filters.q, categories);
    });
}

/** How many tools each filter would show, for the chips (the search text is not applied) */
export function countByFilter(tools: readonly ToolMeta[]): Record<string, number> {
    const counts: Record<string, number> = { all: tools.length, popular: tools.filter((t) => t.popular).length };
    for (const tool of tools) counts[tool.category] = (counts[tool.category] ?? 0) + 1;
    return counts;
}

// ---------------------------------------------------------------------------
// What to read or try next
// ---------------------------------------------------------------------------

export interface RelatedLink {
    label: string;
    href: string;
    kind: 'cheatsheet' | 'challenges' | 'path';
}

const CHEATSHEET_TITLES: Record<string, string> = {
    'linux-commands': 'Linux commands',
    networking: 'Networking',
    osint: 'OSINT',
    privesc: 'Privilege escalation',
    'reverse-shells': 'Reverse shells',
    'sql-injection': 'SQL injection',
    'web-security': 'Web security',
    xss: 'Cross-site scripting',
};

export const CHALLENGE_CATEGORY_LABELS: Record<string, string> = { web: 'web', crypto: 'crypto' };

export function relatedLinks(tool: Pick<ToolMeta, 'related'>): RelatedLink[] {
    const related = tool.related;
    if (!related) return [];
    const links: RelatedLink[] = [];
    for (const slug of related.cheatsheets ?? []) {
        if (CHEATSHEET_TITLES[slug]) links.push({ label: `${CHEATSHEET_TITLES[slug]} cheatsheet`, href: `/cheatsheets/${slug}`, kind: 'cheatsheet' });
    }
    if (related.challengeCategory) {
        links.push({ label: `Practise with ${CHALLENGE_CATEGORY_LABELS[related.challengeCategory] ?? related.challengeCategory} challenges`, href: `/challenges?category=${encodeURIComponent(related.challengeCategory)}`, kind: 'challenges' });
    }
    links.push({ label: 'Follow a learning path', href: '/learning-paths', kind: 'path' });
    return links;
}
