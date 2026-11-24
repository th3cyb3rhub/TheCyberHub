/**
 * The server's clock, as far as this browser can tell. A competition starts and ends by the
 * server's time, so a browser that runs minutes fast or slow would show "live" while the API still
 * says "not started" (or the other way round). The only server instants the API puts in a response
 * body are the board's `updatedAt`, the results' `generatedAt` and the `timestamp` of every error
 * body (a refusal such as "not started" or a rate limit is stamped when it is built, so it is
 * exact). The HTTP `Date` header is not readable across origins (the API does not list it in its
 * exposed headers), so it is not used.
 *
 * Each stamp gives one sample: server instant minus the browser instant it arrived. The board is
 * cached on the API for a few seconds, so a stamp can be a little old, which only ever makes the
 * sample too small. Two rules follow: the offset is the largest of the last few samples, and a
 * difference below `DEADBAND_MS` is taken as no difference at all (a stale stamp must not move a
 * correct clock).
 */
const SAMPLES = 5;
/** More than the cache age of the board plus a slow round trip */
export const DEADBAND_MS = 20_000;

let samples: number[] = [];
let offset = 0;
let version = 0;
const listeners = new Set<() => void>();

function recompute() {
    const best = samples.length > 0 ? Math.max(...samples) : 0;
    const next = Math.abs(best) < DEADBAND_MS ? 0 : best;
    if (next !== offset) {
        offset = next;
        version += 1;
        listeners.forEach((fn) => fn());
    }
}

/** Take a server instant that arrived now. Anything that is not a date is ignored. */
export function noteServerTime(stamp: string | number | Date | null | undefined, receivedAt: number = Date.now()): void {
    if (stamp === null || stamp === undefined || stamp === '') return;
    const server = new Date(stamp).getTime();
    if (!Number.isFinite(server)) return;
    samples = [...samples.slice(-(SAMPLES - 1)), server - receivedAt];
    recompute();
}

/** Server time minus browser time, in milliseconds; 0 until a stamp showed a real difference */
export const serverOffsetMs = (): number => offset;

/** The server's current time as far as it is known */
export const serverNow = (): Date => new Date(Date.now() + offset);

/** Changes whenever the offset changes, for `useSyncExternalStore` */
export const serverClockVersion = (): number => version;

export function subscribeServerClock(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
}

/** Forget every sample (a sign-out, a test) */
export function resetServerClock(): void {
    samples = [];
    recompute();
}
