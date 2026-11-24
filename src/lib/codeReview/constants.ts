import type { CrCategory, CrDifficulty, CrSeverity, CrSort, CrViewerStatus } from '@/types/codeReview';

/** Cache tag of the public copies fetched while rendering (see `server.ts` and the revalidate route) */
export const CODE_REVIEW_CACHE_TAG = 'code-review';

/** The limits of the API (`/api/code-review`), so a screen never sends what the server refuses */
export const CR_LIMITS = {
    titleMin: 3,
    title: 200,
    slugMin: 3,
    slug: 80,
    descriptionMin: 10,
    description: 2000,
    codeMin: 10,
    codeBytes: 30 * 1024,
    extraCodeBytes: 30 * 1024,
    findings: 40,
    findingTitle: 120,
    findingExplanationMin: 10,
    findingExplanation: 3000,
    findingNote: 2000,
    findingFixCode: 5000,
    owasp: 120,
    hints: 10,
    hintText: 1000,
    hintCostMax: 100,
    hintCostDefault: 5,
    tags: 10,
    tagLength: 30,
    points: 1000,
    overview: 5000,
    marks: 50,
    search: 100,
    attemptsPerDay: 30,
    attemptHistory: 20,
} as const;

/** The rules the grading follows, shown to the member. The server decides; these are only the words. */
export const CR_RULES = {
    findingPoints: 10,
    falseMarkPenalty: 3,
    wrongTypeFactor: 70,
    passPercent: 70,
    attemptDecayPercent: 10,
    attemptDecayMaxPercent: 50,
} as const;

/** Slugs that would shadow a fixed route of the API */
export const CR_RESERVED_SLUGS = ['manage', 'stats', 'progress', 'attempts'] as const;

export const DIFFICULTY_LABELS: Record<CrDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const SEVERITY_LABELS: Record<CrSeverity, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const STATUS_LABELS: Record<CrViewerStatus, string> = { 'not-started': 'Not started', 'in-progress': 'In progress', passed: 'Passed' };
export const SORT_LABELS: Record<CrSort, string> = { createdAt: 'Newest', title: 'Title (A to Z)', difficulty: 'Easiest first' };

/** What the API takes for each sort, in the order the chooser lists them */
export const SORT_CHOICES: { id: string; sortBy: CrSort; sortOrder: 'asc' | 'desc'; label: string }[] = [
    { id: 'newest', sortBy: 'createdAt', sortOrder: 'desc', label: 'Newest' },
    { id: 'easiest', sortBy: 'difficulty', sortOrder: 'asc', label: 'Easiest first' },
    { id: 'hardest', sortBy: 'difficulty', sortOrder: 'desc', label: 'Hardest first' },
    { id: 'title', sortBy: 'title', sortOrder: 'asc', label: 'Title (A to Z)' },
];

const CATEGORY_NAMES: Record<string, string> = {
    sqli: 'SQL injection',
    xss: 'Cross-site scripting',
    ssrf: 'SSRF',
    idor: 'IDOR',
    auth: 'Authentication',
    crypto: 'Cryptography',
    injection: 'Injection',
    xxe: 'XXE',
    deserialization: 'Deserialization',
    redirect: 'Open redirect',
    traversal: 'Path traversal',
    rng: 'Weak randomness',
    'input-validation': 'Input validation',
    'race-condition': 'Race condition',
    other: 'Other',
};

const LANGUAGE_NAMES: Record<string, string> = {
    javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', java: 'Java', go: 'Go', rust: 'Rust', c: 'C', cpp: 'C++',
    csharp: 'C#', php: 'PHP', ruby: 'Ruby', sql: 'SQL', other: 'Other',
};

const words = (value: string) => {
    const text = value.replace(/[-_]/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
};

/** `sqli` as "SQL injection". A value this client does not know is still readable. */
export const categoryLabel = (category: string): string => CATEGORY_NAMES[category] ?? words(category);
export const languageLabel = (language: string): string => LANGUAGE_NAMES[language] ?? words(language);

const isIn = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);
export { isIn };

export type { CrCategory };
