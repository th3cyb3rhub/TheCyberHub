import type { CrAdminSnippet, CrAttemptResult, CrCard, CrDetail, CrManageCard, CrViewer } from '@/types/codeReview';

export const SLUG = 'sql-injection-login';

export const CODE = [
    'def login(username, password):',
    '    conn = sqlite3.connect("users.db")',
    '    cursor = conn.cursor()',
    '    query = "SELECT * FROM users WHERE name = \'" + username + "\'"',
    '    cursor.execute(query)',
    '    row = cursor.fetchone()',
    '    return row is not None',
].join('\n');

export const makeCard = (over: Partial<CrCard> = {}): CrCard => ({
    _id: 'c1', slug: SLUG, title: 'Login check', summary: 'A login function.', language: 'python', category: 'injection', difficulty: 'easy',
    difficultyRank: 1, points: 25, tags: ['sqli', 'python'], findingCount: 2, hintCount: 2, lineCount: 7, solveCount: 4,
    createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

export const makeViewer = (over: Partial<CrViewer> = {}): CrViewer => ({
    status: 'not-started', attempts: 0, bestScore: 0, maxScore: 0, bestPercent: 0, passed: false, pointsEarned: 0, passedAt: null,
    hintsUnlocked: [], hintCost: 0, pointsAvailable: 25, solutionUnlocked: false, solutionViewed: false, pointsForfeited: false, attemptsToday: 0, attemptsLeftToday: 30, ...over,
});

export const makeDetail = (over: Partial<CrDetail> = {}): CrDetail => ({
    ...makeCard(),
    description: 'Review this login function for security problems.',
    vulnerableCode: CODE,
    hints: [
        { id: 'h1', order: 1, cost: 3, unlocked: false },
        { id: 'h2', order: 2, cost: 5, unlocked: false },
    ],
    updatedAt: '2026-01-02T00:00:00.000Z',
    viewer: makeViewer(),
    ...over,
});

export const makeManageCard = (over: Partial<CrManageCard> = {}): CrManageCard => ({
    ...makeCard(), isPublished: true, attemptCount: 10, updatedAt: '2026-01-03T00:00:00.000Z', ...over,
});

export const makeAdminSnippet = (over: Partial<CrAdminSnippet> = {}): CrAdminSnippet => ({
    ...makeManageCard(),
    description: 'Review this login function for security problems.',
    vulnerableCode: CODE,
    effectivePoints: 25,
    findings: [
        { lineStart: 4, lineEnd: 5, title: 'SQL injection', vulnerabilityType: 'sqli', severity: 'critical', cwe: 'CWE-89', owasp: 'A03:2021 - Injection', explanation: 'The name is concatenated into the query.', exploit: null, fix: null },
    ],
    hints: [{ id: 'h1', order: 1, text: 'Look at the query.', cost: 3 }],
    explanation: '', fixedCode: '', exploitedCode: '', fixedExploitedCode: '', exploitExample: null,
    ...over,
});

export const makeResult = (over: Partial<CrAttemptResult> = {}): CrAttemptResult => ({
    attemptId: 'a1', score: 7, maxScore: 20, percent: 35, passPercent: 70, passed: false, detailsRevealed: true, matchedCount: 1, duplicateCount: 0, pointsForfeited: false,
    matched: [{
        markIndex: 0, findingIndex: 0, lineStart: 4, lineEnd: 5, title: 'SQL injection', vulnerabilityType: 'sqli', severity: 'critical',
        cwe: 'CWE-89', owasp: 'A03:2021 - Injection', explanation: 'The name is concatenated into the query.', typeCorrect: false, points: 7,
    }],
    marks: [{ index: 0, result: 'matched' }, { index: 1, result: 'unmatched' }],
    missedCount: 1, falsePositives: 1, firstPass: false, pointsAwarded: 0, pointsAvailable: 25, hintsUsed: 0, attempts: 1, attemptsLeftToday: 29,
    bestPercent: 35, solutionUnlocked: true, newBadges: [], ...over,
});
