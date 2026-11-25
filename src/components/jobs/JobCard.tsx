import { IntentLink } from '@/components/ui/IntentLink';
import { Briefcase, Clock, MapPin, Sparkles, Wallet } from 'lucide-react';
import { card, chip, focusRing, muted } from '@/components/events/styles';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { employmentName, excerpt, experienceName, formatSalary, locationText } from '@/lib/jobs/display';
import type { JobCard as Card } from '@/types/job';
import { CompanyLogo } from './CompanyLogo';
import { employmentTone } from './JobDetailContent';

/**
 * One row of a job list. The title is the link; the save button, when there is one, sits beside the
 * card rather than inside the link, so the control and the link stay separate for keyboards and
 * screen readers.
 */
export function JobCard({ job, saveSlot }: { job: Card; saveSlot?: React.ReactNode }) {
    const salary = formatSalary(job.salary);
    const name = job.companyRef?.name || job.company;
    return (
        <article className={`${card} relative p-5 transition-colors hover:border-gray-300 dark:hover:border-neutral-700 ${job.isFeatured ? 'border-orange-300 dark:border-orange-500/40' : ''}`} data-testid="job-card" data-featured={job.isFeatured || undefined}>
            <div className="flex gap-4">
                <CompanyLogo src={job.companyRef?.logo || job.companyLogo} name={name} />
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        {job.isFeatured && <span className={`${chip} bg-orange-100 text-orange-950 dark:bg-orange-500/20 dark:text-orange-300`}><Sparkles className="h-3 w-3" aria-hidden="true" /> Featured</span>}
                        <span className={`${chip} ${employmentTone(job.employmentType)}`}>{employmentName(job.employmentType)}</span>
                    </div>
                    <h2 className="break-words pr-10 text-lg font-semibold text-gray-900 dark:text-white">
                        <IntentLink href={`/jobs/${job.slug || job._id}`} className={`rounded hover:underline ${focusRing}`}>{job.title}</IntentLink>
                    </h2>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{name}</p>
                    <ul className={`mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm ${muted}`} aria-label="Job facts">
                        <li className="flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" />{locationText(job)}</li>
                        <li className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" aria-hidden="true" />{experienceName(job.experienceLevel)}</li>
                        {salary && <li className="flex items-center gap-1.5 font-medium text-green-800 dark:text-green-400"><Wallet className="h-4 w-4" aria-hidden="true" />{salary}</li>}
                        <li className="flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" /><ViewerTime iso={job.createdAt} /></li>
                    </ul>
                    {job.description && <p className="mt-3 line-clamp-2 break-words text-sm text-gray-700 dark:text-gray-300">{excerpt(job.description, 200)}</p>}
                    {job.skills.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Skills">
                            {job.skills.slice(0, 5).map((s, i) => <li key={`${i}-${s}`} className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs text-gray-800 dark:bg-neutral-800 dark:text-gray-300">{s}</li>)}
                            {job.skills.length > 5 && <li className={`px-1 py-1 text-xs ${muted}`}>+{job.skills.length - 5} more</li>}
                        </ul>
                    )}
                </div>
            </div>
            {saveSlot && <div className="absolute right-3 top-3">{saveSlot}</div>}
        </article>
    );
}
