import type { PortPreset } from './ports';

/**
 * Builds an Nmap command line to copy. Nothing is run: this site never scans a host. The target and
 * port list are validated so the copied command cannot carry shell syntax.
 */

export type ScanType = 'connect' | 'syn' | 'udp';
export type Timing = 'T2' | 'T3' | 'T4';

export interface NmapOptions {
    target: string;
    preset: PortPreset;
    /** Used when the preset is "custom" (empty preset ports) and this is non-empty */
    customPorts?: string;
    scanType: ScanType;
    serviceVersion: boolean;
    defaultScripts: boolean;
    skipPing: boolean;
    timing: Timing;
    saveOutput: boolean;
}

export const DEFAULT_OPTIONS: Omit<NmapOptions, 'preset'> = {
    target: '',
    scanType: 'connect',
    serviceVersion: true,
    defaultScripts: false,
    skipPing: false,
    timing: 'T3',
    saveOutput: false,
};

// Host names, IPv4, IPv6 and CIDR ranges only: no spaces, quotes, ;, |, &, $, backticks or globs
const TARGET = /^[A-Za-z0-9][A-Za-z0-9.:_-]{0,252}(\/\d{1,3})?$/;

export function validateTarget(raw: string): { ok: true; value: string } | { ok: false; error: string } {
    const value = raw.trim();
    if (!value) return { ok: false, error: 'Enter the host you are allowed to scan.' };
    if (!TARGET.test(value)) return { ok: false, error: 'Use a host name, an IP address or a CIDR range such as 192.168.1.0/24. No spaces or shell characters.' };
    return { ok: true, value };
}

/** "22,80,8000-8100" validated; returns the cleaned list or an error */
export function validatePortList(raw: string): { ok: true; value: string } | { ok: false; error: string } {
    const text = raw.replace(/\s+/g, '');
    if (!text) return { ok: false, error: 'Enter ports such as 22,80,443 or 8000-8100.' };
    const parts = text.split(',');
    if (parts.length > 100) return { ok: false, error: 'Enter at most 100 ports or ranges.' };
    for (const part of parts) {
        const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
        if (!m) return { ok: false, error: `"${part.slice(0, 20)}" is not a port or a range.` };
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        if (a < 1 || a > 65535 || b < 1 || b > 65535 || b < a) return { ok: false, error: 'Ports go from 1 to 65535, and a range must run upwards.' };
    }
    return { ok: true, value: text };
}

export function buildNmapCommand(options: NmapOptions): string {
    const args: string[] = ['nmap'];
    args.push(options.scanType === 'syn' ? '-sS' : options.scanType === 'udp' ? '-sU' : '-sT');
    if (options.skipPing) args.push('-Pn');
    if (options.serviceVersion) args.push('-sV');
    if (options.defaultScripts) args.push('-sC');
    args.push(`-${options.timing}`);

    const { preset } = options;
    if (preset.id === 'all') args.push('-p-');
    else if (preset.id === 'top100') args.push('--top-ports', '100');
    else if (preset.id === 'custom') {
        const custom = validatePortList(options.customPorts ?? '');
        args.push('-p', custom.ok ? custom.value : '<ports>');
    } else args.push('-p', preset.ports.join(','));

    if (options.saveOutput) args.push('-oA', 'scan-results');
    const target = validateTarget(options.target);
    args.push(target.ok ? target.value : '<target>');
    return args.join(' ');
}
