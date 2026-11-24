'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, ExternalLink, Flag, Hourglass, PauseCircle, PlayCircle, Star, UserX } from 'lucide-react';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { TabBar } from '@/components/events/TabBar';
import {
    useCompleteMentorship, useExtendMentorship, useFinalFeedback, useLiveMentorship, useMentorship, useMentorshipFeedback,
    useReport, useSessions, useToggleMentorshipPause,
} from '@/hooks/queries/useMentorship';
import { useViewerZone } from '@/lib/events/clock';
import { displayName, formatDate, safeMeetingUrl } from '@/lib/mentorship/display';
import { isNotFound, mentorshipErrorMessage } from '@/lib/mentorship/errors';
import { LIMITS } from '@/lib/mentorship/schemas';
import { sessionTimes } from '@/lib/mentorship/time';
import type { Mentorship } from '@/types/mentorship';
import { ChatPanel } from './ChatPanel';
import { FeedbackDialog, ReportDialog } from './FeedbackDialog';
import { SessionsPanel } from './SessionsPanel';
import { Avatar, EmptyBlock, ErrorState, ExpertiseChips, Modal, MentorshipStatusChip, ReasonDialog, RatingStars, RowSkeleton, Skeleton } from './shared';
import { btnPrimary, btnSecondary, card, cardPad, muted, label as labelClass, input } from './styles';

