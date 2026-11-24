/** Only admins and owners write competitions, like the API: moderators can read drafts, not change them */
export function isCtfWriter(role?: string | null): boolean {
    return role === 'admin' || role === 'owner';
}

/** Admins, owners and moderators may read drafts, private competitions and early results */
export function isCtfReader(role?: string | null): boolean {
    return role === 'admin' || role === 'owner' || role === 'moderator';
}
