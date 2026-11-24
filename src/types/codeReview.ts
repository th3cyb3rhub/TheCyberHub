/**
 * Shapes of the code review API (`/api/code-review`). A snippet is addressed by its slug. The
 * browser sends line ranges and nothing else: the server holds the answer key and does the grading,
 * and the key reaches a member only through the solution, after a graded attempt.
 */

export const CR_CATEGORIES = [
    'sqli', 'xss', 'ssrf', 'idor', 'auth', 'crypto', 'injection', 'xxe', 'deserialization',
    'redirect', 'traversal', 'rng', 'input-validation', 'race-condition', 'other',
] as const;
export type CrCategory = (typeof CR_CATEGORIES)[number];

export const CR_LANGUAGES = [
    'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'csharp', 'php', 'ruby', 'sql', 'other',
] as const;
export type CrLanguage = (typeof CR_LANGUAGES)[number];

export const CR_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type CrDifficulty = (typeof CR_DIFFICULTIES)[number];

export const CR_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type CrSeverity = (typeof CR_SEVERITIES)[number];

export const CR_SORTS = ['createdAt', 'title', 'difficulty'] as const;
export type CrSort = (typeof CR_SORTS)[number];

export const CR_VIEWER_STATUSES = ['not-started', 'in-progress', 'passed'] as const;
export type CrViewerStatus = (typeof CR_VIEWER_STATUSES)[number];

export interface CrPagination {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
}

export interface CrPage<T> {
    count: number;
    data: T[];
    pagination: CrPagination;
}

/** The member's own numbers on one snippet */
export interface CrProgress {
    status: CrViewerStatus;
    attempts: number;
    bestScore: number;
    maxScore: number;
    bestPercent: number;
    passed: boolean;
    pointsEarned: number;
}

/** A snippet as the list shows it: no code, no answers. `progress` only when signed in. */
export interface CrCard {
    _id: string;
    slug: string;
    title: string;
    summary: string;
    /** A string, not a closed list: a value this client does not know yet is still shown */
    language: string;
    category: string;
    difficulty: CrDifficulty;
    difficultyRank: number;
    points: number;
    tags: string[];
    findingCount: number;
    hintCount: number;
    lineCount: number;
    solveCount: number;
    createdAt: string;
    progress?: CrProgress;
}

export interface CrManageCard extends CrCard {
    isPublished: boolean;
    attemptCount: number;
    updatedAt: string;
}

export interface CrHintView {
    order: number;
    cost: number;
    unlocked: boolean;
    /** Only for a hint the member opened (staff get all of them) */
    text?: string;
}

export interface CrViewer extends CrProgress {
    passedAt: string | null;
    /** Orders of the hints the member opened */
    hintsUnlocked: number[];
    hintCost: number;
    /** What a perfect pass would pay now */
    pointsAvailable: number;
    solutionUnlocked: boolean;
    solutionViewed: boolean;
    attemptsToday: number;
    attemptsLeftToday: number;
}

export interface CrDetail extends CrCard {
    description: string;
    vulnerableCode: string;
    hints: CrHintView[];
    updatedAt: string;
    viewer: CrViewer | null;
}

export interface CrExploit { description: string; payload: string; result: string }
export interface CrFix { description: string; code: string }

export interface CrFinding {
    lineStart: number;
    lineEnd: number;
    title: string | null;
    vulnerabilityType: string;
    severity: CrSeverity;
    cwe: string | null;
    owasp: string | null;
    explanation: string;
    exploit: Partial<CrExploit> | null;
    fix: Partial<CrFix> | null;
}

export interface CrHintFull { order: number; text: string; cost: number }

export interface CrExploitExample { title?: string; description?: string; payload?: string; result?: string }

/** The whole snippet with its answer key: what the editor loads (admin, owner, moderator) */
export interface CrAdminSnippet extends CrManageCard {
    description: string;
    vulnerableCode: string;
    effectivePoints: number;
    findings: CrFinding[];
    hints: CrHintFull[];
    explanation: string;
    fixedCode: string;
    exploitedCode: string;
    fixedExploitedCode: string;
    exploitExample: CrExploitExample | null;
}

