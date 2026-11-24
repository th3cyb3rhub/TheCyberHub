/**
 * Shapes of the jobs and companies API (`/api/jobs`, `/api/companies`). A job is public only while it
 * is `approved` and its end date has not passed; every other job answers 404 to everybody but its
 * poster and the reviewers. Applying happens on the employer's own site: the platform only counts the click.
 */

export const JOB_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'closed', 'expired'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_CATEGORIES = ['pentesting', 'soc', 'grc', 'devsecops', 'forensics', 'malware', 'cloud-security', 'appsec', 'other'] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const EXPERIENCE_LEVELS = ['entry', 'mid', 'senior', 'lead', 'executive'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'freelance', 'internship'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const LOCATION_TYPES = ['remote', 'hybrid', 'onsite'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const SALARY_PERIODS = ['hourly', 'monthly', 'yearly'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const JOB_SORTS = ['createdAt', 'viewCount', 'title', 'salary.max'] as const;
export type JobSort = (typeof JOB_SORTS)[number];

export const JOB_REPORT_REASONS = ['spam', 'scam', 'misinformation', 'inappropriate', 'broken_link', 'other'] as const;
export type JobReportReason = (typeof JOB_REPORT_REASONS)[number];

export const COMPANY_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const;

export interface JobSalary {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    period?: SalaryPeriod | null;
}

/** The company behind a job, as the public may see it. Null for a staff-posted job or a rejected company. */
export interface JobCompanyRef {
    _id: string;
    name: string;
    slug: string;
    logo?: string | null;
    status?: CompanyStatus;
    isVerified?: boolean;
    /** Detail only */
    website?: string | null;
    location?: string | null;
    industry?: string | null;
    size?: string | null;
    socialLinks?: { linkedin?: string | null; twitter?: string | null } | null;
}

/** A row of a list: the description is cut to 300 characters, nothing about the poster or the review */
export interface JobCard {
    _id: string;
    slug: string;
    title: string;
    company: string;
    companyLogo?: string | null;
    companyRef?: JobCompanyRef | null;
    category: string;
    employmentType: string;
    experienceLevel: string;
    locationType: string;
    location?: string | null;
    salary?: JobSalary | null;
    skills: string[];
    isFeatured: boolean;
    applicationDeadline?: string | null;
    expiresAt?: string | null;
    createdAt: string;
    viewCount: number;
    /** Public right now: approved and not past its end date */
    isActive?: boolean;
    description: string;
    /** Only on the saved list */
    savedAt?: string;
}

export interface JobModeration {
    reason?: string | null;
    at?: string | null;
    /** Reviewers only */
    by?: string | null;
}

export interface JobPoster {
    _id: string;
    username?: string;
    name?: string;
    email?: string;
    role?: string;
}

export interface JobViewer {
    saved: boolean;
    isOwner: boolean;
}

/**
 * One job. The public copy has no `status`; the poster also gets `status`, `moderation` and
 * `applicationCount`; reviewers also `reportCount`, `heldForReports` and the poster.
 * `viewer` is null for a visitor who is not signed in, and missing on a copy rendered on the server.
 */
export interface Job extends JobCard {
    companyWebsite?: string | null;
    companyDescription?: string | null;
    requirements: string[];
    responsibilities: string[];
    benefits: string[];
    applyUrl?: string | null;
    applyEmail?: string | null;
    updatedAt?: string;
    status?: JobStatus;
    moderation?: JobModeration;
    applicationCount?: number;
    postedBy?: string | JobPoster | null;
    reportCount?: number;
    heldForReports?: boolean;
    viewer?: JobViewer | null;
}

/** A row of the poster's own list: no long text */
export type EmployerJob = JobCard & Pick<Job, 'status' | 'moderation' | 'applicationCount' | 'postedBy'>;

export interface JobsPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    pages: number;
    hasMore: boolean;
}

export interface JobsPage<T> {
    success?: boolean;
    data: T[];
    pagination: JobsPagination;
    /** Signed-in callers of the public list: which jobs on this page they saved */
    viewer?: { savedIds: string[] };
    /** The saved list: how many saved jobs on this page are closed, expired or removed since */
    unavailable?: number;
}

export interface JobMeta {
    redirectedFromSlug?: string;
    canonicalSlug?: string;
}

export interface JobResponse {
    data: Job;
    meta: JobMeta;
}

export interface JobListFilters {
    page?: number;
    limit?: number;
    search?: string;
    category?: JobCategory;
    experienceLevel?: ExperienceLevel;
    locationType?: LocationType;
    employmentType?: EmploymentType;
    featured?: boolean;
    salaryMin?: number;
    salaryMax?: number;
    sortBy?: JobSort;
    sortOrder?: 'asc' | 'desc';
}

export interface ApplyDetails {
    applyUrl: string | null;
    applyEmail: string | null;
}

export interface MineStats {
    totalJobs: number;
    activeJobs: number;
    totalViews: number;
    /** Clicks on the apply link. The API documents `totalApplicationClicks`; some builds send `totalApplications`. */
    totalApplicationClicks?: number;
    totalApplications?: number;
    byStatus: Record<string, number>;
}

export interface AdminStats {
    jobs: Record<string, number>;
    live: number;
    reported: number;
    pendingCompanies: number;
    moderationEnabled: boolean;
}

export type AdminJobStatusFilter = JobStatus | 'all';
export type AdminJobSort = 'oldest' | 'newest' | 'reports';

export interface AdminJobFilters {
    status?: AdminJobStatusFilter;
    reported?: boolean;
    q?: string;
    sort?: AdminJobSort;
    page?: number;
    limit?: number;
}

export interface Company {
    _id: string;
    name: string;
    slug: string;
    logo?: string | null;
    website?: string | null;
    description?: string | null;
    industry?: string | null;
    size?: string | null;
    location?: string | null;
    socialLinks?: { linkedin?: string | null; twitter?: string | null } | null;
    status: CompanyStatus;
    isVerified?: boolean;
    createdAt?: string;
    /** The owner's own company only */
    moderation?: { reason?: string | null; at?: string | null; by?: string | null };
}

export interface AdminCompany extends Company {
    owner?: JobPoster | string | null;
    /** Jobs of the company by status */
    jobs?: Record<string, number>;
}

export interface CompanyPayload {
    name?: string;
    logo?: string | null;
    website?: string | null;
    description?: string | null;
    industry?: string | null;
    size?: string;
    location?: string | null;
    socialLinks?: { linkedin?: string | null; twitter?: string | null };
}

export interface JobPayload {
    title?: string;
    description?: string;
    requirements?: string[];
    responsibilities?: string[];
    skills?: string[];
    benefits?: string[];
    category?: JobCategory;
    employmentType?: EmploymentType;
    experienceLevel?: ExperienceLevel;
    locationType?: LocationType;
    location?: string | null;
    salary?: JobSalary;
    applicationDeadline?: string | null;
    applyUrl?: string | null;
    applyEmail?: string | null;
    expiresAt?: string;
    saveAsDraft?: boolean;
    /** Admins and owners only */
    company?: string;
    companyLogo?: string | null;
    companyWebsite?: string | null;
    companyDescription?: string | null;
    isFeatured?: boolean;
}

export type ModerationAction = 'dismiss' | 'hide' | 'remove' | 'restore';
