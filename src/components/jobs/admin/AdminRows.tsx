'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Ban, Building2, CheckCircle2, ChevronDown, ExternalLink, EyeOff, Flag, Lock, Mail, ShieldCheck, ThumbsDown, User } from 'lucide-react';
import { btnPrimary, btnSecondary, card, chip, focusRing, muted } from '@/components/events/styles';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { categoryName, countText, employmentName, excerpt, experienceName, formatSalary, hostOf, LINK_REL, locationText, safeHref, savedChanges } from '@/lib/jobs/display';
import type { AdminCompany, Job, JobPoster } from '@/types/job';
import { JobMarkdown } from '../JobMarkdown';
import { CompanyStatusChip, JobStatusChip } from '../StatusChips';

const small = '!px-3 !py-1.5 !text-xs';

const posterOf = (job: Job): JobPoster | null => (job.postedBy && typeof job.postedBy === 'object' ? job.postedBy : null);

/** The id of whoever posted the job, whether the API sent the poster or only their id */
const posterId = (job: Job): string | null => (typeof job.postedBy === 'string' ? job.postedBy : job.postedBy?._id ?? null);

const OWN_NOTE = 'You posted this. Another reviewer has to decide.';

function List({ title, items }: { title: string; items: string[] }) {
    if (!items?.length) return null;
    return (
        <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{title}</h4>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-800 dark:text-gray-300">{items.map((x, i) => <li key={`${i}-${x}`} className="break-words">{x}</li>)}</ul>
        </div>
    );
}

interface JobRowProps {
    job: Job;
    selectable?: boolean;
    selected?: boolean;
    onSelect?: (job: Job, on: boolean) => void;
    busy: boolean;
    onApprove: (job: Job) => void;
    onReject: (job: Job) => void;
    /** Keep a reported job up and close its reports */
    onDismiss?: (job: Job) => void;
    /** The signed-in reviewer: nobody decides on their own job */
    viewerId?: string | null;
    /** Administrators and owners may take any job down; the reason they give goes to the poster */
    onClose?: (job: Job) => void;
}

/**
 * One job in the review list. The summary is always visible; the full text, the poster and the apply
 * target are one disclosure away, so a reviewer reads the job before deciding. Everything is plain
 * text; the description goes through the sanitised markdown renderer.
 */
