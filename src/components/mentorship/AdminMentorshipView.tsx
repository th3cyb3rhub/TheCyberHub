'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CheckCircle2, ClipboardList, Eye, Flag, Slash, UserCheck, XCircle } from 'lucide-react';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { TabBar } from '@/components/events/TabBar';
import { isAdminRole } from '@/lib/events/roles';
import {
    useAdminMentorships, useMentorApplications, useReportContext, useReportedMessages, useReviewMentor, useTerminateMentorship,
} from '@/hooks/queries/useMentorship';
import { displayName, formatDate, spotsLabel } from '@/lib/mentorship/display';
import { mentorshipErrorMessage } from '@/lib/mentorship/errors';
import { LIMITS } from '@/lib/mentorship/schemas';
import { slotView, sortSlots } from '@/lib/mentorship/time';
import { isModeratorRole } from '@/lib/roles';
import type { MentorApplication, MentorStatus, Mentorship } from '@/types/mentorship';
import { MessageBubble } from './ChatPanel';
import { Avatar, EmptyBlock, ErrorState, ExpertiseChips, LoadMore, MentorshipStatusChip, MentorStatusChip, Modal, ReasonDialog, RowSkeleton } from './shared';
import { btnPrimary, btnSecondary, card, input, label as labelClass, muted } from './styles';

const STATUS_FILTERS: { id: MentorStatus | 'all'; label: string }[] = [
    { id: 'pending', label: 'Pending' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }, { id: 'suspended', label: 'Suspended' }, { id: 'all', label: 'All' },
];

