/** The signed-in account as the API's `/auth/me` returns it */
export interface AuthUser {
    id: string;
    name: string;
    username: string;
    email: string;
    avatar: string | null;
    role: string;
    provider?: 'local' | 'google' | 'github';
    isVerified?: boolean;
    organization?: {
        name?: string;
        domain?: string;
        website?: string;
        logo?: string;
        description?: string;
    };
    stats?: {
        eventsAttended: number;
        challengesSolved: number;
        points: number;
    };
    bookmarks?: {
        roadmaps: string[];
        cheatsheets: string[];
        tools: string[];
    };
    progress?: {
        roadmaps: {
            roadmapId: string;
            completedSteps: string[];
            percent: number;
        }[];
    };
    createdAt?: string;
    twoFactorAuth?: {
        enabled: boolean;
    };
    bio?: string | null;
    location?: string | null;
    skills?: string[];
    socialLinks?: {
        website?: string | null;
        github?: string | null;
        twitter?: string | null;
        linkedin?: string | null;
    };
    interests?: string[];
    experienceLevel?: string | null;
    goal?: string | null;
    onboarding?: {
        completedAt: string | null;
        skippedAt: string | null;
    };
}

/** One signed-in device of the account, as `GET /auth/sessions` lists it */
export interface AccountSession {
    /** The session id (use it to end this session) */
    id: string;
    /** True for the session this request was made with */
    current: boolean;
    userAgent: string | null;
    ipAddress: string | null;
    /** The last sign-in or refresh, an ISO instant */
    lastUsedAt: string;
    /** When the session began, an ISO instant */
    createdAt: string;
}
