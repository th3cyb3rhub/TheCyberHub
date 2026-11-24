/**
 * Mentorship API shapes. The API is the authority (docs/MENTORSHIP.md in the API repository);
 * these types only describe what the screens read.
 */

export type ExpertiseArea =
    | 'web-security' | 'network-security' | 'malware-analysis' | 'forensics'
    | 'osint' | 'cryptography' | 'reverse-engineering' | 'cloud-security'
    | 'mobile-security' | 'career-guidance' | 'ctf-training' | 'pentesting';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type MentorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type RequestStatus = 'pending' | 'matched' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export type MentorshipStatus = 'active' | 'paused' | 'completed' | 'terminated';
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show';
export type MentorshipRole = 'mentor' | 'mentee' | 'staff';

/** A person. Never carries an email or contact data. */
export interface Person {
    _id: string;
    username: string;
    name?: string;
    avatar?: string | null;
}

/** A mentee as an invited mentor sees them before accepting */
export interface InviteePerson {
    _id?: string;
    username: string | null;
    name?: string;
    avatar: string | null;
    anonymous?: boolean;
}

export interface AvailabilitySlot { dayOfWeek: number; startHour: number; endHour: number }

export interface MentorAvailability {
    hoursPerWeek: number;
    timezone: string;
    preferredTimes: AvailabilitySlot[];
}

export interface Mentor {
    _id: string;
    user: Person;
    expertiseAreas: ExpertiseArea[];
    bio: string;
    availability: MentorAvailability;
    maxMentees: number;
    spotsLeft: number;
    hasCapacity: boolean;
    isPaused: boolean;
    rating: number;
    totalRatings: number;
    completedMentorships: number;
    totalSessionsCompleted: number;
    isVerified: boolean;
    isFeatured: boolean;
    createdAt: string;
    /** Present for staff, and on your own profile */
    status?: MentorStatus;
}

export interface MentorOwn extends Mentor {
    status: MentorStatus;
    reviewNote: string | null;
    reviewedAt: string | null;
    conductAcceptedAt: string | null;
    currentMenteeCount: number;
}

/** A row of the admin application queue: the owner view plus the applicant's points */
export interface MentorApplication extends Omit<MentorOwn, 'user'> {
    user: Person & { points?: number };
}

export type EligibilityReason = 'ALREADY_APPLIED' | 'EMAIL_NOT_VERIFIED' | 'NOT_ENOUGH_POINTS';

export interface MentorEligibility {
    eligible: boolean;
    reason: EligibilityReason | null;
    points: number;
    requiredPoints: number;
    invited: boolean;
    hasProfile: boolean;
    profileStatus: MentorStatus | null;
}

export interface MentorReview {
    rating: number;
    comment: string;
    createdAt: string;
    menteeFirstName: string | null;
}

export interface Invitation {
    mentor: Mentor | string;
    matchScore: number;
    response: 'pending' | 'accepted' | 'declined';
    invitedAt: string | null;
    respondedAt: string | null;
    declineReason: string | null;
    autoDeclined: boolean;
}

/** The mentee's view of a request */
export interface MentorshipRequest {
    _id: string;
    status: RequestStatus;
    goals: string;
    skillLevel: SkillLevel;
    expertiseAreas: ExpertiseArea[];
    isDirect: boolean;
    createdAt: string;
    expiresAt: string;
    mentorship: string | null;
    matchedMentors: Invitation[];
}

/** An invited mentor's view of a request */
export interface IncomingRequest {
    _id: string;
    status: RequestStatus;
    goals: string;
    skillLevel: SkillLevel;
    expertiseAreas: ExpertiseArea[];
    isDirect: boolean;
    createdAt: string;
    expiresAt: string;
    mentorship: string | null;
    mentee: InviteePerson;
    invitation: {
        response: 'pending' | 'accepted' | 'declined';
        matchScore: number;
        invitedAt: string | null;
        respondedAt: string | null;
    } | null;
}

export interface MentorshipViewer {
    role: MentorshipRole;
    canPause: boolean;
    canResume: boolean;
    canComplete: boolean;
    canExtend: boolean;
    canSchedule: boolean;
    canMessage: boolean;
    canReport: boolean;
    canGiveFinalFeedback: boolean;
    hasGivenFinalFeedback: boolean;
}

