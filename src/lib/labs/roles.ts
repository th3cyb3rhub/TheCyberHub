/** Moderators are not lab staff: only admins and owners author labs, like the API */
export function isLabStaff(role?: string | null): boolean {
    return role === 'admin' || role === 'owner';
}
