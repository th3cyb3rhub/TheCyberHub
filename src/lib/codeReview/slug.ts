/** Whether a path segment can address an exercise. Pure, so the server code and the page that asks again in the browser share it. */

/** Slugs that would shadow a fixed API route: they can never be an exercise */
const RESERVED = new Set(['manage', 'stats', 'progress', 'attempts']);
/**
 * What the API accepts when it reads an exercise: 1 to 80 characters of a to z, 0 to 9 and hyphens
 * (a slug as written by the author), or a 24 character hex id. The stricter rule for new slugs
 * belongs to the editor only: exercises saved before it must stay reachable.
 */
const READ_REF = /^[a-z0-9-]{1,80}$/;

/** Whether a path segment can address an exercise: anything else is a real 404 without asking the API */
export function isSnippetRef(value: string): boolean {
    const ref = value.toLowerCase();
    return READ_REF.test(ref) && !RESERVED.has(ref);
}