export interface FinalFeedbackView {
    rating: number;
    comment: string | null;
    createdAt: string;
}

export interface Mentorship {
    _id: string;
    status: MentorshipStatus;
    mentor: Person;
    mentee: Person;
    mentorProfile?: { _id: string; expertiseAreas?: ExpertiseArea[]; rating?: number; totalRatings?: number; timezone?: string } | string | null;
    channel?: string;
    goals: string | null;
    skillLevel: SkillLevel | null;
    expertiseAreas: ExpertiseArea[];
    startDate: string;
    expectedEndDate: string;
    actualEndDate: string | null;
    daysRemaining: number;
    termMonths: number;
    extensions: { extendedAt: string; extendedBy: number; newEndDate: string }[];
    canExtend: boolean;
    totalHours: number;
    sessionsCompleted: number;
    lastMessageAt: string | null;
    unreadMessages: number;
    pausedAt: string | null;
    pauseReason: string | null;
    endedByRole: 'mentor' | 'mentee' | 'staff' | 'system' | null;
    endReason: string | null;
    finalFeedback?: { mine: FinalFeedbackView | null; theirs: FinalFeedbackView | null };
    viewer: MentorshipViewer;
}

export type SessionWarning = 'outside_mentor_availability';

export interface MentorshipSession {
    _id: string;
    mentorship: string;
    title: string;
    description: string | null;
    agenda: string | null;
    scheduledAt: string;
    timezone: string;
    duration: number;
    endsAt: string;
    meetingUrl: string | null;
    status: SessionStatus;
    proposedBy?: string;
    cancelReason: string | null;
    completedAt: string | null;
    actualDuration: number | null;
    notes: string | null;
    warnings?: SessionWarning[];
    feedback: { deadline: string | null; submitted: boolean; canSubmit: boolean };
    viewer: { role: MentorshipRole; canReschedule: boolean; canCancel: boolean; canComplete: boolean; canAddNotes: boolean; isProposer: boolean };
}

export interface MessageAttachment { filename: string; url: string; size: number; mimeType: string }

export interface MentorshipMessage {
    _id: string;
    channel: string;
    sender: Person;
    /** Null when a moderator hid the message */
    content: string | null;
    contentType: 'text' | 'code' | 'file';
    codeLanguage: string | null;
    attachment: MessageAttachment | null;
    hidden: boolean;
    isRead: boolean;
    readAt: string | null;
    createdAt: string;
    /** Set by this client on a message that is still being sent or failed */
    pending?: 'sending' | 'failed';
}

export interface FeedbackRow {
    _id: string;
    type: 'session' | 'final';
    rating: number;
    comment: string | null;
    mine: boolean;
    createdAt: string;
}

export interface MentorshipSummary {
    pendingInvites: number;
    unreadMessages: number;
    pendingFeedback: number;
    activeMentorships: number;
    openRequest: { _id: string; status: RequestStatus; expiresAt: string } | null;
    nextSession: { _id: string; mentorship: string; title: string; scheduledAt: string; timezone: string; duration: number; meetingUrl: string | null } | null;
}

export interface Pagination { page: number; limit: number; total: number; pages: number }
export interface Page<T> { data: T[]; pagination: Pagination }
export interface MessagePage {
    data: MentorshipMessage[];
    pagination: { limit: number; hasMore: boolean; nextBefore: string | null };
}

export interface MentorListFilters {
    expertise?: ExpertiseArea[];
    minRating?: number;
    hasCapacity?: boolean;
    sort?: 'relevance' | 'rating' | 'experience';
    search?: string;
    page?: number;
    limit?: number;
}

export type ReportTarget = 'mentorship' | 'message' | 'mentor';

export interface ReportContext {
    flag: { _id: string; contentType: string; contentId: string; reason: string; details: string | null; status: string };
    messages: (MentorshipMessage & { reported?: boolean })[];
}

export interface ModerationMentorItem {
    contentType: string;
    contentId: string;
    reportCount: number;
    reasons: { reason: string; count: number }[];
    firstReportedAt: string;
    lastReportedAt: string;
    flagIds: string[];
    status: string;
    content: { exists: boolean; excerpt?: string; title?: string | null; author?: { username: string } | null };
}
