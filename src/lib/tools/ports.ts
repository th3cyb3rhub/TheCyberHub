/** Well-known ports for the reference table and the Nmap builder presets */

export interface PortInfo {
    port: number;
    service: string;
    description: string;
    /** Worth a closer look: clear-text or commonly exposed by mistake */
    note?: string;
}

export const PORTS: PortInfo[] = [
    { port: 20, service: 'FTP data', description: 'File Transfer Protocol, data channel', note: 'Clear text' },
    { port: 21, service: 'FTP', description: 'File Transfer Protocol, control channel', note: 'Clear text; check for anonymous login' },
    { port: 22, service: 'SSH', description: 'Secure Shell' },
    { port: 23, service: 'Telnet', description: 'Remote shell', note: 'Clear text; should be off' },
    { port: 25, service: 'SMTP', description: 'Mail transfer between servers' },
    { port: 53, service: 'DNS', description: 'Domain Name System (UDP and TCP)' },
    { port: 67, service: 'DHCP', description: 'Dynamic Host Configuration Protocol (UDP)' },
    { port: 69, service: 'TFTP', description: 'Trivial FTP (UDP)', note: 'No authentication' },
    { port: 80, service: 'HTTP', description: 'Web, unencrypted' },
    { port: 88, service: 'Kerberos', description: 'Kerberos authentication' },
    { port: 110, service: 'POP3', description: 'Mail retrieval', note: 'Clear text' },
    { port: 111, service: 'RPCbind', description: 'ONC RPC portmapper' },
    { port: 123, service: 'NTP', description: 'Network Time Protocol (UDP)' },
    { port: 135, service: 'MSRPC', description: 'Microsoft RPC endpoint mapper' },
    { port: 139, service: 'NetBIOS', description: 'NetBIOS session service' },
    { port: 143, service: 'IMAP', description: 'Mail access', note: 'Clear text unless STARTTLS' },
    { port: 161, service: 'SNMP', description: 'Network management (UDP)', note: 'Default community strings are common' },
    { port: 389, service: 'LDAP', description: 'Directory access' },
    { port: 443, service: 'HTTPS', description: 'Web over TLS' },
    { port: 445, service: 'SMB', description: 'Windows file sharing' },
    { port: 465, service: 'SMTPS', description: 'Mail submission over TLS' },
    { port: 514, service: 'Syslog', description: 'System logging (UDP)' },
    { port: 587, service: 'Submission', description: 'Mail submission (STARTTLS)' },
    { port: 636, service: 'LDAPS', description: 'LDAP over TLS' },
    { port: 873, service: 'rsync', description: 'File synchronisation' },
    { port: 993, service: 'IMAPS', description: 'IMAP over TLS' },
    { port: 995, service: 'POP3S', description: 'POP3 over TLS' },
    { port: 1433, service: 'MSSQL', description: 'Microsoft SQL Server', note: 'Should not face the internet' },
    { port: 1521, service: 'Oracle', description: 'Oracle database listener', note: 'Should not face the internet' },
    { port: 2049, service: 'NFS', description: 'Network File System' },
    { port: 3000, service: 'Dev server', description: 'Common web development server port' },
    { port: 3306, service: 'MySQL', description: 'MySQL and MariaDB', note: 'Should not face the internet' },
    { port: 3389, service: 'RDP', description: 'Windows Remote Desktop', note: 'Often attacked' },
    { port: 5000, service: 'Dev server', description: 'Common web application port' },
    { port: 5432, service: 'PostgreSQL', description: 'PostgreSQL database', note: 'Should not face the internet' },
    { port: 5900, service: 'VNC', description: 'Remote desktop', note: 'Often weakly protected' },
    { port: 5985, service: 'WinRM', description: 'Windows Remote Management over HTTP' },
    { port: 6379, service: 'Redis', description: 'Redis key-value store', note: 'No authentication by default in old setups' },
    { port: 8000, service: 'HTTP-alt', description: 'Alternate web port' },
    { port: 8080, service: 'HTTP-alt', description: 'Alternate web port, proxies' },
    { port: 8443, service: 'HTTPS-alt', description: 'Alternate web port over TLS' },
    { port: 9200, service: 'Elasticsearch', description: 'Elasticsearch HTTP API', note: 'Should not face the internet' },
    { port: 11211, service: 'Memcached', description: 'Memcached cache', note: 'Should not face the internet' },
    { port: 27017, service: 'MongoDB', description: 'MongoDB database', note: 'Should not face the internet' },
];

export interface PortPreset {
    id: string;
    label: string;
    ports: number[];
}

export const PORT_PRESETS: PortPreset[] = [
    { id: 'top100', label: 'Nmap top 100', ports: [] },
    { id: 'common', label: 'Common services', ports: [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 5900, 6379, 8080, 8443] },
    { id: 'web', label: 'Web', ports: [80, 443, 3000, 5000, 8000, 8080, 8443, 8888] },
    { id: 'database', label: 'Databases', ports: [1433, 1521, 3306, 5432, 6379, 9200, 11211, 27017] },
    { id: 'mail', label: 'Mail', ports: [25, 110, 143, 465, 587, 993, 995] },
    { id: 'all', label: 'All 65535', ports: [] },
];

export function matchesPort(info: PortInfo, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return String(info.port) === q || info.service.toLowerCase().includes(q) || info.description.toLowerCase().includes(q);
}
