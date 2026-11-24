import type { ApplicationStatus, CohortCard, CohortStatus, CohortType } from '@/types/internship';

const LOCALE = 'en-US';

export const COHORT_STATUS_LABELS: Record<CohortStatus, string> = {
    draft: 'Draft',
    open: 'Open',
    closed: 'Closed',
    'in-progress': 'In progress',
    completed: 'Completed',
};

export const TYPE_LABELS: Record<CohortType, string> = { internship: 'Internship', mentorship: 'Mentorship' };

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
    pending: 'Pending',
    reviewing: 'In review',
    accepted: 'Accepted',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn',
};

/** What each application status means to the applicant */
export const APPLICATION_STATUS_HINTS: Record<ApplicationStatus, string> = {
    pending: 'Sent. A reviewer has not looked at it yet.',
    reviewing: 'A reviewer is looking at your application.',
    accepted: 'You are in. Watch your notifications for what happens next.',
    rejected: 'Not selected this time.',
    withdrawn: 'You withdrew this application.',
};

/**
 * The status to show for a cohort that came with its stored status (my applications carry the
 * stored one): an open cohort whose deadline passed reads Closed, as everywhere else.
 */
export function effectiveCohortStatus(cohort: { status: CohortStatus; applicationDeadline?: string | null }, now: number = Date.now()): CohortStatus {
    if (cohort.status !== 'open' || !cohort.applicationDeadline) return cohort.status;
    const deadline = new Date(cohort.applicationDeadline).getTime();
    return !Number.isNaN(deadline) && deadline <= now ? 'closed' : 'open';
}

export const isCohortStatus = (v: string | null | undefined): v is CohortStatus =>
    v === 'draft' || v === 'open' || v === 'closed' || v === 'in-progress' || v === 'completed';

export const isCohortType = (v: string | null | undefined): v is CohortType => v === 'internship' || v === 'mentorship';

/** UTC while the viewer's zone is unknown (server render and hydration), then their own zone */
function fmt(iso: string | null | undefined, zone: string | null, options: Intl.DateTimeFormatOptions): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    try {
        return new Intl.DateTimeFormat(LOCALE, { timeZone: zone ?? 'UTC', ...options }).format(date);
    } catch {
        return new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...options }).format(date);
    }
}

/** `Dec 5, 2026` */
export const formatDay = (iso: string | null | undefined, zone: string | null = null) =>
    fmt(iso, zone, { month: 'short', day: 'numeric', year: 'numeric' });

/** `Dec 5, 2026, 6:00 PM GMT+1`: the moment a deadline falls, with the zone it is read in */
export const formatMoment = (iso: string | null | undefined, zone: string | null = null) =>
    fmt(iso, zone, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

/** `Dec 5, 6:00 PM`: a timeline entry */
export const formatStamp = (iso: string | null | undefined, zone: string | null = null) =>
    fmt(iso, zone, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const formatRange = (start: string, end: string, zone: string | null = null) =>
    `${formatDay(start, zone)} to ${formatDay(end, zone)}`;

export interface Spots {
    /** Short text for a card, or null when the number is not worth showing */
    label: string | null;
    full: boolean;
    unlimited: boolean;
}

/** Seats of a cohort. `spotsLeft` is null when the capacity is unlimited. */
export function spotsInfo(cohort: Pick<CohortCard, 'capacity' | 'spotsLeft'>): Spots {
    if (!cohort.capacity || cohort.spotsLeft === null || cohort.spotsLeft === undefined) {
        return { label: null, full: false, unlimited: true };
    }
    if (cohort.spotsLeft <= 0) return { label: 'No spots left', full: true, unlimited: false };
    return { label: `${cohort.spotsLeft} of ${cohort.capacity} ${cohort.spotsLeft === 1 ? 'spot' : 'spots'} left`, full: false, unlimited: false };
}

/** Plain text for a description in a card or a meta tag */
export function excerpt(text: string | null | undefined, max = 160): string {
    const clean = (text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** A link from the API is shown only when it is http or https. Anything else is dropped. */
export function safeHref(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}

/** The host of a link for display, without a path */
export function hostOf(url: string): string {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

/** The cohort's state as the apply panel reads it */
export type ApplyState = 'anonymous' | 'can-apply' | 'applied' | 'full' | 'closed' | 'not-started';

export interface ApplyView {
    state: ApplyState;
    /** The one-line reason shown instead of the button */
    reason: string | null;
}

/**
 * What the apply panel shows, from the detail the API sent. `viewer` is null for an anonymous
 * visitor, who is sent to sign in while applications are open.
 */
export function applyView(cohort: Pick<CohortCard, 'applicationsOpen' | 'status' | 'capacity' | 'spotsLeft'> & { viewer: { canApply: boolean; userApplication: unknown } | null }): ApplyView {
    const full = spotsInfo(cohort).full;
    if (cohort.viewer?.userApplication) return { state: 'applied', reason: null };
    if (!cohort.applicationsOpen) {
        return {
            state: 'closed',
            reason: cohort.status === 'completed' ? 'This program is over.'
                : cohort.status === 'in-progress' ? 'This program has started and is no longer taking applications.'
                    : 'Applications for this program are closed.',
        };
    }
    if (full) return { state: 'full', reason: 'Every seat is taken. A seat is freed if an accepted applicant withdraws, so check back later.' };
    if (!cohort.viewer) return { state: 'anonymous', reason: null };
    if (!cohort.viewer.canApply) return { state: 'closed', reason: 'You cannot apply to this program right now.' };
    return { state: 'can-apply', reason: null };
}
