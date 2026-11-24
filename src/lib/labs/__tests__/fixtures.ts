import type { LabCard, LabDetail, LabViewer } from '@/types/lab';

export const SLUG = 'sql-injection-basics';

export const makeCard = (over: Partial<LabCard> = {}): LabCard => ({
    _id: 'l1', slug: SLUG, title: 'SQL Injection Basics', summary: 'Bypass a login form.', category: 'web-security', difficulty: 'easy',
    difficultyRank: 1, points: 50, tags: ['sqli'], estimatedMinutes: 30, hintCount: 2, fileCount: 1, labUrl: 'https://target.example.org/login',
    completionCount: 4, createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

export const makeViewer = (over: Partial<LabViewer> = {}): LabViewer => ({
    myStatus: 'not-started', hintsUsed: 0, attempts: 0, startedAt: null, completedAt: null, pointsAwarded: 0, pointsAvailable: 50, lockedUntil: null, ...over,
});

export const makeLab = (over: Partial<LabDetail> = {}): LabDetail => ({
    ...makeCard(),
    description: 'Learn to break a login form.',
    instructions: '## Goal\n\nFind the flag.',
    files: [{ name: 'app.zip', url: 'https://files.example.org/app.zip', sizeBytes: 2048, sha256: 'a'.repeat(64) }],
    hints: [
        { index: 0, penalty: 10, unlocked: false },
        { index: 1, penalty: 20, unlocked: false },
    ],
    updatedAt: '2026-01-02T00:00:00.000Z',
    viewer: makeViewer(),
    ...over,
});
