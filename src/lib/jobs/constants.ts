import {
    COMPANY_SIZES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, JOB_CATEGORIES, JOB_REPORT_REASONS, LOCATION_TYPES, SALARY_PERIODS,
    type CompanyStatus, type EmploymentType, type ExperienceLevel, type JobCategory, type JobReportReason, type JobSort, type JobStatus,
    type LocationType, type SalaryPeriod,
} from '@/types/job';

/** The tag the server renders cache their API reads under; an administrator's decision drops it */
export const JOBS_CACHE_TAG = 'jobs';

/** The limits of the jobs API, so a form says "too long" before the server has to */
export const JOB_LIMITS = {
    titleMin: 5,
    titleMax: 150,
    descriptionMin: 50,
    descriptionMax: 10000,
    listItems: 20,
    listItemLength: 500,
    skillLength: 50,
    benefitLength: 100,
    locationMax: 100,
    searchMax: 100,
    urlMax: 2048,
    emailMax: 254,
    salaryMax: 100_000_000,
    reasonMin: 3,
    reasonMax: 500,
    noteMax: 500,
    reportDetails: 500,
    pageDefault: 20,
    pageMax: 50,
    /** The farthest end date an employer may choose; staff may go further */
    maxExpiryDays: 90,
    openJobsUnverified: 10,
    companyName: { min: 2, max: 100 },
    companyDescription: 5000,
    companyLine: 150,
    industryMax: 100,
    jobCompanyDescription: 2000,
} as const;

const label = <T extends string>(entries: readonly [T, string][]) => entries.map(([id, name]) => ({ id, name }));

export const CATEGORY_OPTIONS = label<JobCategory>([
    ['pentesting', 'Penetration Testing'], ['soc', 'SOC / Security Operations'], ['grc', 'GRC / Compliance'], ['devsecops', 'DevSecOps'],
    ['forensics', 'Digital Forensics'], ['malware', 'Malware Analysis'], ['cloud-security', 'Cloud Security'], ['appsec', 'Application Security'], ['other', 'Other'],
]);
export const EXPERIENCE_OPTIONS = label<ExperienceLevel>([
    ['entry', 'Entry Level'], ['mid', 'Mid Level'], ['senior', 'Senior'], ['lead', 'Lead / Manager'], ['executive', 'Executive'],
]);
export const EMPLOYMENT_OPTIONS = label<EmploymentType>([
    ['full-time', 'Full-time'], ['part-time', 'Part-time'], ['contract', 'Contract'], ['freelance', 'Freelance'], ['internship', 'Internship'],
]);
export const LOCATION_OPTIONS = label<LocationType>([['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']]);
export const PERIOD_OPTIONS = label<SalaryPeriod>([['yearly', 'Yearly'], ['monthly', 'Monthly'], ['hourly', 'Hourly']]);
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'] as const;

export const SORT_OPTIONS: { id: JobSort; order: 'asc' | 'desc'; name: string }[] = [
    { id: 'createdAt', order: 'desc', name: 'Newest' },
    { id: 'viewCount', order: 'desc', name: 'Most viewed' },
    { id: 'salary.max', order: 'desc', name: 'Highest pay' },
    { id: 'title', order: 'asc', name: 'Title A to Z' },
];

export const REPORT_LABELS: Record<JobReportReason, string> = {
    spam: 'Spam or an advert',
    scam: 'Scam, fake job or asks for money',
    misinformation: 'Misleading or false information',
    inappropriate: 'Inappropriate content',
    broken_link: 'The apply link is broken or goes somewhere else',
    other: 'Something else',
};

export const STATUS_LABELS: Record<JobStatus, string> = {
    draft: 'Draft', pending: 'Under review', approved: 'Live', rejected: 'Rejected', closed: 'Closed', expired: 'Expired',
};

/** What an administrator calls a status in the queue (the queue is about review, not about the poster's view) */
export const ADMIN_STATUS_LABELS: Record<JobStatus, string> = {
    draft: 'Draft', pending: 'Waiting for review', approved: 'Approved', rejected: 'Rejected', closed: 'Closed', expired: 'Expired',
};

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = { pending: 'Waiting for review', verified: 'Verified', rejected: 'Rejected' };

export const EXPERIENCE_NAMES = Object.fromEntries(EXPERIENCE_OPTIONS.map((o) => [o.id, o.name])) as Record<string, string>;
export const CATEGORY_NAMES = Object.fromEntries(CATEGORY_OPTIONS.map((o) => [o.id, o.name])) as Record<string, string>;
export const EMPLOYMENT_NAMES = Object.fromEntries(EMPLOYMENT_OPTIONS.map((o) => [o.id, o.name])) as Record<string, string>;
export const LOCATION_NAMES = Object.fromEntries(LOCATION_OPTIONS.map((o) => [o.id, o.name])) as Record<string, string>;

export const COMMON_BENEFITS = [
    'Health insurance', 'Dental insurance', 'Vision insurance', 'Retirement plan', 'Remote work', 'Flexible hours', 'Paid time off', 'Equity',
    'Professional development', 'Conference budget', 'Home office stipend', 'Mental health support', 'Parental leave',
] as const;

export { COMPANY_SIZES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, JOB_CATEGORIES, JOB_REPORT_REASONS, LOCATION_TYPES, SALARY_PERIODS };
