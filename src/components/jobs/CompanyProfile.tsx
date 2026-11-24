import Link from 'next/link';
import { Briefcase, ExternalLink, Globe, Linkedin, MapPin, ShieldCheck, Twitter, Users } from 'lucide-react';
import { btnSecondary, card, chip, focusRing, muted, pageBg } from '@/components/events/styles';
import { LINK_REL, hostOf, safeHref } from '@/lib/jobs/display';
import type { Company, JobCard as Card, JobsPagination } from '@/types/job';
import { CompanyLogo } from './CompanyLogo';
import { JobCard } from './JobCard';

function Outbound({ href, children, label }: { href?: string | null; children: React.ReactNode; label?: string }) {
    const safe = safeHref(href);
    if (!safe) return null;
    return <a href={safe} target="_blank" rel={LINK_REL} aria-label={label} className={`${btnSecondary} !px-3 !py-2`}>{children}</a>;
}

/**
 * A company page: who they are and their open jobs. Every field is plain text and every link is
 * checked to be http or https. `jobs` is null when the list could not be loaded.
 */
export function CompanyProfile({ company, jobs, pagination, pageHref }: {
    company: Company;
    jobs: Card[] | null;
    pagination?: JobsPagination;
    /** The address of a page of the job list */
    pageHref: (page: number) => string;
}) {
    const website = safeHref(company.website);
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
                <Link href="/jobs" className={`mb-4 inline-block rounded text-sm text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${focusRing}`}>Back to jobs</Link>
                <header className={`${card} p-5 sm:p-8`}>
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                        <CompanyLogo src={company.logo} name={company.name} size="lg" />
                        <div className="min-w-0 flex-1">
                            <h1 className="flex flex-wrap items-center gap-2 break-words text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
                                {company.name}
                                {company.status === 'verified' && <span className={`${chip} bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300`}><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verified employer</span>}
                            </h1>
                            <ul className={`mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm ${muted}`}>
                                {company.industry && <li className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" aria-hidden="true" />{company.industry}</li>}
                                {company.location && <li className="flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" />{company.location}</li>}
                                {company.size && <li className="flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" />{company.size} people</li>}
                            </ul>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Outbound href={company.website}><Globe className="h-4 w-4" aria-hidden="true" /> Website{website && <span className="sr-only"> ({hostOf(website)})</span>}</Outbound>
                            <Outbound href={company.socialLinks?.linkedin} label={`${company.name} on LinkedIn`}><Linkedin className="h-4 w-4" aria-hidden="true" /></Outbound>
                            <Outbound href={company.socialLinks?.twitter} label={`${company.name} on X`}><Twitter className="h-4 w-4" aria-hidden="true" /></Outbound>
                        </div>
                    </div>
                </header>

                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                    <section className={`${card} p-5 sm:p-6 lg:order-2`} aria-labelledby="about-company">
                        <h2 id="about-company" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">About {company.name}</h2>
                        {company.description
                            ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 dark:text-gray-300">{company.description}</p>
                            : <p className={`text-sm italic ${muted}`}>No description yet.</p>}
                        {website && <p className={`mt-4 flex items-center gap-1 text-sm ${muted}`}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />{hostOf(website)}</p>}
                    </section>

                    <section className="space-y-4 lg:col-span-2 lg:order-1" aria-labelledby="open-roles">
                        <h2 id="open-roles" className="text-lg font-semibold text-gray-900 dark:text-white">
                            Open roles{pagination ? ` (${pagination.total})` : ''}
                        </h2>
                        {jobs === null ? (
                            <p role="alert" className={`${card} p-6 text-sm text-gray-800 dark:text-gray-200`}>We could not load the jobs of this company right now. Reload the page to try again.</p>
                        ) : jobs.length === 0 ? (
                            <div className={`${card} px-6 py-10 text-center`}>
                                <Briefcase className="mx-auto mb-3 h-8 w-8 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                                <p className="text-sm text-gray-800 dark:text-gray-200">No open roles right now.</p>
                                <Link href="/jobs" className={`${btnSecondary} mt-4`}>Browse all jobs</Link>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-4" data-testid="company-jobs">{jobs.map((job) => <JobCard key={job._id} job={job} />)}</div>
                                {pagination && pagination.totalPages > 1 && (
                                    <nav className="flex items-center justify-between gap-3" aria-label="Pages of jobs">
                                        {pagination.page > 1 ? <Link href={pageHref(pagination.page - 1)} className={btnSecondary} rel="prev">Previous</Link> : <span />}
                                        <span className={`text-sm ${muted}`}>Page {pagination.page} of {pagination.totalPages}</span>
                                        {pagination.hasMore ? <Link href={pageHref(pagination.page + 1)} className={btnSecondary} rel="next">Next</Link> : <span />}
                                    </nav>
                                )}
                            </>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