const TABS = ['overview', 'messages', 'sessions', 'feedback'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => !!v && (TABS as readonly string[]).includes(v);

function NextSession({ mentorship }: { mentorship: Mentorship }) {
    const sessions = useSessions(mentorship._id, 'upcoming');
    const zone = useViewerZone();
    const next = sessions.data?.data.filter((s) => s.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
    if (sessions.isLoading) return <Skeleton className="h-20 w-full" />;
    if (!next) return <p className={`text-sm ${muted}`}>No session is scheduled.</p>;
    const t = sessionTimes(next.scheduledAt, next.timezone, zone);
    const link = safeMeetingUrl(next.meetingUrl);
    return (
        <div data-testid="next-session">
            <p className="font-medium text-gray-900 dark:text-white">{next.title}</p>
            <p className="text-sm text-gray-800 dark:text-gray-200">{t.primary}</p>
            {t.secondary && <p className={`text-xs ${muted}`}>Planned in {next.timezone}: {t.secondary}</p>}
            {link && <a href={link} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} mt-3`}><ExternalLink className="h-4 w-4" aria-hidden="true" /> Join the call<span className="sr-only"> (opens in a new tab)</span></a>}
        </div>
    );
}

function ExtendDialog({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (open: boolean) => void }) {
    const extend = useExtendMentorship(id, { inline: true });
    const [months, setMonths] = useState(1);
    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Extend the mentorship" description="A mentorship can last 6 months in all. Sessions can then be scheduled until the new end date." confirmLabel="Extend" pending={extend.isPending}
            error={extend.error ? mentorshipErrorMessage(extend.error) : null} onConfirm={() => extend.mutate({ months }, { onSuccess: () => onOpenChange(false) })}>
            <label htmlFor="extend-months" className={labelClass}>Extend by</label>
            <select id="extend-months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={input}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'month' : 'months'}</option>)}
            </select>
        </Modal>
    );
}

type Dialog = 'pause' | 'extend' | 'complete' | 'report' | 'report-mentor' | 'final' | null;

function Overview({ mentorship, onOpenTab }: { mentorship: Mentorship; onOpenTab: (tab: Tab) => void }) {
    const [dialog, setDialog] = useState<Dialog>(null);
    const pause = useToggleMentorshipPause(mentorship._id, { inline: true });
    const complete = useCompleteMentorship(mentorship._id, { inline: true });
    const final = useFinalFeedback(mentorship._id, { inline: true });
    const report = useReport(mentorship._id);
    const v = mentorship.viewer;
    const mentee = v.role === 'mentee';
    const partner = mentee ? mentorship.mentor : mentorship.mentee;

    return (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-6">
                {mentorship.status === 'paused' && (
                    <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" data-testid="paused-banner">
                        <PauseCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        <div><p className="font-medium">This mentorship is paused.</p><p>No sessions or messages until it is resumed.{mentorship.pauseReason ? ` Reason: ${mentorship.pauseReason}` : ''}</p></div>
                    </div>
                )}
                {mentorship.status === 'terminated' && <div role="status" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200" data-testid="ended-banner">Staff ended this mentorship. The chat is read-only.</div>}
                {mentorship.status === 'completed' && <div role="status" className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200" data-testid="completed-banner">This mentorship is completed{mentorship.actualEndDate ? ` (${formatDate(mentorship.actualEndDate)})` : ''}. The chat is read-only.</div>}

                {v.canGiveFinalFeedback && (
                    <div className={`${cardPad} flex flex-wrap items-center justify-between gap-3`} data-testid="final-feedback-prompt">
                        <div><p className="font-medium text-gray-900 dark:text-white">How was this mentorship?</p><p className={`text-sm ${muted}`}>Leave your final feedback. You see theirs once you have given yours.</p></div>
                        <button type="button" className={btnPrimary} onClick={() => setDialog('final')}><Star className="h-4 w-4" aria-hidden="true" /> Give feedback</button>
                    </div>
                )}

                <section className={cardPad} aria-labelledby="goals-heading">
                    <h2 id="goals-heading" className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Goals</h2>
                    {mentorship.goals ? <p className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">{mentorship.goals}</p> : <p className={`text-sm ${muted}`}>No goals were recorded.</p>}
                    <ExpertiseChips areas={mentorship.expertiseAreas} className="mt-3" />
                </section>

                <section className={cardPad} aria-labelledby="next-heading">
                    <div className="mb-3 flex items-center justify-between"><h2 id="next-heading" className="text-lg font-semibold text-gray-900 dark:text-white">Next session</h2><button type="button" className="text-sm font-medium text-orange-800 hover:underline dark:text-orange-400" onClick={() => onOpenTab('sessions')}>All sessions</button></div>
                    <NextSession mentorship={mentorship} />
                </section>
            </div>

            <aside className="space-y-6" aria-label="About this mentorship">
                <div className={cardPad}>
                    <div className="flex items-center gap-3"><Avatar person={partner} size={44} /><div><p className="font-medium text-gray-900 dark:text-white">{displayName(partner)}</p><p className={`text-xs ${muted}`}>{mentee ? 'Your mentor' : 'Your mentee'}</p></div></div>
                    <dl className="mt-4 space-y-2 text-sm">
                        <div className="flex justify-between"><dt className={muted}>Started</dt><dd className="text-gray-900 dark:text-white">{formatDate(mentorship.startDate)}</dd></div>
                        <div className="flex justify-between"><dt className={muted}>{mentorship.status === 'completed' || mentorship.status === 'terminated' ? 'Ended' : 'Ends'}</dt><dd className="text-gray-900 dark:text-white">{formatDate(mentorship.actualEndDate ?? mentorship.expectedEndDate)}</dd></div>
                        {(mentorship.status === 'active' || mentorship.status === 'paused') && <div className="flex justify-between"><dt className={muted}>Days left</dt><dd className="text-gray-900 dark:text-white">{mentorship.daysRemaining}</dd></div>}
                        <div className="flex justify-between"><dt className={muted}>Sessions held</dt><dd className="text-gray-900 dark:text-white">{mentorship.sessionsCompleted}</dd></div>
                        <div className="flex justify-between"><dt className={muted}>Hours together</dt><dd className="text-gray-900 dark:text-white">{mentorship.totalHours}</dd></div>
                    </dl>
                </div>

                <div className={`${cardPad} space-y-2`} aria-label="Actions">
                    {v.canPause && <button type="button" className={`${btnSecondary} w-full`} onClick={() => setDialog('pause')}><PauseCircle className="h-4 w-4" aria-hidden="true" /> Pause</button>}
                    {v.canResume && <button type="button" className={`${btnPrimary} w-full`} disabled={pause.isPending} onClick={() => pause.mutate({ pause: false })}><PlayCircle className="h-4 w-4" aria-hidden="true" /> Resume</button>}
                    {v.canExtend && <button type="button" className={`${btnSecondary} w-full`} onClick={() => setDialog('extend')}><Hourglass className="h-4 w-4" aria-hidden="true" /> Extend the term</button>}
                    {v.canComplete && <button type="button" className={`${btnSecondary} w-full`} onClick={() => setDialog('complete')}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Complete the mentorship</button>}
                    {v.canReport && <button type="button" className={`${btnSecondary} w-full`} onClick={() => setDialog('report')}><Flag className="h-4 w-4" aria-hidden="true" /> Report this mentorship</button>}
                    {v.canReport && mentee && <button type="button" className={`${btnSecondary} w-full`} onClick={() => setDialog('report-mentor')}><Flag className="h-4 w-4" aria-hidden="true" /> Report the mentor</button>}
                    {!v.canPause && !v.canResume && !v.canExtend && !v.canComplete && !v.canReport && <p className={`text-sm ${muted}`}>Nothing to do here right now.</p>}
                    {pause.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{mentorshipErrorMessage(pause.error)}</p>}
                </div>
            </aside>

            <ReasonDialog open={dialog === 'pause'} onOpenChange={(o) => !o && setDialog(null)} title="Pause the mentorship" description="While paused there are no sessions or messages. The mentor keeps their spot." fieldLabel="Reason" min={0} max={LIMITS.reason.max} optional confirmLabel="Pause"
                pending={pause.isPending} error={pause.error ? mentorshipErrorMessage(pause.error) : null} onConfirm={(reason) => pause.mutate({ pause: true, reason }, { onSuccess: () => setDialog(null) })} />
            {dialog === 'extend' && <ExtendDialog id={mentorship._id} open onOpenChange={(o) => !o && setDialog(null)} />}
            <FeedbackDialog open={dialog === 'complete'} onOpenChange={(o) => !o && setDialog(null)} title="Complete this mentorship?" description="This ends the mentorship, frees the mentor's spot and cancels sessions still scheduled. You can leave final feedback now, or later within 30 days."
                confirmLabel="Complete mentorship" ratingRequired={false} offerShareName={mentee} pending={complete.isPending} error={complete.error}
                onSubmit={(value) => complete.mutate(value.rating ? { rating: value.rating, comment: value.comment, shareName: value.shareName } : {}, { onSuccess: () => setDialog(null) })} />
            <FeedbackDialog open={dialog === 'final'} onOpenChange={(o) => !o && setDialog(null)} title="Final feedback" description="Tell us how the mentorship went." offerShareName={mentee} pending={final.isPending} error={final.error}
                onSubmit={(value) => final.mutate({ rating: value.rating, comment: value.comment, shareName: value.shareName }, { onSuccess: () => setDialog(null) })} />
            <ReportDialog open={dialog === 'report' || dialog === 'report-mentor'} onOpenChange={(o) => !o && setDialog(null)} target={dialog === 'report-mentor' ? 'mentor' : 'mentorship'} pending={report.isPending} error={report.error}
                onSubmit={(value) => report.mutate(value, { onSuccess: () => setDialog(null) })} />
        </div>
    );
}

function FeedbackPanel({ mentorship, active }: { mentorship: Mentorship; active: boolean }) {
    const feedback = useMentorshipFeedback(mentorship._id, active);
    const [dialog, setDialog] = useState(false);
    const final = useFinalFeedback(mentorship._id, { inline: true });
    const v = mentorship.viewer;
    const finals = mentorship.finalFeedback;
    const rows = feedback.data ?? [];
    return (
        <div className="space-y-6">
            {mentorship.status === 'completed' && (
                <section className={cardPad} aria-labelledby="final-heading" data-testid="final-feedback">
                    <h2 id="final-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Final feedback</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <h3 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${muted}`}>Yours</h3>
                            {finals?.mine ? <><RatingStars rating={finals.mine.rating} />{finals.mine.comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">{finals.mine.comment}</p>}</>
                                : v.canGiveFinalFeedback ? <button type="button" className={btnPrimary} onClick={() => setDialog(true)}><Star className="h-4 w-4" aria-hidden="true" /> Give feedback</button>
                                    : <p className={`text-sm ${muted}`}>The time to leave final feedback has passed.</p>}
                        </div>
                        <div>
                            <h3 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${muted}`}>Theirs</h3>
                            {!v.hasGivenFinalFeedback ? <p className={`text-sm ${muted}`} data-testid="theirs-hidden">Waiting for your feedback to reveal theirs.</p>
                                : finals?.theirs ? <><RatingStars rating={finals.theirs.rating} />{finals.theirs.comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">{finals.theirs.comment}</p>}</>
                                    : <p className={`text-sm ${muted}`}>They have not left final feedback yet.</p>}
                        </div>
                    </div>
                </section>
            )}
            <section aria-labelledby="session-feedback-heading">
                <h2 id="session-feedback-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Session feedback</h2>
                {feedback.isLoading ? <RowSkeleton count={2} label="Loading feedback" /> : feedback.isError ? <ErrorState error={feedback.error} onRetry={() => feedback.refetch()} title="Could not load feedback" /> : rows.length === 0 ? (
                    <EmptyBlock icon={Star} title="No feedback yet">After a session is held, you can each rate it from the Sessions tab.</EmptyBlock>
                ) : (
                    <ul className="space-y-3">
                        {rows.map((r) => (
                            <li key={r._id} className={`${card} p-4`} data-testid="feedback-row">
                                <div className="flex flex-wrap items-center justify-between gap-2"><RatingStars rating={r.rating} /><span className={`text-xs ${muted}`}>{r.mine ? 'You' : 'Them'} · {r.type === 'final' ? 'Final' : 'Session'} · {formatDate(r.createdAt)}</span></div>
                                {r.comment && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">{r.comment}</p>}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            <FeedbackDialog open={dialog} onOpenChange={setDialog} title="Final feedback" description="Tell us how the mentorship went." offerShareName={v.role === 'mentee'} pending={final.isPending} error={final.error}
                onSubmit={(value) => final.mutate({ rating: value.rating, comment: value.comment, shareName: value.shareName }, { onSuccess: () => setDialog(false) })} />
        </div>
    );
}

function Workspace({ id }: { id: string }) {
    const { ready } = useRequireLogin(`/mentorship/${id}`);
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const query = useMentorship(id);
    useLiveMentorship(id);
    const requested = params.get('tab');
    const tab: Tab = isTab(requested) ? requested : 'overview';
    const setTab = (next: string) => router.replace(`${pathname}${next === 'overview' ? '' : `?tab=${next}`}`, { scroll: false });

    if (!ready) return <FullPageSpinner />;
    if (query.isLoading) {
        return <PageShell wide title="Mentorship" backHref="/mentorship/dashboard" backLabel="My mentorships"><div className="space-y-4" role="status" aria-label="Loading the mentorship"><Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /></div></PageShell>;
    }
    if (query.isError) {
        return (
            <PageShell title="Mentorship" backHref="/mentorship/dashboard" backLabel="My mentorships">
                {isNotFound(query.error)
                    ? <EmptyBlock icon={UserX} title="Mentorship not found" action={<Link href="/mentorship/dashboard" className={btnPrimary}>My mentorships</Link>}>It may not exist, or it may belong to someone else.</EmptyBlock>
                    : <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load this mentorship" />}
            </PageShell>
        );
    }
    const m = query.data;
    if (!m) return null;
    const partner = m.viewer.role === 'mentor' ? m.mentee : m.mentor;

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'messages', label: 'Messages', count: tab === 'messages' ? 0 : m.unreadMessages },
        { id: 'sessions', label: 'Sessions' },
        { id: 'feedback', label: 'Feedback' },
    ];

    return (
        <PageShell wide title={displayName(partner)} subtitle={m.viewer.role === 'mentor' ? 'You mentor them' : 'Your mentor'} backHref="/mentorship/dashboard" backLabel="My mentorships" actions={<MentorshipStatusChip status={m.status} />}>
            <div className="mb-6">
                <TabBar tabs={tabs} active={tab} onChange={setTab} label="Mentorship sections" idPrefix="workspace" />
            </div>
            <div id="workspace-panel" role="tabpanel" aria-labelledby={`workspace-${tab}`}>
                {tab === 'overview' && <Overview mentorship={m} onOpenTab={setTab} />}
                {tab === 'messages' && <ChatPanel mentorship={m} active />}
                {tab === 'sessions' && <SessionsPanel mentorship={m} />}
                {tab === 'feedback' && <FeedbackPanel mentorship={m} active />}
            </div>
        </PageShell>
    );
}

export function WorkspaceView({ id }: { id: string }) {
    return <Suspense fallback={<FullPageSpinner />}><Workspace id={id} /></Suspense>;
}
