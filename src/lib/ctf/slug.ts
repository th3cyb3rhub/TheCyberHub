/**
 * Whether a path segment can be a competition slug. Pure, so the server code and the pages that
 * ask again in the browser share it.
 */
/**
 * What the API accepts for a competition slug: 1 to 80 characters of a to z, 0 to 9
 * and hyphens. Anything else can never be a competition: a real 404 without asking the API.
 */
const SLUG = /^[a-z0-9-]{1,80}$/;

export const isCtfSlug = (value: string): boolean => SLUG.test(value.toLowerCase());
