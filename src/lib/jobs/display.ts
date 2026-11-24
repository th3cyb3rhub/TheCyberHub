import { excerpt, hostOf, LINK_REL, safeHref } from '@/lib/labs/display';
import {
    CATEGORY_NAMES, COMPANY_STATUS_LABELS, EMPLOYMENT_NAMES, EXPERIENCE_NAMES, LOCATION_NAMES, STATUS_LABELS,
} from './constants';
import type { CompanyStatus, JobSalary, JobStatus } from '@/types/job';

/**
 * Outbound links of a job (apply link, company website, logo) come from people, so they are shown
 * only when they are http or https, and carry the same `rel` as every outbound link of the site.
 */
export { excerpt, hostOf, LINK_REL, safeHref };

const word = (map: Record<string, string>, value: string | null | undefined) => (value ? map[value] ?? value : '');

export const categoryName = (value: string | null | undefined) => word(CATEGORY_NAMES, value);
export const experienceName = (value: string | null | undefined) => word(EXPERIENCE_NAMES, value);
export const employmentName = (value: string | null | undefined) => word(EMPLOYMENT_NAMES, value);
export const locationTypeName = (value: string | null | undefined) => word(LOCATION_NAMES, value);

/** "Remote", "Hybrid, Berlin", "Berlin" when the type is missing */
export function locationText(job: { locationType?: string | null; location?: string | null }): string {
    const type = locationTypeName(job.locationType);
    const place = (job.location ?? '').trim();
    if (type && place && job.locationType !== 'remote') return `${type}, ${place}`;
    if (job.locationType === 'remote' && place) return `${type} (${place})`;
    return type || place || 'Location not given';
}

function money(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
        // A code the runtime does not know
        return `${currency} ${Math.round(amount).toLocaleString('en-US')}`;
    }
}

const PERIOD_SUFFIX: Record<string, string> = { hourly: ' / hour', monthly: ' / month' };

/** "$90,000 - $120,000", "From $50", "Up to EUR 70,000 / month". Null when there is no pay to show. */
export function formatSalary(salary: JobSalary | null | undefined, { withPeriod = true }: { withPeriod?: boolean } = {}): string | null {
    if (!salary) return null;
    const min = typeof salary.min === 'number' && salary.min > 0 ? salary.min : null;
    const max = typeof salary.max === 'number' && salary.max > 0 ? salary.max : null;
    if (min === null && max === null) return null;
    const currency = (salary.currency || 'USD').toUpperCase();
    let text: string;
    if (min !== null && max !== null) text = min === max ? money(min, currency) : `${money(min, currency)} - ${money(max, currency)}`;
    else if (min !== null) text = `From ${money(min, currency)}`;
    else text = `Up to ${money(max as number, currency)}`;
    return withPeriod ? `${text}${PERIOD_SUFFIX[salary.period ?? ''] ?? ''}` : text;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * The status to show for the poster's own job. A job the server still lists as approved but whose
 * end date has passed (the sweep runs every quarter of an hour) is already expired for everybody.
 */
export function effectiveStatus(job: { status?: JobStatus; expiresAt?: string | null }, now: number = Date.now()): JobStatus {
    const status = job.status ?? 'approved';
    if (status === 'approved' && job.expiresAt) {
        const end = Date.parse(job.expiresAt);
        if (Number.isFinite(end) && end <= now) return 'expired';
    }
    return status;
}

export const statusLabel = (status: JobStatus): string => STATUS_LABELS[status] ?? status;
export const companyStatusLabel = (status: CompanyStatus): string => COMPANY_STATUS_LABELS[status] ?? status;

/** Whether a visitor can open the job on the public page right now */
export const isPublicNow = (job: { status?: JobStatus; expiresAt?: string | null }, now: number = Date.now()): boolean =>
    effectiveStatus(job, now) === 'approved';

/** Whole days until an instant, never below zero; null when there is no date */
export function daysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
    if (!iso) return null;
    const end = Date.parse(iso);
    if (!Number.isFinite(end)) return null;
    return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

/** "Ends today", "1 day left", "12 days left" */
export function daysLeftText(iso: string | null | undefined, now: number = Date.now()): string | null {
    const days = daysUntil(iso, now);
    if (days === null) return null;
    if (days === 0) return 'Ends today';
    return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const EMAIL = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]+$/;
export const isEmail = (value: string | null | undefined): value is string => !!value && value.length <= 254 && EMAIL.test(value);

/** A `mailto:` link for an apply address, or null when the address is not one. The subject names the job. */
export function mailtoHref(email: string | null | undefined, title?: string): string | null {
    // A mail address is a valid one for the form, but it is also put into a link: a `?`, `&`, `#`, `%`, `=` or `/`
    // would add a header (`?bcc=`) or another field, so such an address gets no mailto link at all.
    if (!isEmail(email) || /[?&#%=/]/.test(email)) return null;
    const subject = title ? `?subject=${encodeURIComponent(`Application for ${title}`)}` : '';
    return `mailto:${encodeURI(email)}${subject}`;
}

/** The text of a count: "1 view", "12 views" */
export const countText = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
