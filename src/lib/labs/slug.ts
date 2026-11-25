/** Whether a path segment can address a lab. Pure, so the server code and the page that asks again in the browser share it. */

/** Slugs that would shadow a fixed API route: they can never be a lab */
const RESERVED = new Set(['progress', 'stats', 'categories', 'leaderboard', 'manage']);
/**
 * What the API accepts when it reads a lab (its READ_REF): any 1 to 80 characters of a to z, 0 to 9
 * and hyphens, which covers a slug as written by the author and a 24 character hex id. The stricter
 * rule for new slugs (no leading, trailing or doubled hyphens, at least 3 characters) belongs to the
 * authoring form only: labs saved before it, or by other tools, must stay reachable.
 */
const READ_REF = /^[a-z0-9-]{1,80}$/;

/** Whether a path segment can address a lab: anything else is a real 404 without asking the API */
export function isLabSlug(value: string): boolean {
    const ref = value.toLowerCase();
    return READ_REF.test(ref) && !RESERVED.has(ref);
}
