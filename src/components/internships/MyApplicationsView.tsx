'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ExternalLink, FileText, GraduationCap, Loader2, Undo2 } from 'lucide-react';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { btnSecondary, cardPad, chip, focusRing, muted } from '@/components/events/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMyApplications } from '@/hooks/queries/useInternships';
import { hostOf, safeHref, TYPE_LABELS } from '@/lib/internships/display';
import { canWithdraw } from '@/lib/internships/review';
import { APPLICATION_STATUSES, type ApplicationStatus, type ApplicationCohort, type MyApplication } from '@/types/internship';
import { APPLICATION_STATUS_LABELS } from '@/lib/internships/display';
import { ApplicationProgress, ApplicationTimeline } from './ApplicationTimeline';
import { EXTERNAL_REL } from './PastCohorts';
import { ErrorState, ListSkeleton } from './ListStates';
import { ApplicationStatusBadge, CohortStatusBadge } from './StatusBadges';
import { ViewerTime } from './ViewerTime';
import { WithdrawDialog } from './WithdrawDialog';

const cohortOf = (a: MyApplication): ApplicationCohort | null => (a.cohort && typeof a.cohort === 'object' ? a.cohort : null);

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

function ApplicationCard({ application, onWithdraw }: { application: MyApplication; onWithdraw: (a: MyApplication) => void }) {
    const cohort = cohortOf(application);
    const cohortId = cohort?._id ?? (typeof application.cohort === 'string' ? application.cohort : null);
    return (
        <li className={cardPad} data-testid="my-application" data-status={application.status}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <ApplicationStatusBadge status={application.status} />
                        {cohort && <CohortStatusBadge status={cohort.status} />}
                        {cohort && <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{TYPE_LABELS[cohort.type] ?? cohort.type}</span>}
                    </div>
                    <h2 className="break-words text-lg font-semibold text-gray-900 dark:text-white">
                        {cohortId && cohort ? <Link href={`/internships/${cohortId}`} className={`rounded hover:underline ${focusRing}`}>{cohort.title}</Link> : 'This program was removed'}
                    </h2>
                    <p className={`text-sm ${muted}`}>Applied <ViewerTime iso={application.appliedAt} kind="stamp" /></p>
                </div>
                {canWithdraw(application.status) && (
                    <button type="button" className={btnSecondary} onClick={() => onWithdraw(application)}>
                        <Undo2 className="h-4 w-4" aria-hidden="true" /> Withdraw
                    </button>
                )}
            </div>

            <div className="mb-5"><ApplicationProgress status={application.status} /></div>

            {application.reviewNote && application.status !== 'withdrawn' && (
                <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100" data-testid="review-note">
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide">Note from the reviewer</p>
                    <p className="whitespace-pre-wrap break-words">{application.reviewNote}</p>
                </div>
            )}

            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Timeline</h3>
            <ApplicationTimeline history={application.statusHistory} status={application.status} />

            <details className="group mt-5 rounded-xl border border-gray-200 dark:border-neutral-800">
                <summary className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 dark:text-white ${focusRing}`}>
                    <FileText className="h-4 w-4" aria-hidden="true" /> What you sent
                </summary>
                <div className="border-t border-gray-200 p-4 dark:border-neutral-800"><SubmittedDetails application={application} /></div>
            </details>
        </li>
    );
}

export function MyApplicationsView() {
    const { user, ready } = useRequireLogin('/internships/applications');
    const [status, setStatus] = useState<ApplicationStatus | ''>('');
    const [withdrawing, setWithdrawing] = useState<MyApplication | null>(null);
    const query = useMyApplications(status ? { status } : {}, ready);

    if (!ready || !user) return <FullPageSpinner />;

    const applications = query.data?.pages.flatMap((p) => p.data) ?? [];
    const withdrawingCohort = withdrawing ? cohortOf(withdrawing) : null;

    return (
        <PageShell
            title="My applications"
            subtitle="Where each application stands, and what the reviewers said."
            backHref="/internships"
            backLabel="All programs"
            actions={<Link href="/internships" className={btnSecondary}><GraduationCap className="h-4 w-4" aria-hidden="true" /> Browse programs</Link>}
        >
            <div role="group" aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
                {(['', ...APPLICATION_STATUSES] as const).map((s) => (
                    <button key={s || 'all'} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${status === s
                            ? 'border-orange-700 bg-orange-700 text-white'
                            : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>
                        {s ? APPLICATION_STATUS_LABELS[s] : 'All'}
                    </button>
                ))}
            </div>

            {query.isLoading ? (
                <ListSkeleton label="Loading your applications" />
            ) : query.isError ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load your applications" />
            ) : applications.length === 0 ? (
                <EmptyState
                    icon={GraduationCap}
                    title={status ? 'No applications with this status' : 'You have not applied yet'}
                    description={status ? 'Try another status.' : 'Find a program that fits and send your first application.'}
                    actionLabel={status ? undefined : 'Browse programs'}
                    actionHref={status ? undefined : '/internships'}
                />
            ) : (
                <>
                    <ul className="space-y-5">
                        {applications.map((a) => <ApplicationCard key={a._id} application={a} onWithdraw={setWithdrawing} />)}
                    </ul>
                    {query.hasNextPage && (
                        <div className="mt-8 text-center">
                            <button type="button" className={btnSecondary} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                                {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load more
                            </button>
                        </div>
                    )}
                </>
            )}

            {withdrawing && (
                <WithdrawDialog
                    open
                    onClose={() => setWithdrawing(null)}
                    applicationId={withdrawing._id}
                    cohortId={withdrawingCohort?._id}
                    cohortTitle={withdrawingCohort?.title}
                    accepted={withdrawing.status === 'accepted'}
                />
            )}
        </PageShell>
    );
}
