/** Admins and owners write; moderators read the answer key and the manage list. The API decides, this only picks what to show. */
export const isCrWriter = (role?: string | null): boolean => role === 'admin' || role === 'owner';
export const isCrReader = (role?: string | null): boolean => role === 'admin' || role === 'owner' || role === 'moderator';
