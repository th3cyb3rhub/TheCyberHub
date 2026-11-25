import { isJobRef } from './server';

/**
 * The address a job page should be moved to (HTTP 308), or null when it should render where it is:
 * the API's canonical reference is not a well formed one, or it is the reference that was asked for
 * (never a loop). The reference is encoded for the address.
 */
export function jobMoveTarget(requested: string, canonical: unknown): string | null {
    if (typeof canonical !== 'string' || !isJobRef(canonical)) return null;
    if (canonical === requested) return null;
    return `/jobs/${encodeURIComponent(canonical)}`;
}

/** The reference the page uses for its own requests: the canonical one when it is well formed, else the one asked for */
export function jobReference(requested: string, canonical: unknown): string {
    return typeof canonical === 'string' && isJobRef(canonical) ? canonical : requested;
}
