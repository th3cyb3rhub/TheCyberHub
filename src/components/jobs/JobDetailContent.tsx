import Link from 'next/link';
import { ArrowLeft, Briefcase, Building2, Calendar, CheckCircle2, ExternalLink, Gift, Globe, MapPin, Sparkles, Wallet } from 'lucide-react';
import { card, chip, focusRing, muted, pageBg } from '@/components/events/styles';
import { ViewerTime } from '@/components/internships/ViewerTime';
import {
    categoryName, employmentName, experienceName, formatSalary, hostOf, LINK_REL, locationText, safeHref,
} from '@/lib/jobs/display';
import type { Job } from '@/types/job';
import { CompanyLogo } from './CompanyLogo';
import { JobMarkdown } from './JobMarkdown';

const EMPLOYMENT_TONE: Record<string, string> = {
    'full-time': 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300',
    'part-time': 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300',
    contract: 'bg-yellow-100 text-yellow-950 dark:bg-yellow-500/15 dark:text-yellow-300',
    freelance: 'bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-300',
    internship: 'bg-cyan-100 text-cyan-950 dark:bg-cyan-500/15 dark:text-cyan-300',
};

export const employmentTone = (type: string) => EMPLOYMENT_TONE[type] ?? 'bg-gray-200 text-gray-900 dark:bg-neutral-700/60 dark:text-gray-200';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className={`${card} p-5 sm:p-6`}>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            {children}
        </section>
    );
}

