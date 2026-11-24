import type { ExpertiseArea, MentorStatus, MentorshipStatus, Person, RequestStatus, SessionStatus, SkillLevel } from '@/types/mentorship';

export const EXPERTISE_AREAS: readonly ExpertiseArea[] = [
    'web-security', 'network-security', 'malware-analysis', 'forensics',
    'osint', 'cryptography', 'reverse-engineering', 'cloud-security',
    'mobile-security', 'career-guidance', 'ctf-training', 'pentesting',
];

export const EXPERTISE_LABELS: Record<ExpertiseArea, string> = {
    'web-security': 'Web security',
    'network-security': 'Network security',
    'malware-analysis': 'Malware analysis',
    forensics: 'Forensics',
    osint: 'OSINT',
    cryptography: 'Cryptography',
    'reverse-engineering': 'Reverse engineering',
    'cloud-security': 'Cloud security',
    'mobile-security': 'Mobile security',
    'career-guidance': 'Career guidance',
    'ctf-training': 'CTF training',
    pentesting: 'Pentesting',
};

export const expertiseLabel = (area: string) => EXPERTISE_LABELS[area as ExpertiseArea] ?? area;

export const SKILL_LEVELS: readonly SkillLevel[] = ['beginner', 'intermediate', 'advanced'];
export const SKILL_LABELS: Record<SkillLevel, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

export const MENTOR_STATUS_LABELS: Record<MentorStatus, string> = {
    pending: 'Pending review', approved: 'Approved', rejected: 'Not approved', suspended: 'Suspended',
};
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
    pending: 'Looking for a mentor', matched: 'Waiting for an answer', accepted: 'Accepted',
    declined: 'Declined', expired: 'Expired', cancelled: 'Cancelled',
};
export const MENTORSHIP_STATUS_LABELS: Record<MentorshipStatus, string> = {
    active: 'Active', paused: 'Paused', completed: 'Completed', terminated: 'Ended by staff',
};
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
    scheduled: 'Scheduled', completed: 'Held', cancelled: 'Cancelled', 'no-show': 'No show',
};

/** The name to show for a person. The API sends `name` but never promises it, so fall back to the username. */
export function displayName(person: Pick<Person, 'name' | 'username'> | { name?: string; username?: string | null } | null | undefined): string {
    if (!person) return 'Member';
    return person.name?.trim() || person.username || 'Member';
}

export function initials(person: Parameters<typeof displayName>[0]): string {
    const name = displayName(person);
    const parts = name.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
    return letters.toUpperCase();
}

/** "3 spots left", "Full" */
export function spotsLabel(mentor: { spotsLeft: number; hasCapacity: boolean }): string {
    if (!mentor.hasCapacity || mentor.spotsLeft <= 0) return 'Full';
    return `${mentor.spotsLeft} ${mentor.spotsLeft === 1 ? 'spot' : 'spots'} open`;
}

export function ratingLabel(mentor: { rating: number; totalRatings: number }): string {
    return mentor.totalRatings > 0 ? `${mentor.rating.toFixed(1)} (${mentor.totalRatings})` : 'New';
}

/** Why the "request" button is off for this mentor, from what the page knows. Null when it can be used. */
export function requestBlockReason(mentor: { isPaused: boolean; hasCapacity: boolean; status?: MentorStatus; user: { _id: string } }, viewerId: string | null, hasOpenRequest: boolean): string | null {
    if (viewerId && mentor.user._id === viewerId) return 'This is your own profile.';
    if (mentor.status && mentor.status !== 'approved') return 'This profile is not listed yet.';
    if (mentor.isPaused) return 'This mentor is not taking new mentees right now.';
    if (!mentor.hasCapacity) return 'This mentor has no free spot right now.';
    if (hasOpenRequest) return 'You already have an open request. Cancel it first to ask someone else.';
    return null;
}

/** A link from the API is shown only when it is https */
export function safeMeetingUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "in 3 days", "today", "expired" */
export function daysLeftLabel(iso: string, now: Date): string {
    const days = Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS);
    if (days <= 0) return 'expired';
    if (days === 1) return '1 day left';
    return `${days} days left`;
}

export function formatDate(iso: string): string {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}
