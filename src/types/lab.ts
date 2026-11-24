/**
 * Shapes of the labs API (`/api/labs`). A lab is addressed by its slug. The API never returns a
 * flag, a hash or a solution: the browser sends a flag and the server decides.
 */

export const LAB_CATEGORIES = [
    'web-security', 'network-security', 'malware-analysis', 'forensics',
    'osint', 'cryptography', 'reverse-engineering', 'cloud-security',
    'mobile-security', 'iot-security', 'general',
] as const;
export type LabCategory = (typeof LAB_CATEGORIES)[number];

export const LAB_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type LabDifficulty = (typeof LAB_DIFFICULTIES)[number];

/** The state of a lab for the member who looks at it */
export const LAB_VIEWER_STATUSES = ['not-started', 'in-progress', 'completed'] as const;
export type LabViewerStatus = (typeof LAB_VIEWER_STATUSES)[number];

export const LAB_SORTS = ['newest', 'difficulty', 'points', 'popular'] as const;
export type LabSort = (typeof LAB_SORTS)[number];

/** What the author sets; only `published` labs are public */
export const LAB_STATUSES = ['draft', 'published', 'archived'] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];

export interface Pagination {
    page: number;
    limit: number;
    /** Counted on page 1 only: null on later pages */
    total: number | null;
    totalPages: number | null;
    hasMore: boolean;
}

export interface Page<T> {
    success: boolean;
    count: number;
    data: T[];
    pagination: Pagination;
}

/** A card of the list: the same for everybody, `myStatus` added when signed in */
export interface LabCard {
    _id: string;
    slug: string;
    title: string;
    summary: string;
    category: LabCategory;
    difficulty: LabDifficulty;
    difficultyRank: number;
    /** What a clean completion pays (the lab's own value or the table) */
    points: number;
    tags: string[];
    estimatedMinutes: number | null;
    hintCount: number;
    fileCount: number;
    labUrl: string | null;
    completionCount: number;
    createdAt: string;
    myStatus?: LabViewerStatus;
}

export interface LabFile {
    name: string;
    url: string;
    sizeBytes: number | null;
    sha256: string | null;
}

export interface LabHint {
    index: number;
    /** Points taken off the award when this hint is opened */
    penalty: number;
    unlocked: boolean;
    /** Only for hints the member opened (staff see all) */
    text?: string;
}

export interface LabViewer {
    myStatus: LabViewerStatus;
    /** How many hints were opened */
    hintsUsed: number;
    attempts: number;
    startedAt: string | null;
    completedAt: string | null;
    pointsAwarded: number;
    /** What completing now would pay; after completion it equals `pointsAwarded` */
    pointsAvailable: number;
    lockedUntil: string | null;
}

export interface LabAdminBlock {
    status: LabStatus;
    flagCount: number;
    /** The lab's own points value: 0 means "use the table" */
    pointsOverride: number;
    startCount: number;
}

export interface LabDetail extends LabCard {
    description: string;
    /** Markdown: render sanitised, never as raw HTML */
    instructions: string;
    files: LabFile[];
    hints: LabHint[];
    updatedAt: string;
    /** null when signed out */
    viewer: LabViewer | null;
    /** Admins and owners only */
    admin?: LabAdminBlock;
}

/** A row of the admin list */
export interface LabManageRow extends LabCard {
    status: LabStatus;
    flagCount: number;
    startCount: number;
    updatedAt: string;
}

export interface LabCategoryCount { category: string; count: number }
export interface LabDifficultyCount { difficulty: string; count: number }
export interface LabFacets {
    total: number;
    categories: LabCategoryCount[];
    difficulties: LabDifficultyCount[];
}

export interface LabFilters {
    page?: number;
    limit?: number;
    category?: LabCategory | '';
    difficulty?: LabDifficulty | '';
    /** The member's own state: ignored by the API when signed out */
    status?: LabViewerStatus | '';
    q?: string;
    sort?: LabSort;
}

export interface LabProgressRow {
    _id: string;
    lab: string;
    labSlug: string | null;
    difficulty: LabDifficulty | null;
    status: 'started' | 'completed';
    /** Indexes of the hints opened */
    hintsUsed: number[];
    attempts: number;
    pointsEarned: number;
    startedAt: string;
    completedAt: string | null;
    timeSpent: number;
    lockedUntil: string | null;
}

export interface LabStats {
    totalStarted: number;
    totalCompleted: number;
    totalPoints: number;
    totalHintsUsed: number;
    totalTimeSpent: number;
    byDifficulty: Partial<Record<LabDifficulty, { started: number; completed: number; points: number }>>;
}

export interface LabBadge { code: string; name: string; icon: string; rarity: string }

export type SubmitResult =
    | { correct: false; attempts: number; status: 'started'; pointsEarned: 0; attemptsLeft: number; lockedUntil: string | null }
    | { correct: true; attempts: number; status: 'completed'; pointsEarned: number; completedAt: string; newBadges: LabBadge[] };

export interface HintResult {
    hint: { index: number; text: string; penalty: number };
    alreadyUnlocked: boolean;
    hintsUsed: number;
    pointsPenalty: number;
    pointsAvailable: number;
}

export interface StopResult { reset: boolean; status: string }

export interface LeaderUser { username: string; name: string | null; avatar: string | null }

export interface GlobalLeaderRow { rank: number; user: LeaderUser; totalPoints: number; labsCompleted: number }
export interface LabLeaderRow { rank: number; user: LeaderUser; pointsEarned: number; hintsUsed: number; completedAt: string }

// ---- Authoring ----

export interface LabFlagInput { value: string; caseSensitive: boolean }
export interface LabHintInput { text: string; penalty: number }
export interface LabFileInput { name: string; url: string; sizeBytes?: number; sha256?: string }

/** What `POST /` and `PUT /:ref` take. `flags` is write only: it is left out unless typed. */
export interface LabPayload {
    title?: string;
    slug?: string;
    description?: string;
    category?: LabCategory;
    difficulty?: LabDifficulty;
    points?: number;
    tags?: string[];
    estimatedMinutes?: number | null;
    instructions?: string;
    hints?: LabHintInput[];
    files?: LabFileInput[];
    labUrl?: string | null;
    status?: LabStatus;
    flags?: LabFlagInput[];
}

/** The lab as the admin edits it, as the API answers a create or an edit */
export interface LabAdminView {
    _id: string;
    slug: string;
    title: string;
    status: LabStatus;
    flagCount: number;
    startCount: number;
    completionCount: number;
}
