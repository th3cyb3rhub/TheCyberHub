import type { Metadata } from 'next';
import Link from 'next/link';
import { Briefcase, ShieldCheck } from 'lucide-react';
import { muted, pageBg } from '@/components/events/styles';
import { JobsExplorer } from '@/components/jobs/JobsExplorer';
import { JOB_LIMITS } from '@/lib/jobs/constants';
import { jobsListMetadata } from '@/lib/jobs/metadata';
import { hasJobFilters, parseJobFilters } from '@/lib/jobs/query';
import { fetchJobsPage } from '@/lib/jobs/server';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
    return jobsListMetadata(hasJobFilters(parseJobFilters(await searchParams)));
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const filters = parseJobFilters(await searchParams);
    // Fail-soft: a slow or failing API gives null, and the browser asks again
    const page = await fetchJobsPage(filters, JOB_LIMITS.pageDefault);
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
                <header className="mb-8">
                    <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-orange-800 dark:text-orange-400">
                        <Briefcase className="h-4 w-4" aria-hidden="true" /> Cybersecurity job board
                    </p>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">Find your next security role</h1>
                    <p className={`mt-2 max-w-2xl text-sm ${muted}`}>
                        Penetration testing, SOC, GRC, DevSecOps, cloud security and more, remote or on site.
                    </p>
                    <p className={`mt-2 flex items-center gap-1.5 text-sm ${muted}`}>
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Every posting is reviewed before it appears.
                        <Link href="/employer" className="ml-1 text-orange-800 underline dark:text-orange-400">Hiring? Post a job</Link>
                    </p>
                </header>
                {/* Keyed by the address filters, so a link with other filters starts a fresh list */}
                <JobsExplorer key={JSON.stringify(filters)} initialFilters={filters} initialPage={page} />
            </div>
        </div>
    );
}
