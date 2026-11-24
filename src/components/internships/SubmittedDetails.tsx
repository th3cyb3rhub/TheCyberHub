'use client';

import { ExternalLink } from 'lucide-react';
import { focusRing } from '@/components/events/styles';
import { hostOf, safeHref } from '@/lib/internships/display';
import type { MyApplication } from '@/types/internship';
import { EXTERNAL_REL } from './PastCohorts';

/** What was sent with an application, as plain text; links only when they are http(s) */
export function SubmittedDetails({ application }: { application: Pick<MyApplication, 'coverLetter' | 'answers' | 'githubUrl' | 'linkedinUrl' | 'portfolioUrl' | 'resumeUrl'> }) {
    const links: { name: string; href: string }[] = [];
    for (const [name, url] of [['GitHub', application.githubUrl], ['LinkedIn', application.linkedinUrl], ['Portfolio', application.portfolioUrl], ['Resume', application.resumeUrl]] as const) {
        const href = safeHref(url);
        if (href) links.push({ name, href });
    }
    return (
        <div className="space-y-4 text-sm">
            <div>
                <h4 className="mb-1 font-medium text-gray-900 dark:text-white">Cover letter</h4>
                <p className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">{application.coverLetter}</p>
            </div>
            {links.length > 0 && (
                <div>
                    <h4 className="mb-1 font-medium text-gray-900 dark:text-white">Links</h4>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1">
                        {links.map(({ name, href }) => (
                            <li key={name}><a href={href} target="_blank" rel={EXTERNAL_REL} className={`inline-flex items-center gap-1 rounded text-orange-800 underline dark:text-orange-300 ${focusRing}`}>{name} <ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">({hostOf(href)}, opens in a new tab)</span></a></li>
                        ))}
                    </ul>
                </div>
            )}
            {application.answers.length > 0 && (
                <dl className="space-y-3">
                    {application.answers.map((a) => (
                        <div key={a.field}>
                            <dt className="font-medium text-gray-900 dark:text-white">{a.label}</dt>
                            <dd className="whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">{a.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}

