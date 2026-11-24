import type { Metadata } from 'next';
import { escapeHtml } from '@/lib/markdown';
import type { Company, Job, JobCard } from '@/types/job';
import { excerpt, safeHref } from './display';
import { jobUrl, SITE_URL } from './server';

/** Kept out of search results and link crawlers */
const NO_INDEX: Metadata['robots'] = { index: false, follow: false };

/** The metadata of a job page. A job that is not public, an unknown reference or a failing API passes `null`. */
export function jobMetadata(job: Job | null): Metadata {
    if (!job) return { title: 'Job', robots: NO_INDEX };
    const description = excerpt(job.description, 160) || `${job.title} at ${job.company}, a cybersecurity role on TheCyberHub.`;
    const title = `${job.title} at ${job.company}`;
    const url = jobUrl(job.slug);
    const logo = safeHref(job.companyRef?.logo || job.companyLogo);
    return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title,
            description,
            url,
            type: 'website',
            siteName: 'TheCyberHub',
            images: [logo ? { url: logo, alt: job.company } : { url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }],
        },
        twitter: { card: 'summary_large_image', title, description, images: [logo || '/twitter-image.png'] },
    };
}

export const JOBS_LIST_DESCRIPTION = 'Find cybersecurity jobs: penetration testing, SOC analyst, GRC, DevSecOps, cloud security and more. Every posting is reviewed before it appears.';

/** The metadata of the list. A filtered list is not indexed on its own: the canonical address is the plain list. */
export function jobsListMetadata(filtered: boolean): Metadata {
    return {
        title: 'Cybersecurity Jobs',
        description: JOBS_LIST_DESCRIPTION,
        alternates: { canonical: '/jobs' },
        ...(filtered ? { robots: { index: false, follow: true } } : {}),
        openGraph: {
            title: 'Cybersecurity Jobs | TheCyberHub',
            description: 'Browse reviewed cybersecurity job listings from organisations that hire security people.',
            type: 'website',
            url: `${SITE_URL}/jobs`,
        },
    };
}

export function companyMetadata(company: Company | null): Metadata {
    if (!company) return { title: 'Company', robots: NO_INDEX };
    const description = excerpt(company.description, 160) || `Open cybersecurity roles at ${company.name}.`;
    const url = `${SITE_URL}/company/${company.slug}`;
    const logo = safeHref(company.logo);
    return {
        title: `${company.name} careers`,
        description,
        alternates: { canonical: url },
        openGraph: {
            title: `${company.name} careers on TheCyberHub`,
            description,
            url,
            type: 'website',
            siteName: 'TheCyberHub',
            images: [logo ? { url: logo, alt: company.name } : { url: '/img.png', width: 1200, height: 630, alt: 'TheCyberHub' }],
        },
    };
}

// ---------------------------------------------------------------------------
// JobPosting structured data
// ---------------------------------------------------------------------------

const SCHEMA_EMPLOYMENT: Record<string, string> = {
    'full-time': 'FULL_TIME', 'part-time': 'PART_TIME', contract: 'CONTRACTOR', freelance: 'CONTRACTOR', internship: 'INTERN',
};
const SCHEMA_PERIOD: Record<string, string> = { hourly: 'HOUR', monthly: 'MONTH', yearly: 'YEAR' };

/** Plain text as the paragraphs of a small HTML fragment, every character of it escaped */
function paragraphs(text: string): string {
    return text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

/**
 * The `JobPosting` of a public job for search engines. Every text is the poster's own, so it goes
 * out as data: the description is escaped before it becomes the HTML fragment search engines read,
 * and the whole object is written with `<` escaped (see `StructuredData`), so no text can close the
 * script element.
 */
export function jobPostingJsonLd(job: Job | JobCard): Record<string, unknown> {
    const detail = job as Job;
    const website = safeHref(job.companyRef?.website ?? detail.companyWebsite);
    const logo = safeHref(job.companyRef?.logo || job.companyLogo);
    const lists = [
        detail.responsibilities?.length ? { key: 'responsibilities', value: detail.responsibilities.join('\n') } : null,
        detail.requirements?.length ? { key: 'qualifications', value: detail.requirements.join('\n') } : null,
        detail.benefits?.length ? { key: 'jobBenefits', value: detail.benefits.join(', ') } : null,
        job.skills?.length ? { key: 'skills', value: job.skills.join(', ') } : null,
    ].filter((x): x is { key: string; value: string } => !!x);

    const data: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: job.title,
        description: paragraphs(job.description),
        datePosted: job.createdAt,
        ...(job.expiresAt ? { validThrough: job.expiresAt } : {}),
        employmentType: SCHEMA_EMPLOYMENT[job.employmentType] ?? 'OTHER',
        identifier: { '@type': 'PropertyValue', name: job.company, value: job._id },
        url: jobUrl(job.slug),
        directApply: false,
        hiringOrganization: {
            '@type': 'Organization',
            name: job.company,
            ...(website ? { sameAs: website } : {}),
            ...(logo ? { logo } : {}),
        },
    };
    if (job.locationType === 'remote') {
        data.jobLocationType = 'TELECOMMUTE';
    } else if (job.location) {
        data.jobLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location } };
    }
    const { min, max } = job.salary ?? {};
    if ((min && min > 0) || (max && max > 0)) {
        data.baseSalary = {
            '@type': 'MonetaryAmount',
            currency: (job.salary?.currency || 'USD').toUpperCase(),
            value: {
                '@type': 'QuantitativeValue',
                ...(min && min > 0 ? { minValue: min } : {}),
                ...(max && max > 0 ? { maxValue: max } : {}),
                unitText: SCHEMA_PERIOD[job.salary?.period ?? 'yearly'] ?? 'YEAR',
            },
        };
    }
    for (const { key, value } of lists) data[key] = value;
    return data;
}
