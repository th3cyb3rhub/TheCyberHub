'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { PageShell } from '@/components/events/PageShell';
import { btnSecondary, card, muted } from '@/components/events/styles';
import { useToast } from '@/context/ToastContext';
import { useMyCompany } from '@/hooks/queries/useJobs';
import type { Company } from '@/types/job';
import { savedChanges } from '@/lib/jobs/display';
import { DetailSkeleton, ErrorState } from '../ListStates';
import { CompanyStatusChip } from '../StatusChips';
import { CompanyForm } from './CompanyForm';
import { ResubmitCompany } from './ResubmitCompany';

/**
 * What the public page shows. The public sees the name, website and logo a reviewer last approved; what
 * the owner saved since waits for a decision. A company nobody approved yet shows what is saved.
 */
function PublicShows({ company }: { company: Company }) {
    const changes = savedChanges(company);
    if (!company.reviewed) {
        return (
            <p className={`mt-3 text-sm ${muted}`} data-testid="public-shows">
                Nobody has approved this profile yet, so the public page shows what you saved. Until a reviewer approves it, a change to the name, website or logo sends your live jobs back to review.
            </p>
        );
    }
    return (
        <div className="mt-3 text-sm text-gray-800 dark:text-gray-200" data-testid="public-shows">
            <p>The public page shows: <strong className="break-words">{company.reviewed.name}</strong></p>
            {changes.length > 0 && (
                <p className={`mt-1 ${muted}`} data-testid="pending-change">
                    Your saved {changes.map((c) => c.field.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1')} {changes.length === 1 ? 'change waits' : 'changes wait'} for a reviewer. Your jobs stay public under the approved details meanwhile.
                </p>
            )}
        </div>
    );
}

/** `/employer/company`: the employer's own profile, its review status and the reviewer's reason */
export function CompanyView() {
    const { addToast } = useToast();
    const query = useMyCompany();
    const company = query.data;

    return (
        <PageShell
            title="Company profile"
            subtitle="This is how your company appears on its jobs and its public page."
            backHref="/employer"
            backLabel="Back to the dashboard"
            actions={company && company.status !== 'rejected' ? <Link href={`/company/${company.slug}`} className={btnSecondary}>View public page <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link> : undefined}
        >
            {query.isLoading ? <DetailSkeleton />
                : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load your company" />
                    : (
                        <div className="space-y-6">
                            {company && (
                                <div className={`${card} p-4`} data-testid="company-review">
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">Review status <CompanyStatusChip status={company.status} /></p>
                                    <p className={`mt-1 text-sm ${muted}`}>
                                        {company.status === 'verified' && 'Verified. Jobs you post go live without waiting for a reviewer.'}
                                        {company.status === 'pending' && 'Waiting for a reviewer. You can post jobs meanwhile; each one is checked before it goes live.'}
                                        {company.status === 'rejected' && 'A reviewer rejected this profile, so you cannot post jobs and the public page is hidden. Saving the profile does not change that: fix it, save, then ask for a new review.'}
                                    </p>
                                    {company.status === 'rejected' && company.moderation?.reason && (
                                        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="company-reject-reason">
                                            <span className="font-medium">Reviewer note:</span> <span className="break-words">{company.moderation.reason}</span>
                                        </p>
                                    )}
                                    {company.status === 'rejected' && <div className="mt-3" data-testid="resubmit-box"><ResubmitCompany /></div>}
                                    {company.status !== 'rejected' && <PublicShows company={company} />}
                                </div>
                            )}
                            <CompanyForm
                                key={company?._id ?? 'new'}
                                mode="profile"
                                company={company}
                                onSaved={(saved) => addToast({
                                    variant: 'success',
                                    message: saved.status === 'rejected' ? 'Saved. The company is still rejected: ask for a new review when the profile is fixed.'
                                        : saved.status === 'pending' ? 'Saved. A reviewer will look at the profile.' : 'Company profile saved.',
                                })}
                            />
                        </div>
                    )}
        </PageShell>
    );
}
