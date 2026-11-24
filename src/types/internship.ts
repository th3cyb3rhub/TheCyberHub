/**
 * Shapes of the internships API (`/api/internships`). Cohort statuses are computed by the API: an
 * open cohort past its deadline reads `closed`.
 */

export const COHORT_STATUSES = ['draft', 'open', 'closed', 'in-progress', 'completed'] as const;
export type CohortStatus = (typeof COHORT_STATUSES)[number];

export const COHORT_TYPES = ['internship', 'mentorship'] as const;
export type CohortType = (typeof COHORT_TYPES)[number];

export const APPLICATION_STATUSES = ['pending', 'reviewing', 'accepted', 'rejected', 'withdrawn'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const ANSWER_TYPES = ['text', 'textarea', 'dropdown', 'file'] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
}

export interface Page<T> {
    success: boolean;
    count: number;
    data: T[];
    pagination: Pagination;
}

/** A card of the list. The staff fields are present only when a moderator, admin or owner asks. */
export interface CohortCard {
    _id: string;
    title: string;
    description: string;
    type: CohortType;
    /** Computed: `open` past the deadline reads `closed` */
    status: CohortStatus;
    /** 0 means unlimited */
    capacity: number;
    /** null when the capacity is unlimited */
    spotsLeft: number | null;
    applicationsOpen: boolean;
    startDate: string;
    endDate: string;
    applicationDeadline: string;
    technologies: string[];
    // Staff only
    isActive?: boolean;
    acceptedCount?: number;
    applicationCount?: number;
    /** The value in the database (the card's `status` is computed) */
    storedStatus?: CohortStatus;
    createdBy?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface SyllabusWeek {
    week: number;
    title: string;
    description?: string;
    topics: string[];
    deliverables: string[];
}

export interface CustomField {
    _id: string;
    label: string;
    type: AnswerType;
    options: string[];
    required: boolean;
}

export interface ShowcaseProject {
    title: string;
    description?: string;
    teamMembers?: string[];
    demoLink?: string | null;
    repoLink?: string | null;
    image?: string | null;
}

export interface Mentor {
    _id: string;
    name: string;
    username: string;
    avatar: string | null;
}

export interface ViewerApplication {
    _id: string;
    status: ApplicationStatus;
    appliedAt: string;
    updatedAt: string;
}

/** The signed-in member's own state; null for an anonymous visitor */
export interface CohortViewer {
    userApplication: ViewerApplication | null;
    canApply: boolean;
}

export interface CohortDetail extends CohortCard {
    requirements: string[];
    responsibilities: string[];
    benefits: string[];
    syllabus: SyllabusWeek[];
    customFields: CustomField[];
    showcaseProjects: ShowcaseProject[];
    mentors: Mentor[];
    viewer: CohortViewer | null;
}

/** A completed cohort of the showcase */
export interface PastCohort {
    _id: string;
    title: string;
    description: string;
    type: CohortType;
    startDate: string;
    endDate: string;
    technologies: string[];
    capacity: number;
    showcaseProjects: ShowcaseProject[];
}

export interface CohortFilters {
    type?: CohortType | '';
    /** Staff only; the API ignores it for everybody else */
    status?: CohortStatus | '';
    page?: number;
    limit?: number;
}

export interface AnswerValue { field: string; value: string }

export interface ApplyPayload {
    coverLetter: string;
    githubUrl?: string;
    linkedinUrl?: string;
    portfolioUrl?: string;
    resumeUrl?: string;
    answers: AnswerValue[];
}

export interface HistoryEntry {
    status: ApplicationStatus;
    at: string;
    note?: string;
}

export interface StaffHistoryEntry extends HistoryEntry {
    actor: 'applicant' | 'staff';
    by?: string;
}

export interface AnswerView { field: string; label: string; value: string }

export interface ApplicationCohort {
    _id: string;
    title: string;
    status: CohortStatus;
    type: CohortType;
    startDate: string;
    endDate: string;
    applicationDeadline: string;
}

/** An application as its own applicant sees it (never who reviewed it) */
export interface MyApplication {
    _id: string;
    /** null when the cohort was removed */
    cohort: ApplicationCohort | string | null;
    status: ApplicationStatus;
    coverLetter: string;
    githubUrl?: string | null;
    linkedinUrl?: string | null;
    portfolioUrl?: string | null;
    resumeUrl?: string | null;
    answers: AnswerView[];
    appliedAt: string;
    updatedAt: string;
    statusHistory: HistoryEntry[];
    reviewNote: string | null;
}

export interface Applicant { _id: string; name: string; username: string; email: string }

/** A row of the staff list of one cohort's applications */
export interface StaffApplicationRow {
    _id: string;
    cohort: string;
    status: ApplicationStatus;
    appliedAt: string;
    updatedAt: string;
    resumeUrl?: string | null;
    user: Applicant | null;
}

export interface StaffApplication extends StaffApplicationRow {
    coverLetter: string;
    githubUrl?: string | null;
    linkedinUrl?: string | null;
    portfolioUrl?: string | null;
    answers: AnswerView[];
    statusHistory: StaffHistoryEntry[];
    reviewNotes?: string | null;
    reviewedBy?: { _id: string; name: string; username: string } | string | null;
    reviewedAt?: string | null;
    withdrawnAt?: string | null;
}

export interface CohortPayloadField {
    _id?: string;
    label: string;
    type: AnswerType;
    options?: string[];
    required: boolean;
}

/** What create and edit send. Edits send only the keys that changed. */
export interface CohortPayload {
    title?: string;
    description?: string;
    type?: CohortType;
    status?: CohortStatus;
    capacity?: number;
    startDate?: string;
    endDate?: string;
    applicationDeadline?: string;
    requirements?: string[];
    technologies?: string[];
    responsibilities?: string[];
    benefits?: string[];
    syllabus?: SyllabusWeek[];
    customFields?: CohortPayloadField[];
    showcaseProjects?: ShowcaseProject[];
    isActive?: boolean;
}

export interface TransitionMeta { from?: string; to?: string; allowed?: string[] }
