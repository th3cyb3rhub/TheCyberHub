import type {
    CohortCard, CohortDetail, CohortViewer, CustomField, MyApplication, StaffApplication, StaffApplicationRow,
} from '@/types/internship';

const DAY = 86_400_000;
export const FIXED_NOW = new Date('2026-12-01T12:00:00.000Z');
export const iso = (days: number) => new Date(FIXED_NOW.getTime() + days * DAY).toISOString();

export const COHORT_ID = 'a'.repeat(24);
export const QUESTION_TEXT = 'b'.repeat(24);
export const QUESTION_AREA = 'c'.repeat(24);
export const QUESTION_PICK = 'd'.repeat(24);
export const QUESTION_FILE = 'e'.repeat(24);

export const questions = (): CustomField[] => [
    { _id: QUESTION_TEXT, label: 'Your favourite tool', type: 'text', options: [], required: true },
    { _id: QUESTION_AREA, label: 'Tell us about a bug you found', type: 'textarea', options: [], required: false },
    { _id: QUESTION_PICK, label: 'Preferred track', type: 'dropdown', options: ['Offensive', 'Defensive'], required: true },
    { _id: QUESTION_FILE, label: 'Sample report', type: 'file', options: [], required: false },
];

export const makeCard = (over: Partial<CohortCard> = {}): CohortCard => ({
    _id: COHORT_ID,
    title: 'Summer Security Internship',
    description: 'Eight weeks of hands-on web security work with a mentor.',
    type: 'internship',
    status: 'open',
    capacity: 10,
    spotsLeft: 4,
    applicationsOpen: true,
    startDate: iso(30),
    endDate: iso(86),
    applicationDeadline: iso(10),
    technologies: ['Burp Suite', 'Python'],
    ...over,
});

export const viewer = (over: Partial<CohortViewer> = {}): CohortViewer => ({ userApplication: null, canApply: true, ...over });

export const makeCohort = (over: Partial<CohortDetail> = {}): CohortDetail => ({
    ...makeCard(),
    requirements: ['Basic networking', 'Curiosity'],
    responsibilities: ['Test a real app'],
    benefits: ['Mentorship'],
    syllabus: [
        { week: 2, title: 'Injection', description: 'SQL and friends', topics: ['SQLi'], deliverables: ['Report'] },
        { week: 1, title: 'Foundations', description: '', topics: [], deliverables: [] },
    ],
    customFields: questions(),
    showcaseProjects: [],
    mentors: [{ _id: 'm1', name: 'Ada Lovelace', username: 'ada', avatar: null }],
    viewer: viewer(),
    ...over,
});

export const makeMine = (over: Partial<MyApplication> = {}): MyApplication => ({
    _id: 'f'.repeat(24),
    cohort: { _id: COHORT_ID, title: 'Summer Security Internship', status: 'open', type: 'internship', startDate: iso(30), endDate: iso(86), applicationDeadline: iso(10) },
    status: 'reviewing',
    coverLetter: 'I love breaking things responsibly.',
    githubUrl: 'https://github.com/ada',
    answers: [{ field: QUESTION_TEXT, label: 'Your favourite tool', value: 'Burp' }],
    appliedAt: iso(-5),
    updatedAt: iso(-2),
    statusHistory: [{ status: 'pending', at: iso(-5) }, { status: 'reviewing', at: iso(-2), note: 'Looking at your repo now' }],
    reviewNote: 'Looking at your repo now',
    ...over,
});

export const makeRow = (over: Partial<StaffApplicationRow> = {}): StaffApplicationRow => ({
    _id: 'f'.repeat(24),
    cohort: COHORT_ID,
    status: 'pending',
    appliedAt: iso(-3),
    updatedAt: iso(-3),
    resumeUrl: 'https://example.org/cv.pdf',
    user: { _id: 'u-applicant', name: 'Grace Hopper', username: 'grace', email: 'grace@example.org' },
    ...over,
});

export const makeStaffApplication = (over: Partial<StaffApplication> = {}): StaffApplication => ({
    ...makeRow(),
    coverLetter: 'Please pick me.',
    githubUrl: 'https://github.com/grace',
    answers: [{ field: QUESTION_TEXT, label: 'Your favourite tool', value: '<img src=x onerror=alert(1)>' }],
    statusHistory: [{ status: 'pending', at: iso(-3), actor: 'applicant' }],
    ...over,
});
