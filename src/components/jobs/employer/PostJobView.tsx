'use client';

import Link from 'next/link';
import { PageShell } from '@/components/events/PageShell';
import { card, muted } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useMyCompany } from '@/hooks/queries/useJobs';
import { isJobAdmin } from '@/lib/jobs/roles';
import { CompanyStatusChip } from '../StatusChips';
import { JobForm } from './JobForm';

/** A new job. An employer posts for their company; an administrator or owner names the company. */
export function PostJobView() {
    const { user } = useAuth();
    const admin = isJobAdmin(user?.role);
    const { data: company, isLoading } = useMyCompany(!admin);

    return (
        <PageShell title="Post a job" subtitle="Describe the role. A reviewer checks it before it goes public unless your company is verified." backHref="/employer" backLabel="Back to the dashboard">
            {!admin && !isLoading && !company && (
                <div className={`${card} mb-6 p-4 text-sm text-gray-800 dark:text-gray-200`} role="note">
                    You have no company profile yet. <Link href="/employer/company" className="font-medium text-orange-800 underline dark:text-orange-300">Create it first</Link>: it names the employer on the job and the API will ask for it.
                </div>
            )}
            {!admin && company && (
                <p className={`mb-6 flex flex-wrap items-center gap-2 text-sm ${muted}`} data-testid="posting-as">
                    Posting as <span className="font-medium text-gray-900 dark:text-white">{company.name}</span> <CompanyStatusChip status={company.status} />
                </p>
            )}
            <JobForm admin={admin} accountEmail={user?.email} companyName={company?.name} />
        </PageShell>
    );
}
