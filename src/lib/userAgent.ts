export interface DeviceInfo {
    /** "Chrome on macOS", or "Unknown device" */
    label: string;
    mobile: boolean;
}

/** Browser first: Edge, Opera and Chrome on iOS also say "Chrome" or "Safari" in their user agent. */
const BROWSERS: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\//, 'Edge'],
    [/OPR\/|Opera/, 'Opera'],
    [/SamsungBrowser\//, 'Samsung Internet'],
    [/Firefox\/|FxiOS\//, 'Firefox'],
    [/Chrome\/|CriOS\//, 'Chrome'],
    [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
    [/Windows/, 'Windows'],
    [/iPhone|iPad|iPod/, 'iOS'],
    [/Android/, 'Android'],
    [/Mac OS X|Macintosh/, 'macOS'],
    [/CrOS/, 'ChromeOS'],
    [/Linux|X11/, 'Linux'],
];

/** A short, readable name for the device behind a user agent string. The string is only parsed, never shown as is. */
export function describeDevice(userAgent: string | null | undefined): DeviceInfo {
    const ua = (userAgent ?? '').slice(0, 512);
    const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
    const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
    const mobile = /Mobile|iPhone|iPad|iPod|Android/.test(ua);
    if (browser && system) return { label: `${browser} on ${system}`, mobile };
    if (browser) return { label: browser, mobile };
    if (system) return { label: `Unknown browser on ${system}`, mobile };
    return { label: 'Unknown device', mobile };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
];

/** "5 minutes ago", "yesterday", "just now" */
export function timeAgo(iso: string, now = Date.now()): string {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return 'unknown';
    const seconds = Math.round((now - then) / 1000);
    if (seconds < 60) return 'just now';
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    for (const [unit, size] of UNITS) {
        if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
    }
    return 'just now';
}
