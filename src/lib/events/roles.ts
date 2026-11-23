/** Administrators and owners publish and manage every event. Moderators review submissions. */
export const isAdminRole = (role?: string | null) => role === 'admin' || role === 'owner';
