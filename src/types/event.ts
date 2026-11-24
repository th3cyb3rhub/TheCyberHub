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
    /** The series this event is an occurrence of */
    seriesId?: string | null;
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

// ---------------------------------------------------------------------------
// Calendar, archive, subscribe feed, series, organizer exports
// ---------------------------------------------------------------------------

/** What the calendar endpoint answers for each event: the slim shape, no counts and no viewer block */
export interface CalendarItem {
    id: string;
    slug: string;
    title: string;
    category: EventCategory;
    /** UTC instants */
    startDate: string;
    endDate: string;
    /** IANA zone of the organizer */
    timezone: string;
    format: EventFormat;
    /** `pending` appears for the people who may manage a series: an occurrence waiting for review */
    status: 'upcoming' | 'live' | 'ended' | 'cancelled' | 'pending';
    isAllDay: boolean;
    seriesId?: string;
}

export interface CalendarMeta {
    from: string;
    to: string;
    count: number;
    /** The item limit was reached, so the range holds more than is shown */
    truncated: boolean;
}

export interface CalendarResult { items: CalendarItem[]; meta: CalendarMeta }

export interface CalendarQuery {
    /** ISO date or date-time with Z or an offset */
    from: string;
    to: string;
    category?: EventCategory | '';
    limit?: number;
}

export interface ArchiveItem {
    id: string;
    slug: string;
    title: string;
    shortDescription: string | null;
    image: string | null;
    category: EventCategory;
    startDate: string;
    endDate: string;
    timezone: string;
    format: EventFormat;
    status: EventStatus;
    seriesId: string | null;
    hasRecording: boolean;
    hasSlides: boolean;
    attendedCount: number;
    averageRating: number | null;
    ratingCount: number;
}

export interface ArchiveFilters {
    category?: EventCategory | '';
    /** A date (the whole UTC day) */
    from?: string;
    to?: string;
    q?: string;
    limit?: number;
}

export interface ArchivePage {
    data: ArchiveItem[];
    pagination: { page: number; limit: number; hasMore: boolean };
}

/** The status of the member's private feed. The token itself is never part of it. */
export interface CalendarTokenStatus {
    active: boolean;
    createdAt: string | null;
    rotatedAt: string | null;
    lastUsedAt: string | null;
}

/** The answer to creating or rotating the feed token: the only time the URL exists */
export interface CalendarTokenCreated {
    url: string;
    webcalUrl: string;
    createdAt: string;
    rotated: boolean;
}

export const SERIES_RULES = ['weekly', 'biweekly', 'monthly-by-weekday'] as const;
export type SeriesRule = (typeof SERIES_RULES)[number];
export type SeriesStatus = 'active' | 'paused' | 'ended';

export interface SeriesRecurrence {
    rule: SeriesRule;
    interval: number;
    /** 0 is Sunday */
    weekday: number;
    /** 1 to 4, or -1 for the last one; null unless the rule is monthly */
    weekOfMonth: number | null;
    startsOn: string;
    startTime: string;
    timezone: string;
    durationMinutes: number;
    until: string | null;
    count: number | null;
}

export interface Series {
    id: string;
    title: string;
    description: string;
    shortDescription: string | null;
    image: string | null;
    bannerImage: string | null;
    category: EventCategory;
    tags: string[];
    /** Sent as `locationType` when editing */
    format: EventFormat;
    location: string;
    venue: string | null;
    registrationLink: string | null;
    organizer: string;
    organizerLogo: string | null;
    maxParticipants: number | null;
    rsvpEnabled: boolean;
    waitlistEnabled: boolean;
    status: SeriesStatus;
    recurrence: SeriesRecurrence;
    nextOccurrences: CalendarItem[];
    createdAt: string;
    // The creator, administrators and owners also get these
    eventLink?: string | null;
    streamLink?: string | null;
    createdBy?: string;
    generateAheadDays?: number;
    generatedThrough?: string | null;
    lastGeneratedAt?: string | null;
    endedAt?: string | null;
    counts?: { generated: number; overridden: number; pending: number };
}

export type SeriesCreated = Series & { generated: number };
export type SeriesEnded = Series & { cancelled: number; removed: number };
export type SeriesPatchResult =
    | { scope: 'this'; eventId: string; changed: string[]; series: Series }
    | { scope: 'future'; updated: number; created: number; cancelled: number; removed: number; series: Series };

export interface AttendanceUndoResult {
    undone: string[];
    notAttended: string[];
    notRegistered: string[];
    pointsReversed: number;
}

export interface AttendeesExport {
    blob: Blob;
    filename: string;
    /** The export stopped at the row limit */
    truncated: boolean;
    rows: number;
}
