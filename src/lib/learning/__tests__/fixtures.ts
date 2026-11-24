import type { LearningDetail, LearningNode, LearningProgress, PathViewer } from '@/types/learning';
import type { Resource } from '@/types/resource';

export const node = (over: Partial<LearningNode> & { id: string }): LearningNode => ({
    key: over.id, title: `Step ${over.id}`, stage: 'Basics', optional: false, requires: [], items: [], ...over,
});

export const progress = (over: Partial<LearningProgress> = {}): LearningProgress => ({
    pathId: 'p1', pathSlug: 'web-hacking', kind: 'roadmap', status: 'in-progress', progress: 33, percent: 33, completedModules: ['a'],
    completedCount: 1, requiredCount: 3, requiredCompleted: 1, totalModules: 4, enrolledAt: '2026-11-01T10:00:00Z', startedAt: '2026-11-01T10:00:00Z',
    completedAt: null, lastActivityAt: '2026-11-02T10:00:00Z', currentStreak: 1, longestStreak: 1, certificateId: null, ...over,
});

export const modules = (): LearningNode[] => [
    node({ id: 'a', key: 'a', title: 'HTTP basics' }),
    node({ id: 'b', key: 'b', title: 'Injection', requires: ['a'] }),
    node({ id: 'c', key: 'c', title: 'Auth bugs', requires: ['b'], stage: 'Attacks' }),
    node({ id: 'd', key: 'd', title: 'Bonus reading', optional: true, stage: 'Attacks' }),
];

export const viewer = (over: Partial<PathViewer> = {}): PathViewer => ({
    enrolled: true, bookmarked: false, progress: progress(), next: node({ id: 'b', key: 'b', title: 'Injection', requires: ['a'] }), certificateId: null, canEdit: false, ...over,
});

export const makeDetail = (over: Partial<LearningDetail> = {}): LearningDetail => ({
    id: 'p1', slug: 'web-hacking', title: 'Web hacking', kind: 'roadmap', shortDescription: 'From HTTP to exploits', description: 'A roadmap.',
    category: 'web-security', difficulty: 'beginner', estimatedDuration: '6 weeks', skills: ['http'], moduleCount: 4, requiredCount: 3,
    enrollmentCount: 10, completionCount: 2, isFeatured: false, publishedAt: '2026-10-01T10:00:00Z', prerequisites: [],
    stages: [{ title: 'Basics', moduleIds: ['a', 'b'] }, { title: 'Attacks', moduleIds: ['c', 'd'] }], modules: modules(), archived: false,
    updatedAt: '2026-11-01T10:00:00Z', viewer: viewer(), ...over,
});

export const makeResource = (over: Partial<Resource> = {}): Resource => ({
    id: 'r1', slug: 'owasp-top-10', title: 'OWASP Top 10', description: 'The ten most critical web risks.', url: 'https://owasp.org/Top10', domain: 'owasp.org',
    type: 'article', topic: 'web-security', difficulty: 'beginner', isFree: true, tags: [], upvotes: 4, downvotes: 1, score: 3, views: 10, isFeatured: false,
    linkStatus: 'ok', submittedBy: { username: 'sam', avatar: null, id: 'u9' }, createdAt: '2026-10-01T10:00:00Z', approvedAt: '2026-10-02T10:00:00Z',
    status: 'approved', viewer: null, ...over,
});