export interface CrMark {
    lineStart: number;
    lineEnd: number;
    vulnerabilityType?: string;
}

export type CrMarkVerdict = 'matched' | 'duplicate' | 'unmatched';

export interface CrMatched {
    markIndex: number;
    findingIndex: number;
    lineStart: number;
    lineEnd: number;
    title: string | null;
    vulnerabilityType: string;
    severity: CrSeverity;
    cwe: string | null;
    owasp: string | null;
    explanation: string;
    /** null when the mark named no type */
    typeCorrect: boolean | null;
    points: number;
}

export interface CrBadge { code: string; name: string; icon: string | null; rarity: string | null }

export interface CrAttemptResult {
    attemptId: string;
    score: number;
    maxScore: number;
    percent: number;
    passPercent: number;
    passed: boolean;
    matched: CrMatched[];
    marks: { index: number; result: CrMarkVerdict }[];
    missedCount: number;
    falsePositives: number;
    firstPass: boolean;
    pointsAwarded: number;
    pointsAvailable: number;
    hintsUsed: number;
    attempts: number;
    attemptsLeftToday: number;
    bestPercent: number;
    solutionUnlocked: boolean;
    newBadges: CrBadge[];
}

export interface CrAttemptRow {
    attemptId: string;
    score: number;
    maxScore: number;
    percent: number;
    passed: boolean;
    matchedCount: number;
    falsePositives: number;
    hintsUsed: number;
    marks: CrMark[];
    createdAt: string;
}

export interface CrHintResult {
    hint: CrHintFull;
    alreadyUnlocked: boolean;
    /** False for staff: nothing is recorded or charged */
    recorded: boolean;
    hintsUsed: number;
    hintCost: number;
    pointsAvailable: number;
}

export interface CrSolution {
    _id: string;
    slug: string;
    title: string;
    findings: CrFinding[];
    explanation: string;
    fixedCode: string;
    exploitedCode: string;
    fixedExploitedCode: string;
    exploitExample: CrExploitExample | null;
    hints: CrHintFull[];
    viewer: CrViewer | null;
}

export interface CrStats {
    total: number;
    facets: {
        categories: { category: string; count: number }[];
        difficulties: { difficulty: string; count: number }[];
        languages: { language: string; count: number }[];
    };
    /** Null when anonymous */
    viewer: { attempted: number; passed: number; points: number } | null;
}

export interface CrProgressRow extends CrProgress {
    snippet: { _id: string; slug: string; title: string; category: string; difficulty: string; points: number; findingCount: number };
    passedAt: string | null;
    hintsUsed: number;
    solutionViewed: boolean;
    lastAttemptAt: string | null;
}

export interface CrMyProgress {
    summary: { attempted: number; passed: number; points: number };
    data: CrProgressRow[];
}

/** The list filters, as the API takes them. Empty means "not set". */
export interface CrFilters {
    page?: number;
    limit?: number;
    category?: string;
    difficulty?: string;
    language?: string;
    search?: string;
    status?: CrViewerStatus | '';
    sortBy?: CrSort;
    sortOrder?: 'asc' | 'desc';
}

export interface CrManageFilters {
    page?: number;
    limit?: number;
    isPublished?: boolean | '';
    category?: string;
    difficulty?: string;
    language?: string;
    search?: string;
}

/** What the editor sends. Counters and derived fields are never part of it. */
export interface CrFindingInput {
    lineStart: number;
    lineEnd: number;
    title?: string;
    vulnerabilityType: string;
    severity: CrSeverity;
    cwe?: string;
    owasp?: string;
    explanation: string;
    exploit?: Partial<CrExploit>;
    fix?: Partial<CrFix>;
}

export interface CrSnippetPayload {
    title?: string;
    slug?: string;
    description?: string;
    language?: string;
    category?: string;
    difficulty?: CrDifficulty;
    points?: number;
    tags?: string[];
    vulnerableCode?: string;
    findings?: CrFindingInput[];
    hints?: { text: string; cost: number }[];
    explanation?: string;
    fixedCode?: string;
    exploitedCode?: string;
    fixedExploitedCode?: string;
    exploitExample?: CrExploitExample;
    isPublished?: boolean;
}