export function AdminJobRow({ job, selectable, selected, onSelect, busy, onApprove, onReject, onDismiss, viewerId, onClose }: JobRowProps) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const status = job.status ?? 'pending';
    const poster = posterOf(job);
    const salary = formatSalary(job.salary);
    const apply = safeHref(job.applyUrl);
    const reports = job.reportCount ?? 0;
    // The API refuses a reviewer's decision on their own job (403 SELF_REVIEW), so the buttons are not offered
    const own = !!viewerId && posterId(job) === viewerId;
    const canApprove = !own && (status === 'pending' || status === 'rejected');
    const canReject = !own && (status === 'pending' || status === 'approved');
    const canClose = !!onClose && status !== 'closed' && status !== 'expired';
    const companyName = job.companyRef?.name || job.company;
    const companyStatus = job.companyRef?.status;

    return (
        <li className={`${card} p-4 sm:p-5`} data-testid="admin-job" data-status={status} data-id={job._id}>
            <div className="flex gap-3">
                {selectable && (
                    <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={(e) => onSelect?.(job, e.target.checked)}
                        disabled={busy}
                        aria-label={`Select ${job.title}`}
                        className="mt-1.5 h-4 w-4 shrink-0 accent-orange-600"
                    />
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-[min(100%,16rem)] flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                                <JobStatusChip status={status} audience="reviewer" />
                                {job.heldForReports && <span className={`${chip} bg-red-100 text-red-950 dark:bg-red-500/15 dark:text-red-300`}><EyeOff className="h-3 w-3" aria-hidden="true" /> Held after reports</span>}
                                {reports > 0 && <span className={`${chip} bg-red-100 text-red-950 dark:bg-red-500/15 dark:text-red-300`} data-testid="report-count"><Flag className="h-3 w-3" aria-hidden="true" /> {countText(reports, 'open report')}</span>}
                                {job.isFeatured && <span className={`${chip} bg-orange-100 text-orange-950 dark:bg-orange-500/20 dark:text-orange-300`}>Featured</span>}
                                {job.moderation?.locked && <span className={`${chip} bg-slate-200 text-slate-900 dark:bg-slate-500/20 dark:text-slate-200`} data-testid="job-locked" title="A decision against this job holds: the poster can only send it back to review"><Lock className="h-3 w-3" aria-hidden="true" /> Locked</span>}
                            </div>
                            <h3 className="break-words text-base font-semibold text-gray-900 dark:text-white">{job.title}</h3>
                            <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${muted}`}>
                                <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" aria-hidden="true" />{companyName}</span>
                                {companyStatus && <CompanyStatusChip status={companyStatus} />}
                                <span>{categoryName(job.category)} · {employmentName(job.employmentType)} · {locationText(job)}</span>
                            </p>
                            <p className={`mt-1 text-xs ${muted}`}>Submitted <ViewerTime iso={job.createdAt} />{poster ? <> by {poster.name || poster.username || 'a member'}</> : null}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Decide on ${job.title}`}>
                            {canApprove && (
                                <button type="button" className={`${btnPrimary} ${small}`} disabled={busy} onClick={() => onApprove(job)} data-testid="approve-job">
                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Approve
                                </button>
                            )}
                            {onDismiss && reports > 0 && (
                                <button type="button" className={`${btnSecondary} ${small}`} disabled={busy} onClick={() => onDismiss(job)} data-testid="dismiss-reports">
                                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {status === 'approved' ? 'Dismiss reports' : 'Dismiss and restore'}
                                </button>
                            )}
                            {canReject && (
                                <button type="button" className={`${btnSecondary} ${small} !text-red-800 dark:!text-red-300`} disabled={busy} onClick={() => onReject(job)} data-testid="reject-job">
                                    <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                                </button>
                            )}
                            {canClose && (
                                <button type="button" className={`${btnSecondary} ${small}`} disabled={busy} onClick={() => onClose?.(job)} data-testid="close-job">
                                    <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Close
                                </button>
                            )}
                            {own && <p className={`text-xs ${muted}`} data-testid="own-note">{OWN_NOTE}</p>}
                        </div>
                    </div>

                    <p className="mt-3 line-clamp-2 break-words text-sm text-gray-700 dark:text-gray-300">{excerpt(job.description, 240)}</p>

                    <button
                        type="button"
                        className={`mt-2 inline-flex items-center gap-1 rounded text-sm font-medium text-orange-800 hover:underline dark:text-orange-300 ${focusRing}`}
                        aria-expanded={open}
                        aria-controls={`${id}-detail`}
                        onClick={() => setOpen((o) => !o)}
                        data-testid="toggle-review"
                    >
                        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /> {open ? 'Hide the full job' : 'Read the full job'}
                    </button>

                    {open && (
                        <div id={`${id}-detail`} className="mt-3 space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/60" data-testid="review-detail">
                            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                <div><dt className={`text-xs ${muted}`}>Level</dt><dd className="text-gray-900 dark:text-gray-100">{experienceName(job.experienceLevel)}</dd></div>
                                <div><dt className={`text-xs ${muted}`}>Pay</dt><dd className="text-gray-900 dark:text-gray-100">{salary ?? 'Not given'}</dd></div>
                                <div className="min-w-0">
                                    <dt className={`text-xs ${muted}`}>Apply</dt>
                                    <dd className="break-words text-gray-900 dark:text-gray-100">
                                        {apply ? <a href={apply} target="_blank" rel={LINK_REL} className="inline-flex items-center gap-1 text-orange-800 underline dark:text-orange-300">{hostOf(apply)} <ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
                                            : job.applyEmail ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" aria-hidden="true" />{job.applyEmail}</span>
                                                : <span>No link or email: applicants are sent to the poster&apos;s account email</span>}
                                    </dd>
                                </div>
                                <div className="min-w-0">
                                    <dt className={`text-xs ${muted}`}>Poster</dt>
                                    <dd className="break-words text-gray-900 dark:text-gray-100">{poster ? <span className="inline-flex items-center gap-1"><User className="h-3 w-3" aria-hidden="true" />{poster.name || poster.username}{poster.email ? ` (${poster.email})` : ''}{poster.role ? `, ${poster.role}` : ''}</span> : 'Unknown'}</dd>
                                </div>
                            </dl>
                            {job.moderation?.reason && (
                                <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200">
                                    <span className="font-medium">Last decision:</span> <span className="break-words">{job.moderation.reason}</span>
                                </p>
                            )}
                            <div className="prose-sm max-w-none"><JobMarkdown content={job.description} /></div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <List title="Requirements" items={job.requirements} />
                                <List title="Responsibilities" items={job.responsibilities} />
                                <List title="Skills" items={job.skills} />
                                <List title="Benefits" items={job.benefits} />
                            </div>
                            {job.status === 'approved' && <Link href={`/jobs/${job.slug}`} className={`inline-flex items-center gap-1 text-sm text-orange-800 underline dark:text-orange-300 ${focusRing}`}>Open the public page <ExternalLink className="h-3 w-3" aria-hidden="true" /></Link>}
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}

interface CompanyRowProps {
    company: AdminCompany;
    /** The signed-in reviewer: nobody decides on their own company */
    viewerId?: string | null;
    busy: boolean;
    onApprove: (c: AdminCompany) => void;
    onReject: (c: AdminCompany) => void;
}

const ownerOf = (c: AdminCompany): JobPoster | null => (c.owner && typeof c.owner === 'object' ? c.owner : null);
const ownerId = (c: AdminCompany): string | null => (typeof c.owner === 'string' ? c.owner : c.owner?._id ?? null);

/** One company waiting for, or already past, review */
export function AdminCompanyRow({ company, viewerId, busy, onApprove, onReject }: CompanyRowProps) {
    const owner = ownerOf(company);
    const site = safeHref(company.website);
    const counts = company.jobs ?? {};
    const total = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
    const own = !!viewerId && ownerId(company) === viewerId;
    const changes = savedChanges(company);
    return (
        <li className={`${card} p-4 sm:p-5`} data-testid="admin-company" data-status={company.status} data-id={company._id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[min(100%,16rem)] flex-1">
                    <div className="mb-1"><CompanyStatusChip status={company.status} /></div>
                    <h3 className="break-words text-base font-semibold text-gray-900 dark:text-white">{company.name}</h3>
                    <p className={`mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm ${muted}`}>
                        {company.industry && <span>{company.industry}</span>}
                        {company.size && <span>{company.size} people</span>}
                        {company.location && <span>{company.location}</span>}
                        {site && <a href={site} target="_blank" rel={LINK_REL} className="inline-flex items-center gap-1 text-orange-800 underline dark:text-orange-300">{hostOf(site)} <ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
                    </p>
                    {company.description && <p className="mt-2 line-clamp-3 break-words text-sm text-gray-700 dark:text-gray-300">{excerpt(company.description, 300)}</p>}
                    <p className={`mt-2 text-xs ${muted}`}>
                        {owner ? <>Owner: {owner.name || owner.username}{owner.email ? ` (${owner.email})` : ''}. </> : null}
                        {total > 0 ? `${countText(total, 'job')} in total.` : 'No jobs yet.'}
                        {company.createdAt ? <> Registered <ViewerTime iso={company.createdAt} />.</> : null}
                    </p>
                    {company.reviewed && (
                        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:border-neutral-700 dark:bg-neutral-950/60 dark:text-gray-200" data-testid="company-reviewed">
                            <p><span className="font-medium">The public page shows</span> (last approved): <span className="break-words">{company.reviewed.name}</span></p>
                            {changes.length > 0 ? (
                                <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="company-changes">
                                    {changes.map((c) => <li key={c.field} className="break-words"><span className="font-medium">{c.field}</span> saved as <q>{c.saved}</q>, approved as <q>{c.reviewed}</q></li>)}
                                </ul>
                            ) : <p className={`mt-1 text-xs ${muted}`}>The saved name, website and logo are the approved ones.</p>}
                        </div>
                    )}
                    {!company.reviewed && company.status !== 'verified' && <p className={`mt-2 text-xs ${muted}`}>Nobody has approved this company yet, so the public sees what is saved. A change to its name, website or logo sends its public jobs back to the queue.</p>}
                    {own && <p className={`mt-2 text-xs ${muted}`} data-testid="own-note">This is your company. Another reviewer has to decide.</p>}
                    {company.status === 'rejected' && company.moderation?.reason && <p className="mt-2 text-sm text-gray-800 dark:text-gray-200"><span className="font-medium">Reason given:</span> <span className="break-words">{company.moderation.reason}</span></p>}
                </div>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Decide on ${company.name}`}>
                    {!own && company.status !== 'verified' && (
                        <button type="button" className={`${btnPrimary} ${small}`} disabled={busy} onClick={() => onApprove(company)} data-testid="approve-company">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verify
                        </button>
                    )}
                    {!own && company.status !== 'rejected' && (
                        <button type="button" className={`${btnSecondary} ${small} !text-red-800 dark:!text-red-300`} disabled={busy} onClick={() => onReject(company)} data-testid="reject-company">
                            <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
}
