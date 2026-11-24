import { isEmail, safeHref } from './display';
import { COMPANY_SIZES, JOB_LIMITS } from './constants';
import type {
    CompanyPayload, Company, EmploymentType, ExperienceLevel, Job, JobCategory, JobPayload, LocationType, SalaryPeriod,
} from '@/types/job';
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, JOB_CATEGORIES, LOCATION_TYPES, SALARY_PERIODS } from '@/types/job';

// ---------------------------------------------------------------------------
// The job form
// ---------------------------------------------------------------------------

export interface JobFormValues {
    title: string;
    description: string;
    category: JobCategory;
    experienceLevel: ExperienceLevel;
    employmentType: EmploymentType;
    locationType: LocationType;
    location: string;
    salaryMin: string;
    salaryMax: string;
    salaryCurrency: string;
    salaryPeriod: SalaryPeriod;
    requirements: string[];
    responsibilities: string[];
    skills: string[];
    benefits: string[];
    applyUrl: string;
    applyEmail: string;
    /** `YYYY-MM-DD`, empty for none */
    applicationDeadline: string;
    /**
     * How long the job stays public, counted from now: a number of days, or empty to keep what the
     * job has (a new job gets the server's default of 30 days).
     */
    runFor: string;
    // Administrators and owners only
    company: string;
    companyLogo: string;
    companyWebsite: string;
    companyDescription: string;
    isFeatured: boolean;
}

export function emptyJobForm(): JobFormValues {
    return {
        title: '', description: '', category: 'other', experienceLevel: 'mid', employmentType: 'full-time', locationType: 'remote', location: '',
        salaryMin: '', salaryMax: '', salaryCurrency: 'USD', salaryPeriod: 'yearly',
        requirements: [], responsibilities: [], skills: [], benefits: [],
        applyUrl: '', applyEmail: '', applicationDeadline: '', runFor: '',
        company: '', companyLogo: '', companyWebsite: '', companyDescription: '', isFeatured: false,
    };
}

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list as readonly string[]).includes(value as string) ? (value as T) : fallback;

/** The values of the form for a job that exists, for editing it */
export function jobToForm(job: Job): JobFormValues {
    return {
        title: job.title ?? '',
        description: job.description ?? '',
        category: oneOf(JOB_CATEGORIES, job.category, 'other'),
        experienceLevel: oneOf(EXPERIENCE_LEVELS, job.experienceLevel, 'mid'),
        employmentType: oneOf(EMPLOYMENT_TYPES, job.employmentType, 'full-time'),
        locationType: oneOf(LOCATION_TYPES, job.locationType, 'remote'),
        location: job.location ?? '',
        salaryMin: job.salary?.min ? String(job.salary.min) : '',
        salaryMax: job.salary?.max ? String(job.salary.max) : '',
        salaryCurrency: (job.salary?.currency || 'USD').toUpperCase(),
        salaryPeriod: oneOf(SALARY_PERIODS, job.salary?.period, 'yearly'),
        requirements: [...(job.requirements ?? [])],
        responsibilities: [...(job.responsibilities ?? [])],
        skills: [...(job.skills ?? [])],
        benefits: [...(job.benefits ?? [])],
        applyUrl: job.applyUrl ?? '',
        applyEmail: job.applyEmail ?? '',
        applicationDeadline: job.applicationDeadline ? job.applicationDeadline.slice(0, 10) : '',
        runFor: '',
        company: job.company ?? '',
        companyLogo: job.companyLogo ?? '',
        companyWebsite: job.companyWebsite ?? '',
        companyDescription: job.companyDescription ?? '',
        isFeatured: !!job.isFeatured,
    };
}

const clean = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);

const LIST_RULES = [
    { key: 'requirements', name: 'Requirements', max: JOB_LIMITS.listItemLength },
    { key: 'responsibilities', name: 'Responsibilities', max: JOB_LIMITS.listItemLength },
    { key: 'skills', name: 'Skills', max: JOB_LIMITS.skillLength },
    { key: 'benefits', name: 'Benefits', max: JOB_LIMITS.benefitLength },
] as const;

const linkProblem = (value: string, name: string): string | undefined => {
    const text = value.trim();
    if (!text) return undefined;
    if (text.length > JOB_LIMITS.urlMax) return `${name} is too long`;
    return safeHref(text) ? undefined : `${name} must be a link that starts with http:// or https://`;
};

const wholeNumber = (value: string): number | null => {
    const text = value.trim();
    if (!text) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : NaN;
};

export interface JobFormOptions {
    /** Administrators and owners also name the company and may feature the job */
    admin?: boolean;
}

