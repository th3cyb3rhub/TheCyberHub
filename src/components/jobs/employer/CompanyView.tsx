'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { PageShell } from '@/components/events/PageShell';
import { btnSecondary, card, muted } from '@/components/events/styles';
import { useToast } from '@/context/ToastContext';
import { useMyCompany } from '@/hooks/queries/useJobs';
import { DetailSkeleton, ErrorState } from '../ListStates';
import { CompanyStatusChip } from '../StatusChips';
import { CompanyForm } from './CompanyForm';

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
                                        {company.status === 'rejected' && 'A reviewer rejected this profile, so you cannot post jobs and the public page is hidden. Fix it and save: that sends it back to review.'}
                                    </p>
                                    {company.status === 'rejected' && company.moderation?.reason && (
                                        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="company-reject-reason">
                                            <span className="font-medium">Reviewer note:</span> <span className="break-words">{company.moderation.reason}</span>
                                        </p>
                                    )}
                                </div>
                            )}
                            <CompanyForm
                                key={company?._id ?? 'new'}
                                mode="profile"
                                company={company}
                                onSaved={(saved) => addToast({ variant: 'success', message: saved.status === 'pending' ? 'Saved. A reviewer will look at the profile.' : 'Company profile saved.' })}
                            />
                        </div>
                    )}
        </PageShell>
    );
}
