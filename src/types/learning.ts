/** Roadmaps and learning paths: a roadmap is a path with `kind: 'roadmap'`, one progress store for both. */

export const PATH_KINDS = ['roadmap', 'path'] as const;
export type PathKind = (typeof PATH_KINDS)[number];

export const PATH_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export type PathStatus = (typeof PATH_STATUSES)[number];

export const PATH_CATEGORIES = ['beginner', 'offensive', 'defensive', 'cloud', 'compliance', 'career'] as const;
export type PathCategory = (typeof PATH_CATEGORIES)[number];

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ITEM_KINDS = ['resource', 'challenge', 'lab', 'tool', 'cheatsheet', 'path', 'external'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export type ProgressStatus = 'enrolled' | 'in-progress' | 'completed';

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
}

/** What a node links to, resolved by the server. `href` is an in-app route, or the link itself when `external`. */
export interface LearningItem {
    kind: ItemKind;
    ref: string;
    title: string;
    optional: boolean;
    href: string;
    url?: string;
    domain?: string;
    external?: boolean;
    difficulty?: string;
    category?: string;
    resourceType?: string;
    isFree?: boolean;
    linkStatus?: 'unknown' | 'ok' | 'broken';
}

export interface LearningNode {
    id: string;
    key: string;
    title: string;
    description?: string;
    stage: string | null;
    duration?: string;
    optional: boolean;
    /** Keys of other nodes. Advisory on roadmaps. */
    requires: string[];
    order?: number;
    items: LearningItem[];
    /** Next-step payloads only */
    index?: number;
    reason?: 'continue' | 'blocked' | 'optional';
    waitingFor?: string[];
}

export interface CardViewer {
    enrolled: boolean;
    status: ProgressStatus | null;
    percent: number;
    bookmarked: boolean;
}

export interface LearningCard {
    id: string;
    slug: string;
    title: string;
    kind: PathKind;
    shortDescription: string;
    icon?: string;
    category: PathCategory;
    difficulty: Difficulty;
    estimatedDuration: string | null;
    skills: string[];
    moduleCount: number;
    requiredCount: number;
    enrollmentCount: number;
    completionCount: number;
    isFeatured: boolean;
    publishedAt: string | null;
    /** Catalogue only. null when anonymous. */
    viewer?: CardViewer | null;
    /** Staff lists only */
    status?: PathStatus;
    createdBy?: { id: string; username?: string } | null;
    updatedAt?: string;
    submittedAt?: string | null;
    reviewNote?: string | null;
    archivedAt?: string | null;
}

export interface LearningProgress {
    pathId: string;
    pathSlug: string;
    kind: PathKind;
    status: ProgressStatus;
    progress: number;
    percent: number;
    completedModules: string[];
    completedCount: number;
    requiredCount: number;
    requiredCompleted: number;
    totalModules: number;
    enrolledAt: string;
    startedAt: string | null;
    completedAt: string | null;
    lastActivityAt: string;
    currentStreak: number;
    longestStreak: number;
    certificateId: string | null;
}

export interface PathViewer {
    enrolled: boolean;
    bookmarked: boolean;
    progress: LearningProgress | null;
    next: LearningNode | null;
    certificateId: string | null;
    canEdit: boolean;
}

export interface Prerequisite {
    id: string;
    slug: string;
    title: string;
    kind: PathKind;
    /** Signed in callers only */
    completed?: boolean;
}

export interface LearningDetail extends Omit<LearningCard, 'viewer'> {
    description: string;
    seo?: { metaDescription?: string };
    prerequisites: Prerequisite[];
    stages: { title: string; moduleIds: string[] }[];
    modules: LearningNode[];
    updatedAt?: string;
    archived: boolean;
    reviewNote?: string | null;
    viewer: PathViewer | null;
}

export interface LearningPage {
    success?: boolean;
    data: LearningCard[];
    pagination: Pagination;
    /** Authoring list only: one number per status */
    counts?: Partial<Record<PathStatus, number>>;
}

export interface UnlockedBadge { code: string; name: string }

export interface ProgressRewards { pointsAwarded: number; badges: UnlockedBadge[] }

/** The answer to enroll, complete, uncomplete and the batch call */
export interface ProgressChange extends LearningProgress {
    changed: boolean;
    completedNow: boolean;
    rewards: ProgressRewards;
    next: LearningNode | null;
}

export interface LearningSummary {
    totals: { enrolled: number; inProgress: number; completed: number; roadmapsCompleted: number };
    continue: { path: LearningCard; progress: LearningProgress; next: LearningNode | null }[];
    recentlyCompleted: { path: LearningCard; completedAt: string; certificateId: string | null }[];
}

/**
 * The public check returns only the recipient's username, the path title and the completion date.
 * The slug and kind come only for a published path, so a retired path reveals nothing but its title.
 */
export interface Certificate {
    valid?: boolean;
    certificateId: string;
    recipient: { username: string | null };
    path: { title: string; id?: string; slug?: string; kind?: PathKind };
    completedAt: string;
    issuedAt?: string;
    selfPaced: boolean;
}

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

/** A node as the editor loads it: raw refs, not resolved items */
export interface EditorItem { kind: ItemKind; ref: string; title: string; optional: boolean }

export interface EditorNode {
    id: string;
    key: string;
    title: string;
    description: string;
    stage: string;
    duration: string;
    optional: boolean;
    requires: string[];
    order?: number;
    items: EditorItem[];
}

export interface EditorPath extends LearningCard {
    description: string;
    seo: { metaDescription?: string };
    prerequisites: { id: string; slug?: string; title?: string }[];
    reviewedAt: string | null;
    stages: { title: string; moduleIds: string[] }[];
    modules: EditorNode[];
    updatedAt: string;
    status: PathStatus;
}

export interface EditorNodeInput {
    _id?: string;
    key?: string;
    title: string;
    description?: string;
    stage?: string;
    duration?: string;
    optional: boolean;
    requires: string[];
    items: { kind: ItemKind; ref: string; title?: string; optional: boolean }[];
}

export interface PathInput {
    title?: string;
    description?: string;
    shortDescription?: string;
    kind?: PathKind;
    category?: PathCategory;
    difficulty?: Difficulty;
    estimatedDuration?: string;
    icon?: string;
    skills?: string[];
    prerequisites?: string[];
    isFeatured?: boolean;
    seo?: { metaDescription?: string };
    modules?: EditorNodeInput[];
    /** The `updatedAt` the editor loaded: a newer save answers PATH_CONFLICT */
    ifUnmodifiedSince?: string;
}

export interface CatalogueFilters {
    kind?: PathKind;
    category?: PathCategory | '';
    difficulty?: Difficulty | '';
    search?: string;
    featured?: boolean;
    sort?: 'popular' | 'new' | 'title';
    page?: number;
    limit?: number;
}

export interface AdminPathFilters {
    status?: PathStatus | '';
    kind?: PathKind | '';
    q?: string;
    page?: number;
    limit?: number;
}