/** Problems with the form values, keyed by field. Empty when the form can be sent. */
export function validateJobForm(values: JobFormValues, { admin = false }: JobFormOptions = {}): Record<string, string> {
    const errors: Record<string, string> = {};
    const title = values.title.trim();
    if (title.length < JOB_LIMITS.titleMin) errors.title = `Give the job a title of at least ${JOB_LIMITS.titleMin} characters`;
    else if (title.length > JOB_LIMITS.titleMax) errors.title = `The title has at most ${JOB_LIMITS.titleMax} characters`;

    const description = values.description.trim();
    if (description.length < JOB_LIMITS.descriptionMin) errors.description = `Describe the role in at least ${JOB_LIMITS.descriptionMin} characters (${JOB_LIMITS.descriptionMin - description.length} more)`;
    else if (description.length > JOB_LIMITS.descriptionMax) errors.description = `The description has at most ${JOB_LIMITS.descriptionMax} characters`;

    if (values.location.trim().length > JOB_LIMITS.locationMax) errors.location = `The location has at most ${JOB_LIMITS.locationMax} characters`;

    for (const rule of LIST_RULES) {
        const items = clean(values[rule.key]);
        if (items.length > JOB_LIMITS.listItems) errors[rule.key] = `${rule.name} has room for ${JOB_LIMITS.listItems} items`;
        else if (items.some((item) => item.length > rule.max)) errors[rule.key] = `Each item in ${rule.name.toLowerCase()} has at most ${rule.max} characters`;
    }

    const url = linkProblem(values.applyUrl, 'The apply link');
    if (url) errors.applyUrl = url;
    const email = values.applyEmail.trim();
    if (email && !isEmail(email)) errors.applyEmail = 'Enter a valid email address';

    const min = wholeNumber(values.salaryMin);
    const max = wholeNumber(values.salaryMax);
    if (min !== null && (Number.isNaN(min) || min < 0 || min > JOB_LIMITS.salaryMax)) errors['salary.min'] = 'Enter a pay figure of 0 or more';
    if (max !== null && (Number.isNaN(max) || max < 0 || max > JOB_LIMITS.salaryMax)) errors['salary.max'] = 'Enter a pay figure of 0 or more';
    if (!errors['salary.min'] && !errors['salary.max'] && min !== null && max !== null && min > max) errors['salary.max'] = 'The highest pay cannot be lower than the lowest';
    if ((min !== null || max !== null) && !/^[A-Za-z]{3}$/.test(values.salaryCurrency.trim())) errors['salary.currency'] = 'Pick a currency';

    if (values.applicationDeadline && Number.isNaN(Date.parse(`${values.applicationDeadline}T00:00:00Z`))) errors.applicationDeadline = 'Enter a valid date';

    if (values.runFor.trim()) {
        const days = Number(values.runFor);
        const cap = admin ? 365 : JOB_LIMITS.maxExpiryDays;
        if (!Number.isInteger(days) || days < 1 || days > cap) errors.runFor = `Choose between 1 and ${cap} days`;
    }

    if (admin) {
        const company = values.company.trim();
        if (!company) errors.company = 'Enter the company this job is posted for';
        else if (company.length > JOB_LIMITS.companyName.max) errors.company = `The company name has at most ${JOB_LIMITS.companyName.max} characters`;
        const logo = linkProblem(values.companyLogo, 'The logo address');
        if (logo) errors.companyLogo = logo;
        const site = linkProblem(values.companyWebsite, 'The website');
        if (site) errors.companyWebsite = site;
        if (values.companyDescription.trim().length > JOB_LIMITS.jobCompanyDescription) errors.companyDescription = `The company description has at most ${JOB_LIMITS.jobCompanyDescription} characters`;
    }
    return errors;
}

/** The instant a job should end when it runs for `days` more days, a minute short of the day so the horizon check never trips */
export const expiryFromDays = (days: number, now: number = Date.now()): string => new Date(now + days * 86_400_000 - 60_000).toISOString();

export interface PayloadOptions extends JobFormOptions {
    /** An edit sends every field (empty ones clear), a new job only the ones that are filled */
    edit?: boolean;
    saveAsDraft?: boolean;
    now?: number;
}

/**
 * The request body for a job. An employer's `company*` fields and `isFeatured` are never sent: the
 * API reads the company from the company record and drops them anyway.
 */