function Bullets({ items, tone }: { items: string[]; tone: string }) {
    return (
        <ul className="space-y-2.5">
            {items.map((item, i) => (
                <li key={`${i}-${item}`} className="flex items-start gap-3 text-sm text-gray-800 dark:text-gray-200">
                    <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${tone}`} aria-hidden="true" />
                    <span className="min-w-0 break-words">{item}</span>
                </li>
            ))}
        </ul>
    );
}

interface Props {
    job: Job;
    /** The apply, save, share and report island */
    actions: React.ReactNode;
    /** The call to action under the facts of the sidebar */
    sidebarAction?: React.ReactNode;
    /** What only the poster and reviewers see, above the header */
    banner?: React.ReactNode;
}

/**
 * A job page, with no state of its own, so the server renders it and crawlers read it. Everything
 * the poster wrote is text: the description goes through the escaping markdown path, the lists are
 * plain text nodes, and every outbound link is checked for http or https and carries `rel`.
 */
export function JobDetailContent({ job, actions, sidebarAction, banner }: Props) {
    const salary = formatSalary(job.salary);
    const website = safeHref(job.companyRef?.website ?? job.companyWebsite);
    const companyName = job.companyRef?.name || job.company;
    return (
        <div className={pageBg}>
            <article className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6" aria-labelledby="job-title">
                <Link href="/jobs" className={`mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${focusRing}`}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All jobs
                </Link>
                {banner}
                <header className={`${card} p-5 sm:p-6`}>
                    <div className="flex flex-col gap-5 sm:flex-row">
                        <CompanyLogo src={job.companyRef?.logo || job.companyLogo} name={companyName} size="lg" />
                        <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                {job.isFeatured && <span className={`${chip} bg-orange-100 text-orange-950 dark:bg-orange-500/20 dark:text-orange-300`}><Sparkles className="h-3 w-3" aria-hidden="true" /> Featured</span>}
                                <span className={`${chip} ${employmentTone(job.employmentType)}`}>{employmentName(job.employmentType)}</span>
                                {job.companyRef?.isVerified && <span className={`${chip} bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300`}><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Verified company</span>}
                            </div>
                            <h1 id="job-title" className="break-words text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">{job.title}</h1>
                            <p className="mt-1 text-base text-gray-800 dark:text-gray-200">
                                {job.companyRef ? (
                                    <Link href={`/company/${job.companyRef.slug}`} className={`rounded font-medium hover:underline ${focusRing}`}>{companyName}</Link>
                                ) : companyName}
                            </p>
                            <ul className={`mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm ${muted}`} aria-label="Job facts">
                                <li className="flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" />{locationText(job)}</li>
                                <li className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" aria-hidden="true" />{experienceName(job.experienceLevel)}</li>
                                {salary && <li className="flex items-center gap-1.5 font-medium text-green-800 dark:text-green-400"><Wallet className="h-4 w-4" aria-hidden="true" />{salary}</li>}
                                <li className="flex items-center gap-1.5"><Calendar className="h-4 w-4" aria-hidden="true" />Posted <ViewerTime iso={job.createdAt} /></li>
                            </ul>
                        </div>
                    </div>
                    <div className="mt-6 border-t border-gray-100 pt-5 dark:border-neutral-800">{actions}</div>
                </header>

                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                        <Section title="About the role">
                            <JobMarkdown content={job.description} />
                        </Section>
                        {job.requirements.length > 0 && <Section title="Requirements"><Bullets items={job.requirements} tone="text-green-700 dark:text-green-400" /></Section>}
                        {job.responsibilities.length > 0 && <Section title="Responsibilities"><Bullets items={job.responsibilities} tone="text-orange-700 dark:text-orange-400" /></Section>}
                        {job.benefits.length > 0 && (
                            <Section title="Benefits and perks">
                                <ul className="flex flex-wrap gap-2">
                                    {job.benefits.map((b, i) => (
                                        <li key={`${i}-${b}`} className="flex items-center gap-1.5 rounded-lg bg-green-100 px-3 py-1.5 text-sm text-green-900 dark:bg-green-500/15 dark:text-green-300"><Gift className="h-3.5 w-3.5" aria-hidden="true" />{b}</li>
                                    ))}
                                </ul>
                            </Section>
                        )}
                    </div>

                    <aside className="space-y-6" aria-label="About this job">
                        <section className={`${card} p-5`}>
                            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-400">Job details</h2>
                            <dl className="space-y-3 text-sm">
                                <div><dt className={muted}>Category</dt><dd className="text-gray-900 dark:text-white">{categoryName(job.category)}</dd></div>
                                <div><dt className={muted}>Experience</dt><dd className="text-gray-900 dark:text-white">{experienceName(job.experienceLevel)}</dd></div>
                                <div><dt className={muted}>Employment</dt><dd className="text-gray-900 dark:text-white">{employmentName(job.employmentType)}</dd></div>
                                <div><dt className={muted}>Location</dt><dd className="text-gray-900 dark:text-white">{locationText(job)}</dd></div>
                                {salary && <div><dt className={muted}>Pay</dt><dd className="font-medium text-green-800 dark:text-green-400">{salary}</dd></div>}
                                {job.applicationDeadline && <div><dt className={muted}>Apply by</dt><dd className="text-gray-900 dark:text-white"><ViewerTime iso={job.applicationDeadline} /></dd></div>}
                            </dl>
                        </section>

                        {job.skills.length > 0 && (
                            <section className={`${card} p-5`}>
                                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-400">Skills</h2>
                                <ul className="flex flex-wrap gap-2">
                                    {job.skills.map((s, i) => <li key={`${i}-${s}`} className="rounded-full bg-orange-100 px-3 py-1 text-sm text-orange-950 dark:bg-orange-500/15 dark:text-orange-300">{s}</li>)}
                                </ul>
                            </section>
                        )}

                        <section className={`${card} p-5`}>
                            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-400">About {companyName}</h2>
                            {job.companyDescription && <p className="mb-4 whitespace-pre-line break-words text-sm text-gray-800 dark:text-gray-200">{job.companyDescription}</p>}
                            <div className="space-y-2">
                                {website && (
                                    <a href={website} target="_blank" rel={LINK_REL} className={`flex items-center justify-between rounded-xl border border-gray-200 p-3 text-sm text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:text-gray-200 dark:hover:bg-neutral-800 ${focusRing}`}>
                                        <span className="flex min-w-0 items-center gap-2"><Globe className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{hostOf(website)}</span></span>
                                        <ExternalLink className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
                                    </a>
                                )}
                                {job.companyRef && (
                                    <Link href={`/company/${job.companyRef.slug}`} className={`flex items-center justify-between rounded-xl border border-gray-200 p-3 text-sm text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:text-gray-200 dark:hover:bg-neutral-800 ${focusRing}`}>
                                        <span className="flex items-center gap-2"><Building2 className="h-4 w-4" aria-hidden="true" /> Company profile and other jobs</span>
                                    </Link>
                                )}
                            </div>
                        </section>

                        {sidebarAction && (
                            <section className="rounded-2xl border border-orange-300 bg-orange-50 p-5 dark:border-orange-500/30 dark:bg-orange-500/5" aria-label="Apply">
                                <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">Interested in this role?</h2>
                                <p className={`mb-4 text-sm ${muted}`}>You apply on the employer&apos;s own site. Never pay to apply: report a job that asks for money.</p>
                                {sidebarAction}
                            </section>
                        )}
                    </aside>
                </div>
            </article>
        </div>
    );
}
