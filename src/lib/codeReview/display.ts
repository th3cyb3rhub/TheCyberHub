/** 7 as "7", 7.5 as "7.5", 9.333 as "9.3": scores can be fractional (a wrong type earns 70%) */
export function formatScore(value: number): string {
    if (!Number.isFinite(value)) return '0';
    return String(Math.round(value * 10) / 10);
}

/** "1 point", "25 points" */
export const pointsText = (n: number): string => `${n} ${n === 1 ? 'point' : 'points'}`;

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The first `max` characters of a text, cut at a word, for a page description */
export function excerpt(text: string, max = 160): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    const cut = flat.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The public page of a weakness, only for an id that looks exactly like `CWE-89`: nothing the API sends becomes an address */
export function cweHref(cwe: string | null | undefined): string | null {
    const m = /^CWE-(\d{1,5})$/.exec(cwe ?? '');
    return m ? `https://cwe.mitre.org/data/definitions/${Number(m[1])}.html` : null;
}

/**
 * What a hint costs now, from the points a pass can still pay (`pointsAvailable`): never more than
 * what is left. Nothing is left once the exercise is passed, after the solution was opened, and for staff.
 */
export function hintPrice(available: number, cost: number): number {
    return Math.max(0, Math.min(cost, available));
}

/** The next hint to open: the first one that is still closed */
export function nextClosedHint<T extends { order: number; unlocked: boolean }>(hints: T[]): T | undefined {
    return [...hints].sort((a, b) => a.order - b.order).find((h) => !h.unlocked);
}
