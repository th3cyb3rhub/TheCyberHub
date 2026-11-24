/** Every type the API can create, as validated by `GET /api/notifications?type=` */
export const NOTIFICATION_TYPES = [
    'reply', 'mention', 'answer-accepted', 'badge', 'event-reminder', 'follow',
    'contribution-approved', 'contribution-rejected', 'weekly-challenge',
    'path-completed', 'system', 'job-match', 'writeup-vote',
    'like', 'reshare', 'comment', 'moderation', 'challenge-solved', 'internship-update',
] as const;

export type NotificationKind = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationData {
    _id: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    read: boolean;
    createdAt: string;
    /** The latest actor. For a group, the person who joined it last. */
    actor?: {
        name: string;
        username: string;
        avatar?: string;
    };
    /** Set on likes, reshares and comments that are rolled up per post; null when the notification stands alone */
    groupKey?: string | null;
    /** How many people are in the group; 1 when it is not grouped */
    actorCount?: number;
    /** Newest first, at most three */
    recentActors?: GroupActor[];
}

export interface GroupActor {
    _id: string;
    username: string;
    avatar?: string | null;
}

export interface NotificationPage {
    success: boolean;
    data: NotificationData[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface UnreadCount {
    count: number;
    byType: Record<string, number>;
}

export interface EmailPreferences {
    replies: boolean;
    mentions: boolean;
    badges: boolean;
    events: boolean;
    follows: boolean;
    contributions: boolean;
    weeklyChallenges: boolean;
    newsletter: boolean;
    jobMatches: boolean;
    internships: boolean;
    securityAlerts: boolean;
}

export interface InAppPreferences {
    replies: boolean;
    mentions: boolean;
    badges: boolean;
    events: boolean;
    follows: boolean;
    likes: boolean;
    comments: boolean;
    reshares: boolean;
    challenges: boolean;
    contributions: boolean;
    weeklyChallenges: boolean;
    jobMatches: boolean;
    internships: boolean;
    securityAlerts: boolean;
}

export interface QuietHours {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
}

export interface PushPreferences {
    enabled: boolean;
}

export interface NotificationPreferences {
    email: EmailPreferences;
    inApp: InAppPreferences;
    quietHours: QuietHours;
    emailDigest: { enabled: boolean; frequency: 'weekly' };
    push: PushPreferences;
}

export type NotificationPreferencesUpdate = {
    email?: Partial<EmailPreferences>;
    inApp?: Partial<InAppPreferences>;
    quietHours?: Partial<QuietHours>;
    emailDigest?: { enabled: boolean };
    push?: Partial<PushPreferences>;
};

export type UnsubscribeScope = 'email' | 'digest';
