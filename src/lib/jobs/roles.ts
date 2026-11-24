/** Who may do what in the jobs module. The API decides; these only hide buttons that would fail. */

/** Roles that post jobs: employers, and administrators and owners for any company */
const POSTERS = ['employer', 'admin', 'owner'];
/** Roles that review jobs and companies */
const REVIEWERS = ['moderator', 'admin', 'owner'];
const ADMINS = ['admin', 'owner'];

export const isJobPoster = (role?: string | null): boolean => !!role && POSTERS.includes(role);
export const isJobReviewer = (role?: string | null): boolean => !!role && REVIEWERS.includes(role);
/** Administrators and owners post for any company name, feature jobs and may purge the server caches */
export const isJobAdmin = (role?: string | null): boolean => !!role && ADMINS.includes(role);