function Filters<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
    return (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={label}>
            {options.map((o) => (
                <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={`rounded-full border px-3 py-1 text-sm ${value === o.id ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>{o.label}</button>
            ))}
        </div>
    );
}

type Review = { app: MentorApplication; decision: 'approve' | 'reject' | 'suspend' } | null;

function ReviewDialog({ review, onClose }: { review: NonNullable<Review>; onClose: () => void }) {
    const mutation = useReviewMentor();
    const [note, setNote] = useState('');
    const [end, setEnd] = useState(false);
    const needNote = review.decision !== 'approve';
    const title = review.decision === 'approve' ? 'Approve this mentor' : review.decision === 'reject' ? 'Reject this application' : 'Suspend this mentor';
    const trimmed = note.trim();
    return (
        <Modal open onOpenChange={(o) => !o && onClose()} title={title} description={`${displayName(review.app.user)} (@${review.app.user.username})${needNote ? '. The note is shown to the applicant.' : ''}`}
            confirmLabel={review.decision === 'approve' ? 'Approve' : review.decision === 'reject' ? 'Reject' : 'Suspend'} destructive={review.decision !== 'approve'} pending={mutation.isPending}
            confirmDisabled={needNote && trimmed.length < 3} error={mutation.error ? mentorshipErrorMessage(mutation.error) : null}
            onConfirm={() => mutation.mutate({ id: review.app._id, decision: review.decision, note: trimmed, endMentorships: review.decision === 'suspend' ? end : undefined }, { onSuccess: onClose })}>
            <label htmlFor="review-note" className={labelClass}>Note{needNote ? '' : ' (optional)'}</label>
            <textarea id="review-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={`${input} resize-none`} />
            <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{trimmed.length}/500</p>
            {review.decision === 'suspend' && (
                <label className="mt-3 flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                    <input type="checkbox" checked={end} onChange={(e) => setEnd(e.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" /> Also end this mentor&apos;s open mentorships
                </label>
            )}
        </Modal>
    );
}

function Applications({ viewerId }: { viewerId: string }) {
    const [status, setStatus] = useState<MentorStatus | 'all'>('pending');
    const [review, setReview] = useState<Review>(null);
    const query = useMentorApplications(status);
    const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
    return (
        <>
            <Filters value={status} options={STATUS_FILTERS} onChange={setStatus} label="Application status" />
            {query.isLoading ? <RowSkeleton count={3} label="Loading applications" /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load applications" /> : rows.length === 0 ? (
                <EmptyBlock icon={ClipboardList} title={status === 'pending' ? 'No applications waiting' : 'Nothing here'}>New mentor applications show up here for review.</EmptyBlock>
            ) : (
                <>
                    <ul className="space-y-4" data-testid="applications">
                        {rows.map((app) => {
                            const own = app.user._id === viewerId;
                            return (
                                <li key={app._id} className={`${card} p-5`} data-testid="application" data-status={app.status}>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <Avatar person={app.user} size={44} />
                                            <div><p className="font-medium text-gray-900 dark:text-white">{displayName(app.user)}</p><p className={`text-xs ${muted}`}>@{app.user.username}{typeof app.user.points === 'number' ? ` · ${app.user.points} points` : ''} · applied {formatDate(app.createdAt)}</p></div>
                                        </div>
                                        <MentorStatusChip status={app.status} />
                                    </div>
                                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">{app.bio}</p>
                                    <ExpertiseChips areas={app.expertiseAreas} className="mt-3" />
                                    <p className={`mt-3 text-xs ${muted}`}>{app.availability.hoursPerWeek} hours a week · up to {app.maxMentees} mentees · {app.availability.timezone}</p>
                                    {app.availability.preferredTimes.length > 0 && <p className={`text-xs ${muted}`}>{sortSlots(app.availability.preferredTimes).map((s) => slotView(s, app.availability.timezone, null, new Date()).mentor).join(' · ')}</p>}
                                    {app.reviewNote && <p className="mt-3 rounded-lg bg-gray-100 p-3 text-sm text-gray-800 dark:bg-neutral-800 dark:text-gray-200">Note: {app.reviewNote}</p>}
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        {own ? <span className={`text-xs ${muted}`} data-testid="own-application">This is your own application: another admin reviews it.</span> : (
                                            <>
                                                {app.status !== 'approved' && <button type="button" className={btnPrimary} onClick={() => setReview({ app, decision: 'approve' })}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve<span className="sr-only"> {displayName(app.user)}</span></button>}
                                                {app.status === 'pending' && <button type="button" className={btnSecondary} onClick={() => setReview({ app, decision: 'reject' })}><XCircle className="h-4 w-4" aria-hidden="true" /> Reject<span className="sr-only"> {displayName(app.user)}</span></button>}
                                                {app.status === 'approved' && <button type="button" className={btnSecondary} onClick={() => setReview({ app, decision: 'suspend' })}><Slash className="h-4 w-4" aria-hidden="true" /> Suspend<span className="sr-only"> {displayName(app.user)}</span></button>}
                                            </>
                                        )}
                                        {app.status === 'approved' && <Link href={`/mentorship/mentor/${app._id}`} className="text-sm font-medium text-orange-800 hover:underline dark:text-orange-400">Public profile ({spotsLabel(app)})</Link>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />
                </>
            )}
            {review && <ReviewDialog review={review} onClose={() => setReview(null)} />}
        </>
    );
}

const MENTORSHIP_FILTERS = [
    { id: 'all', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'completed', label: 'Completed' }, { id: 'terminated', label: 'Ended by staff' },
];

function Mentorships() {
    const [status, setStatus] = useState('open');
    const [target, setTarget] = useState<Mentorship | null>(null);
    const query = useAdminMentorships(status);
    const terminate = useTerminateMentorship();
    const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
    return (
        <>
            <Filters value={status} options={MENTORSHIP_FILTERS} onChange={setStatus} label="Mentorship status" />
            {query.isLoading ? <RowSkeleton count={3} label="Loading mentorships" /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load mentorships" /> : rows.length === 0 ? (
                <EmptyBlock icon={UserCheck} title="No mentorships">Mentorships appear here once a mentor accepts a request. Chat and notes are never shown.</EmptyBlock>
            ) : (
                <>
                    <ul className="space-y-3" data-testid="admin-mentorships">
                        {rows.map((m) => {
                            const open = m.status === 'active' || m.status === 'paused';
                            return (
                                <li key={m._id} className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`} data-testid="admin-mentorship" data-status={m.status}>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{displayName(m.mentor)} <span className={muted}>mentors</span> {displayName(m.mentee)}</p>
                                        <p className={`text-xs ${muted}`}>Started {formatDate(m.startDate)} · {open ? `ends ${formatDate(m.expectedEndDate)}` : `ended ${formatDate(m.actualEndDate ?? m.expectedEndDate)}`} · {m.sessionsCompleted} sessions held</p>
                                    </div>
                                    <div className="flex items-center gap-3"><MentorshipStatusChip status={m.status} />
                                        {open && <button type="button" className={btnSecondary} onClick={() => setTarget(m)}>End<span className="sr-only"> the mentorship of {displayName(m.mentor)} and {displayName(m.mentee)}</span></button>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />
                </>
            )}
            <ReasonDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)} title="End this mentorship" description="Both people are told that staff ended it. The reason stays internal and is written to the audit log." fieldLabel="Reason" min={3} max={LIMITS.reason.max} confirmLabel="End mentorship" destructive
                pending={terminate.isPending} error={terminate.error ? mentorshipErrorMessage(terminate.error) : null} onConfirm={(reason) => target && terminate.mutate({ id: target._id, reason }, { onSuccess: () => setTarget(null) })} />
        </>
    );
}

