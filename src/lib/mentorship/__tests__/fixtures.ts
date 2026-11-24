import type {
    IncomingRequest, Mentor, Mentorship, MentorshipMessage, MentorshipRequest, MentorshipSession, MentorshipViewer, MentorOwn,
} from '@/types/mentorship';

export const viewer = (over: Partial<MentorshipViewer> = {}): MentorshipViewer => ({
    role: 'mentee', canPause: true, canResume: false, canComplete: true, canExtend: true, canSchedule: true, canMessage: true,
    canReport: true, canGiveFinalFeedback: false, hasGivenFinalFeedback: false, ...over,
});

export const makeMentor = (over: Partial<Mentor> = {}): Mentor => ({
    _id: '64b0000000000000000000a1',
    user: { _id: 'mentor-user', username: 'ada', name: 'Ada Lovelace', avatar: null },
    expertiseAreas: ['web-security', 'pentesting', 'osint', 'forensics'],
    bio: 'Ten years of application security work, happy to help with your first bug bounty.',
    availability: { hoursPerWeek: 4, timezone: 'Europe/Berlin', preferredTimes: [{ dayOfWeek: 1, startHour: 18, endHour: 20 }] },
    maxMentees: 3, spotsLeft: 2, hasCapacity: true, isPaused: false, rating: 4.6, totalRatings: 12,
    completedMentorships: 5, totalSessionsCompleted: 30, isVerified: false, isFeatured: false, createdAt: '2026-10-01T10:00:00.000Z',
    ...over,
});

export const makeOwn = (over: Partial<MentorOwn> = {}): MentorOwn => ({
    ...makeMentor(), status: 'pending', reviewNote: null, reviewedAt: null, conductAcceptedAt: '2026-10-01T10:00:00.000Z', currentMenteeCount: 1, ...over,
});

export const makeMentorship = (over: Partial<Mentorship> = {}): Mentorship => ({
    _id: '64b0000000000000000000b1',
    status: 'active',
    mentor: { _id: 'mentor-user', username: 'ada', name: 'Ada Lovelace', avatar: null },
    mentee: { _id: 'me', username: 'grace', name: 'Grace', avatar: null },
    mentorProfile: { _id: '64b0000000000000000000a1', timezone: 'Asia/Kolkata' },
    goals: 'Learn web application testing step by step.',
    skillLevel: 'beginner', expertiseAreas: ['web-security'],
    startDate: '2026-11-01T10:00:00.000Z', expectedEndDate: '2027-02-01T10:00:00.000Z', actualEndDate: null,
    daysRemaining: 60, termMonths: 3, extensions: [], canExtend: true, totalHours: 2, sessionsCompleted: 2,
    lastMessageAt: null, unreadMessages: 0, pausedAt: null, pauseReason: null, endedByRole: null, endReason: null,
    viewer: viewer(),
    ...over,
});

export const makeSession = (over: Partial<MentorshipSession> = {}): MentorshipSession => ({
    _id: '64b0000000000000000000c1', mentorship: '64b0000000000000000000b1', title: 'First call', description: null, agenda: null,
    scheduledAt: '2026-12-07T09:00:00.000Z', timezone: 'Asia/Kolkata', duration: 60, endsAt: '2026-12-07T10:00:00.000Z',
    meetingUrl: 'https://meet.example.org/abc', status: 'scheduled', cancelReason: null, completedAt: null, actualDuration: null, notes: null,
    feedback: { deadline: null, submitted: false, canSubmit: false },
    viewer: { role: 'mentee', canReschedule: true, canCancel: true, canComplete: false, canAddNotes: true, isProposer: true },
    ...over,
});

export const makeMessage = (over: Partial<MentorshipMessage> = {}): MentorshipMessage => ({
    _id: '64b0000000000000000000d1', channel: 'c1', sender: { _id: 'mentor-user', username: 'ada', name: 'Ada Lovelace', avatar: null },
    content: 'Hello there', contentType: 'text', codeLanguage: null, attachment: null, hidden: false, isRead: true, readAt: null,
    createdAt: '2026-12-01T10:00:00.000Z', ...over,
});

export const makeRequest = (over: Partial<MentorshipRequest> = {}): MentorshipRequest => ({
    _id: '64b0000000000000000000e1', status: 'matched', goals: 'I want to learn how to find and report web vulnerabilities in a structured way, starting from the basics.',
    skillLevel: 'beginner', expertiseAreas: ['web-security'], isDirect: false, createdAt: '2026-12-01T10:00:00.000Z', expiresAt: '2026-12-15T10:00:00.000Z', mentorship: null,
    matchedMentors: [{ mentor: makeMentor(), matchScore: 80, response: 'pending', invitedAt: '2026-12-01T10:00:00.000Z', respondedAt: null, declineReason: null, autoDeclined: false }],
    ...over,
});

export const makeIncoming = (over: Partial<IncomingRequest> = {}): IncomingRequest => ({
    _id: '64b0000000000000000000e2', status: 'matched', goals: 'Please help me prepare for my first penetration testing job interview next month.',
    skillLevel: 'intermediate', expertiseAreas: ['pentesting'], isDirect: true, createdAt: '2026-12-01T10:00:00.000Z', expiresAt: '2026-12-15T10:00:00.000Z', mentorship: null,
    mentee: { username: 'grace', avatar: null, anonymous: false },
    invitation: { response: 'pending', matchScore: 70, invitedAt: '2026-12-01T10:00:00.000Z', respondedAt: null },
    ...over,
});
