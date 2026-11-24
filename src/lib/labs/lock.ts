/**
 * When a locked lab opens again, as an instant on the BROWSER clock.
 *
 * The server's clock and the browser's can differ by minutes, so an absolute `lockedUntil` is never
 * compared with `Date.now()`. A wait is taken as a number of seconds counted from the moment the
 * answer arrived, and only that moment is read from the browser clock:
 *
 * 1. `lockedForSeconds`: the wait the API states (a number; `null` means not locked). The only
 *    source when the API sends it.
 * 2. Otherwise `lockedUntil` against the server's own clock (the response `Date` header), which
 *    gives a wait that is again a number of seconds. Both are server instants, so any skew cancels.
 * 3. Last resort, with neither: `lockedUntil` against the browser clock, as it always was.
 */
export interface LockSource {
    lockedForSeconds?: number | null;
    lockedUntil?: string | null;
    /** Set once the answer has been read: an instant on the browser clock, `null` when not locked */
    lockEndsAt?: number | null;
}

const MAX_WAIT_SECONDS = 24 * 3600;

/** A wait in whole seconds, or null when it is not a usable positive number */
export function waitSeconds(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    return Math.min(Math.ceil(value), MAX_WAIT_SECONDS);
}

/**
 * @param receivedAt the browser clock when the answer arrived
 * @param serverNow  the server clock at that moment (the response `Date` header), when it is known
 */
export function lockEndsAt(source: LockSource, receivedAt: number, serverNow: number | null = null): number | null {
    if (typeof source.lockEndsAt === 'number') return source.lockEndsAt > receivedAt ? source.lockEndsAt : null;
    if (source.lockEndsAt === null) return null;

    if (source.lockedForSeconds !== undefined) {
        // The API says how long: a number, or null for "not locked". `lockedUntil` never overrides it.
        const seconds = waitSeconds(source.lockedForSeconds);
        return seconds === null ? null : receivedAt + seconds * 1000;
    }

    if (!source.lockedUntil) return null;
    const until = new Date(source.lockedUntil).getTime();
    if (!Number.isFinite(until)) return null;
    const left = until - (serverNow !== null && Number.isFinite(serverNow) ? serverNow : receivedAt);
    const seconds = waitSeconds(left / 1000);
    return seconds === null ? null : receivedAt + seconds * 1000;
}

/** The server clock from a response `Date` header, or null (browsers hide it across origins unless the API exposes it) */
export function serverClock(header: string | null | undefined): number | null {
    if (!header) return null;
    const t = new Date(header).getTime();
    return Number.isFinite(t) ? t : null;
}

/** The same object with `lockEndsAt` filled in, so the countdown has one browser clock value to use */
export function withLock<T extends LockSource>(source: T, receivedAt: number, serverNow: number | null = null): T & { lockEndsAt: number | null } {
    return { ...source, lockEndsAt: lockEndsAt({ ...source, lockEndsAt: undefined }, receivedAt, serverNow) };
}
