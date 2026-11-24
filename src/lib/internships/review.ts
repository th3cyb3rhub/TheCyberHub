import type { ApplicationStatus, CohortCard, HistoryEntry } from '@/types/internship';

/** The moves staff can make. Mirrors the API; `accepted` and `rejected` are final. */
export const STAFF_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
    pending: ['reviewing', 'accepted', 'rejected'],
    reviewing: ['accepted', 'rejected'],
    accepted: [],
    rejected: [],
    withdrawn: [],
};

/** The applicant can still change their mind in these states */
export const WITHDRAWABLE: ApplicationStatus[] = ['pending', 'reviewing', 'accepted'];

export const canWithdraw = (status: ApplicationStatus) => WITHDRAWABLE.includes(status);

export const isFinal = (status: ApplicationStatus) => (STAFF_TRANSITIONS[status] ?? []).length === 0;

export interface ReviewAction {
    to: ApplicationStatus;
    label: string;
    enabled: boolean;
    /** Why the button is off, shown next to it */
    reason?: string;
    tone: 'primary' | 'danger' | 'neutral';
}

const ACTION_LABELS: Partial<Record<ApplicationStatus, { label: string; tone: ReviewAction['tone'] }>> = {
    reviewing: { label: 'Start review', tone: 'neutral' },
    accepted: { label: 'Accept', tone: 'primary' },
    rejected: { label: 'Reject', tone: 'danger' },
};

/** Whether the cohort has no seat left to give (an unlimited cohort always has one) */
export function cohortIsFull(cohort: Pick<CohortCard, 'capacity' | 'acceptedCount'> | null | undefined): boolean {
    return !!cohort && cohort.capacity > 0 && (cohort.acceptedCount ?? 0) >= cohort.capacity;
}

export const SELF_REVIEW_REASON = 'This is your own application. Another reviewer has to decide it.';
export const FULL_REASON = 'Every seat is taken, so nobody else can be accepted. Raise the capacity first, or reject.';

/**
 * The buttons a reviewer sees for an application: only the moves the status machine allows. A
 * move is shown but off when the reviewer owns the application or an acceptance has no seat.
 */
export function reviewActions(input: { status: ApplicationStatus; own: boolean; cohortFull: boolean }): ReviewAction[] {
    return (STAFF_TRANSITIONS[input.status] ?? []).map((to) => {
        const meta = ACTION_LABELS[to] ?? { label: to, tone: 'neutral' as const };
        if (input.own) return { to, ...meta, enabled: false, reason: SELF_REVIEW_REASON };
        if (to === 'accepted' && input.cohortFull) return { to, ...meta, enabled: false, reason: FULL_REASON };
        return { to, ...meta, enabled: true };
    });
}

/** What the confirmation says before a status changes */
export function confirmCopy(to: ApplicationStatus): { title: string; body: string; button: string } {
    switch (to) {
        case 'reviewing': return { title: 'Start reviewing this application?', body: 'The applicant is told that their application is being reviewed.', button: 'Start review' };
        case 'accepted': return { title: 'Accept this application?', body: 'This takes a seat and cannot be undone. The applicant is told by notification and email.', button: 'Accept' };
        case 'rejected': return { title: 'Reject this application?', body: 'This cannot be undone. The applicant is told by notification and email, with your note if you add one.', button: 'Reject' };
        default: return { title: 'Change the status?', body: 'The applicant is told about the change.', button: 'Confirm' };
    }
}

// ---------------------------------------------------------------------------
// The applicant's view of progress
// ---------------------------------------------------------------------------

export interface ProgressStep {
    key: 'pending' | 'reviewing' | 'decision';
    label: string;
    state: 'done' | 'current' | 'upcoming';
}

/**
 * Three steps for the progress bar: sent, in review, decision. A withdrawn application has no bar
 * (it is shown as withdrawn); a rejected one shows the decision as reached.
 */
export function progressSteps(status: ApplicationStatus): ProgressStep[] {
    const reached = status === 'pending' ? 0 : status === 'reviewing' ? 1 : 2;
    const decision = status === 'accepted' ? 'Accepted' : status === 'rejected' ? 'Not selected' : 'Decision';
    const labels = ['Sent', 'In review', decision] as const;
    const keys = ['pending', 'reviewing', 'decision'] as const;
    return keys.map((key, i) => ({
        key,
        label: labels[i],
        state: i < reached ? 'done' : i === reached ? (status === 'accepted' || status === 'rejected' ? 'done' : 'current') : 'upcoming',
    }));
}

export interface TimelineItem {
    status: ApplicationStatus;
    at: string;
    /** A reviewer's note, or the applicant's own reason when the entry is the withdrawal */
    note?: string;
    noteBy?: 'reviewer' | 'you';
    current: boolean;
}

/** The status history, oldest first as the API sends it, with the last entry marked as current */
export function timelineItems(history: HistoryEntry[] | null | undefined, status?: ApplicationStatus): TimelineItem[] {
    const list = history ?? [];
    return list.map((entry, i) => ({
        status: entry.status,
        at: entry.at,
        note: entry.note,
        noteBy: entry.note ? (entry.status === 'withdrawn' ? 'you' : 'reviewer') : undefined,
        current: i === list.length - 1 && (!status || status === entry.status),
    }));
}
