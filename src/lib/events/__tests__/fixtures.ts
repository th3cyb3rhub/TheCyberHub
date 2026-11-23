import type { EventDetail, EventViewer } from '@/types/event';

/**
 * The viewer block as the API builds it. An open event: canRegister true. Full with a waiting list:
 * canRegister false and canJoinWaitlist true. Full without one: both false. Override per test.
 */
export const viewer = (over: Partial<EventViewer> = {}): EventViewer => ({
    registered: false, waitlisted: false, attended: false, position: null, reminder: null,
    canRegister: true, canJoinWaitlist: false, canFeedback: false, hasFeedback: false, joinOpensAt: null, canManage: false,
    ...over,
});

/** An upcoming online event in Berlin, Saturday 5 December 2026, 18:00 to 20:00 local (17:00 to 19:00 UTC) */
export const makeEvent = (over: Partial<EventDetail> = {}): EventDetail => ({
    _id: '64b000000000000000000001',
    slug: 'winter-ctf-night',
    title: 'Winter CTF Night',
    shortDescription: 'A beginner friendly CTF.',
    image: null,
    bannerImage: null,
    startDate: '2026-12-05T17:00:00.000Z',
    endDate: '2026-12-05T19:00:00.000Z',
    endsAt: '2026-12-05T19:00:00.000Z',
    timezone: 'Europe/Berlin',
    locationType: 'online',
    location: 'Online',
    category: 'ctf',
    tags: ['beginner'],
    eventType: 'community',
    organizer: 'Ada',
    status: 'upcoming',
    isFeatured: false,
    maxParticipants: 60,
    registeredCount: 42,
    waitlistCount: 0,
    spotsLeft: 18,
    isFull: false,
    waitlistEnabled: true,
    rsvpDeadline: null,
    hasRecording: false,
    hasSlides: false,
    averageRating: null,
    ratingCount: 0,
    description: 'Bring a laptop.',
    venue: null,
    registrationLink: null,
    speakers: [],
    recordingLink: null,
    slidesLink: null,
    summaryNotes: null,
    defaultDurationMinutes: null,
    joinLink: null,
    stats: { registered: 42, waitlisted: 0, attended: 0, spotsLeft: 18, averageRating: null, ratingCount: 0 },
    viewer: viewer(),
    ...over,
});
