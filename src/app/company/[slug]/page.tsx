import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompanyProfile } from '@/components/jobs/CompanyProfile';
import { RefreshButton } from '@/components/jobs/RefreshButton';
import { btnSecondary, card, pageBg } from '@/components/events/styles';
import { companyMetadata } from '@/lib/jobs/metadata';
import { fetchCompany, fetchCompanyJobs } from '@/lib/jobs/server';
import Link from 'next/link';

interface PageProps {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ page?: string | string[] }>;
}

const pageOf = (raw: string | string[] | undefined): number => {
    const n = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
};

export async function generateMetadata({ params }: Pick<PageProps, 'params'>): Promise<Metadata> {
    const { slug } = await params;
    // The same request as the page below (`fetchCompany` is cached per render). A company that is
    // missing, rejected or unreachable stays out of search results.
    const result = await fetchCompany(slug);
    return companyMetadata(result.state === 'ok' ? result.company : null);
}

export default async function CompanyPage({ params, searchParams }: PageProps) {
    const { slug } = await params;
    const page = pageOf((await searchParams).page);
    const result = await fetchCompany(slug);

    if (result.state === 'invalid' || result.state === 'missing') notFound();
    if (result.state === 'error') {
        return (
            <div className={pageBg}>
                <div className="mx-auto max-w-md px-4 pt-32 text-center">
                    <div className={`${card} p-8`} role="alert">
                        <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">We could not load this company</h1>
                        <p className="mb-5 text-sm text-gray-700 dark:text-gray-300">The jobs service did not answer. Nothing is lost: try again in a moment.</p>
                        <div className="flex justify-center gap-3"><RefreshButton /><Link href="/jobs" className={btnSecondary}>Browse jobs</Link></div>
                    </div>
                </div>
            </div>
        );
    }

    const { company } = result;
    const jobs = await fetchCompanyJobs(company.slug, page);
    return (
        <CompanyProfile
            company={company}
            jobs={jobs ? jobs.data : null}
            pagination={jobs?.pagination}
            pageHref={(p) => (p > 1 ? `/company/${company.slug}?page=${p}` : `/company/${company.slug}`)}
        />
    );
}
