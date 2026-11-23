export const EVENT_CATEGORIES = ['ctf', 'webinar', 'workshop', 'meetup', 'conference', 'hackathon'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_FORMATS = ['online', 'in-person', 'hybrid'] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];

export type EventType = 'official' | 'community';

/** upcoming, live and ended follow the clock; the others are decisions */
export type EventStatus = 'pending' | 'upcoming' | 'live' | 'ended' | 'cancelled' | 'rejected';

export const REMINDER_OFFSETS = [60, 1440] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

/** What the event means for the signed-in caller (absent when signed out) */
export interface EventViewer {
    registered: boolean;
    waitlisted: boolean;
    attended: boolean;
    position: number | null;
    reminder: { offsetMinutes: ReminderOffset; remindAt: string; sent: boolean } | null;
    canRegister: boolean;
    canJoinWaitlist: boolean;
    canFeedback: boolean;
    hasFeedback: boolean;
    joinOpensAt: string | null;
    canManage: boolean;
}

export interface EventSummary {
    _id: string;
    id?: string;
    slug: string;
    title: string;
    shortDescription: string | null;
    image: string | null;
    bannerImage: string | null;
    /** UTC instants */
    startDate: string;
    endDate: string | null;
    endsAt: string;
    /** IANA zone of the organizer */
    timezone: string;
    isAllDay?: boolean;
    locationType: EventFormat;
    location: string;
    category: EventCategory;
    tags: string[];
    eventType: EventType;
    organizer: string;
    organizerLogo?: string | null;
    status: EventStatus;
    isFeatured: boolean;
    maxParticipants: number | null;
    registeredCount: number;
    waitlistCount: number;
    spotsLeft: number | null;
    isFull: boolean;
    waitlistEnabled: boolean;
    rsvpDeadline: string | null;
    hasRecording: boolean;
    hasSlides: boolean;
    averageRating: number | null;
    ratingCount: number;
    createdAt?: string;
    viewer?: EventViewer;
    /** Only for the creator and reviewers */
    rejectionReason?: string | null;
    cancelReason?: string | null;
}

export interface Speaker {
    name: string;
    title?: string;
    bio?: string;
    avatar?: string;
    linkedin?: string;
    twitter?: string;
    github?: string;
    website?: string;
}

export interface EventDetail extends EventSummary {
    description: string;
    venue: string | null;
    registrationLink: string | null;
    speakers: Speaker[];
    recordingLink: string | null;
    slidesLink: string | null;
    summaryNotes: string | null;
    defaultDurationMinutes: number | null;
    rsvpEnabled?: boolean;
    joinLink: string | null;
    stats: {
        registered: number;
        waitlisted: number;
        attended: number;
        spotsLeft: number | null;
        averageRating: number | null;
        ratingCount: number;
    };
    /** Creator and admins only */
    eventLink?: string | null;
    streamLink?: string | null;
}

export interface Pagination {
    page: number;
    limit: number;
    total?: number;
    pages?: number;
    hasMore: boolean;
}

export interface EventPage {
    data: EventSummary[];
    pagination: Pagination;
}

export type EventScope = 'upcoming' | 'past' | 'all';

export interface EventListFilters {
    scope?: EventScope;
    category?: EventCategory | '';
    format?: EventFormat | '';
    eventType?: EventType | '';
    featured?: boolean;
    q?: string;
    from?: string;
    to?: string;
    status?: EventStatus | '';
    sort?: 'startDate' | '-startDate' | 'createdAt' | '-createdAt';
    page?: number;
    limit?: number;
}

export type RegistrationResult = { status: 'registered' | 'waitlisted'; position?: number | null; message?: string };

export interface Attendee {
    user: { _id: string; username: string; name?: string; avatar?: string | null } | null;
    status: 'registered' | 'waitlisted' | 'attended';
    registeredAt: string;
    attendedAt: string | null;
    waitlistSeq: number | null;
}

export interface AttendanceResult {
    marked: string[];
    alreadyMarked: string[];
    notRegistered: string[];
}

export interface EventFeedbackItem {
    rating: number;
    comment: string;
    submittedAt: string;
    author: string;
}

export interface EventFeedbackPage {
    averageRating: number;
    totalReviews: number;
    feedback: EventFeedbackItem[];
    pagination: { page: number; limit: number; hasMore: boolean };
}