export function toJobPayload(values: JobFormValues, { admin = false, edit = false, saveAsDraft = false, now = Date.now() }: PayloadOptions = {}): JobPayload {
    const min = wholeNumber(values.salaryMin);
    const max = wholeNumber(values.salaryMax);
    const hasPay = min !== null || max !== null;
    const payload: JobPayload = {
        title: values.title.trim(),
        description: values.description.trim(),
        category: values.category,
        experienceLevel: values.experienceLevel,
        employmentType: values.employmentType,
        locationType: values.locationType,
        requirements: clean(values.requirements),
        responsibilities: clean(values.responsibilities),
        skills: clean(values.skills),
        benefits: clean(values.benefits),
    };
    const location = values.location.trim();
    const applyUrl = values.applyUrl.trim();
    const applyEmail = values.applyEmail.trim();

    if (edit) {
        payload.location = location;
        payload.applyUrl = applyUrl;
        payload.applyEmail = applyEmail;
        payload.applicationDeadline = values.applicationDeadline ? `${values.applicationDeadline}T23:59:59.000Z` : null;
        payload.salary = hasPay
            ? { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}), currency: values.salaryCurrency.trim().toUpperCase(), period: values.salaryPeriod }
            : {};
    } else {
        if (location) payload.location = location;
        if (applyUrl) payload.applyUrl = applyUrl;
        if (applyEmail) payload.applyEmail = applyEmail;
        if (values.applicationDeadline) payload.applicationDeadline = `${values.applicationDeadline}T23:59:59.000Z`;
        if (hasPay) payload.salary = { ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}), currency: values.salaryCurrency.trim().toUpperCase(), period: values.salaryPeriod };
        if (saveAsDraft) payload.saveAsDraft = true;
    }
    if (values.runFor.trim()) payload.expiresAt = expiryFromDays(Number(values.runFor), now);

    if (admin) {
        payload.company = values.company.trim();
        const logo = values.companyLogo.trim();
        const site = values.companyWebsite.trim();
        const about = values.companyDescription.trim();
        if (edit || logo) payload.companyLogo = logo;
        if (edit || site) payload.companyWebsite = site;
        if (edit || about) payload.companyDescription = about;
        payload.isFeatured = values.isFeatured;
    }
    return payload;
}

// ---------------------------------------------------------------------------
// The company form
// ---------------------------------------------------------------------------

export interface CompanyFormValues {
    name: string;
    logo: string;
    website: string;
    description: string;
    industry: string;
    size: string;
    location: string;
    linkedin: string;
    twitter: string;
}

export const emptyCompanyForm = (name = ''): CompanyFormValues => ({
    name, logo: '', website: '', description: '', industry: '', size: '', location: '', linkedin: '', twitter: '',
});

export function companyToForm(company: Company | null | undefined, fallbackName = ''): CompanyFormValues {
    if (!company) return emptyCompanyForm(fallbackName);
    return {
        name: company.name ?? '',
        logo: company.logo ?? '',
        website: company.website ?? '',
        description: company.description ?? '',
        industry: company.industry ?? '',
        size: company.size ?? '',
        location: company.location ?? '',
        linkedin: company.socialLinks?.linkedin ?? '',
        twitter: company.socialLinks?.twitter ?? '',
    };
}

export function validateCompanyForm(values: CompanyFormValues): Record<string, string> {
    const errors: Record<string, string> = {};
    const name = values.name.trim();
    if (name.length < JOB_LIMITS.companyName.min) errors.name = `Enter the company name (at least ${JOB_LIMITS.companyName.min} characters)`;
    else if (name.length > JOB_LIMITS.companyName.max) errors.name = `The name has at most ${JOB_LIMITS.companyName.max} characters`;
    if (values.description.trim().length > JOB_LIMITS.companyDescription) errors.description = `The description has at most ${JOB_LIMITS.companyDescription} characters`;
    if (values.industry.trim().length > JOB_LIMITS.industryMax) errors.industry = `The industry has at most ${JOB_LIMITS.industryMax} characters`;
    if (values.location.trim().length > JOB_LIMITS.companyLine) errors.location = `The location has at most ${JOB_LIMITS.companyLine} characters`;
    if (values.size && !(COMPANY_SIZES as readonly string[]).includes(values.size)) errors.size = 'Choose one of the sizes in the list';
    const links: [keyof CompanyFormValues, string, string][] = [
        ['logo', 'logo', 'The logo address'], ['website', 'website', 'The website'],
        ['linkedin', 'socialLinks.linkedin', 'The LinkedIn link'], ['twitter', 'socialLinks.twitter', 'The X link'],
    ];
    for (const [key, field, name2] of links) {
        const problem = linkProblem(values[key], name2);
        if (problem) errors[field] = problem;
    }
    return errors;
}

/** The body of a company save: an empty field is sent as null (or an empty size) so it clears */
export function toCompanyPayload(values: CompanyFormValues): CompanyPayload {
    const text = (v: string) => v.trim() || null;
    return {
        name: values.name.trim(),
        logo: text(values.logo),
        website: text(values.website),
        description: text(values.description),
        industry: text(values.industry),
        size: values.size,
        location: text(values.location),
        socialLinks: { linkedin: text(values.linkedin), twitter: text(values.twitter) },
    };
}
