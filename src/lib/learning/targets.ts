import { FALLBACK_TOOLS } from '@/lib/tools/registry';

/** The cheatsheet pages the site serves, by folder name (route `/cheatsheets/<id>`). The API accepts exactly these. */
export const CHEATSHEETS = [
    { id: 'linux-commands', title: 'Linux commands' },
    { id: 'networking', title: 'Networking' },
    { id: 'osint', title: 'OSINT' },
    { id: 'privesc', title: 'Privilege escalation' },
    { id: 'reverse-shells', title: 'Reverse shells' },
    { id: 'sql-injection', title: 'SQL injection' },
    { id: 'web-security', title: 'Web security' },
    { id: 'xss', title: 'XSS' },
] as const;

/** The tools a step can link to (route `/tools/<slug>`) */
export const TOOL_TARGETS = FALLBACK_TOOLS.map((t) => ({ id: t.slug, title: t.name }));