function ContextDialog({ flagId, onClose }: { flagId: string; onClose: () => void }) {
    const query = useReportContext(flagId);
    return (
        <Modal open onOpenChange={(o) => !o && onClose()} size="lg" asForm={false} title="Reported message in context" description="The reported message with up to 5 messages before and after. Opening this is written to the audit log.">
            {query.isLoading ? <RowSkeleton count={3} label="Loading the conversation" /> : query.isError ? <ErrorState error={query.error} title="Could not open the conversation" /> : query.data ? (
                <div>
                    <p className={`mb-3 text-sm ${muted}`}>Reason: {query.data.flag.reason}{query.data.flag.details ? `. ${query.data.flag.details}` : ''}</p>
                    {query.data.messages.length === 0 ? <p className={`text-sm ${muted}`}>There is nothing to show for this report.</p> : (
                        <ul className="space-y-3" data-testid="context-messages">
                            {query.data.messages.map((m) => (
                                <li key={m._id} className={`rounded-xl p-2 ${m.reported ? 'border border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10' : ''}`} data-reported={!!m.reported}>
                                    {m.reported && <p className="mb-1 flex items-center gap-1 text-xs font-medium text-red-800 dark:text-red-300"><Flag className="h-3 w-3" aria-hidden="true" /> Reported message</p>}
                                    <ul><MessageBubble message={m} mine={false} zone="UTC" /></ul>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className={`mt-4 text-sm ${muted}`}>To hide the message or dismiss the report, use the <Link href="/admin/moderation" className="font-medium text-orange-800 underline dark:text-orange-400">moderation queue</Link>.</p>
                </div>
            ) : null}
        </Modal>
    );
}

function Reports() {
    const query = useReportedMessages();
    const [flagId, setFlagId] = useState<string | null>(null);
    const items = query.data?.items ?? [];
    return (
        <>
            {query.isLoading ? <RowSkeleton count={3} label="Loading reports" /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load reports" /> : items.length === 0 ? (
                <EmptyBlock icon={Flag} title="No reported messages">Reported mentorship messages wait here until a moderator decides. Reports of mentorships and mentors are in the moderation queue.</EmptyBlock>
            ) : (
                <ul className="space-y-3" data-testid="reports">
                    {items.map((item) => (
                        <li key={`${item.contentType}:${item.contentId}`} className={`${card} p-4`} data-testid="report-row">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0"><p className="text-sm font-medium text-gray-900 dark:text-white">{item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'} · {item.reasons.map((r) => r.reason.replace('_', ' ')).join(', ')}</p><p className={`text-xs ${muted}`}>First reported {formatDate(item.firstReportedAt)}</p></div>
                                <button type="button" className={btnPrimary} disabled={!item.flagIds[0]} onClick={() => setFlagId(item.flagIds[0])}><Eye className="h-4 w-4" aria-hidden="true" /> View context</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {flagId && <ContextDialog flagId={flagId} onClose={() => setFlagId(null)} />}
            <p className={`mt-6 text-xs ${muted}`}>Decisions on reported messages (hide, restore, dismiss) are made in the <Link href="/admin/moderation" className="underline">moderation queue</Link>.</p>
        </>
    );
}

function Screen() {
    const { user, ready } = useRequireLogin('/admin/mentorship');
    const params = useSearchParams();
    const router = useRouter();
    if (!ready || !user) return <FullPageSpinner />;
    const admin = isAdminRole(user.role);
    const moderator = isModeratorRole(user.role);
    if (!moderator) return <NoAccess message="Only moderators and admins can open the mentorship admin." href="/" label="Back home" />;

    const tabs = [
        ...(admin ? [{ id: 'applications', label: 'Applications' }, { id: 'mentorships', label: 'Mentorships' }] : []),
        { id: 'reports', label: 'Reports' },
    ];
    const requested = params.get('tab');
    const tab = tabs.some((t) => t.id === requested) ? (requested as string) : tabs[0].id;

    return (
        <PageShell wide title="Mentorship admin" subtitle="Review mentor applications, oversee mentorships and open reported messages." backHref="/admin" backLabel="Admin">
            <div className="mb-6"><TabBar tabs={tabs} active={tab} onChange={(id) => router.replace(`/admin/mentorship?tab=${id}`, { scroll: false })} label="Mentorship admin sections" idPrefix="admin-mentorship" /></div>
            <div id="admin-mentorship-panel" role="tabpanel" aria-labelledby={`admin-mentorship-${tab}`}>
                {tab === 'applications' && admin && <Applications viewerId={user.id} />}
                {tab === 'mentorships' && admin && <Mentorships />}
                {tab === 'reports' && <Reports />}
            </div>
        </PageShell>
    );
}

export function AdminMentorshipView() {
    return <Suspense fallback={<FullPageSpinner />}><Screen /></Suspense>;
}
