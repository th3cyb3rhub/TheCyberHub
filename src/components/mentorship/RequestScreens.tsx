'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2, Inbox, Loader2, Send, Sparkles, UserPlus } from 'lucide-react';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import {
    useAcceptRequest, useCancelRequest, useCreateRequest, useDeclineRequest, useIncomingRequests, useInviteMentor, useMentor,
    useMentorList, useMentorshipSummary, useMyMentorProfile, useMyRequests, useRenewRequest,
} from '@/hooks/queries/useMentorship';
import { useNow } from '@/lib/events/clock';
import { fieldErrors } from '@/lib/events/errors';
import { daysLeftLabel, displayName, expertiseLabel, requestBlockReason, SKILL_LABELS, SKILL_LEVELS } from '@/lib/mentorship/display';
import { mentorshipErrorMessage } from '@/lib/mentorship/errors';
import { issuesByField, LIMITS, mentorshipRequestSchema } from '@/lib/mentorship/schemas';
import type { ExpertiseArea, IncomingRequest, Mentor, MentorshipRequest, SkillLevel } from '@/types/mentorship';
import { MentorCard } from './MentorCard';
import { MentorshipNav } from './MentorshipNav';
import {
    Avatar, ConductBox, EmptyBlock, ErrorState, ExpertiseChips, ExpertisePicker, Field, fieldClass, LoadMore, Modal, ReasonDialog,
    RequestStatusChip, RowSkeleton, CountBadge,
} from './shared';
import { btnPrimary, btnSecondary, card, cardPad, muted, label as labelClass } from './styles';

// ---------------------------------------------------------------------------
// Ask for a mentor
// ---------------------------------------------------------------------------

function Sent({ request, direct }: { request: MentorshipRequest; direct?: Mentor | null }) {
    const invited = request.matchedMentors.map((m) => m.mentor).filter((m): m is Mentor => typeof m !== 'string');
    return (
        <div className="space-y-6" data-testid="request-sent">
            <div className={`${cardPad} text-center`}>
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-700 dark:text-green-400" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your request is sent</h2>
                <p className={`mx-auto mt-1 max-w-md text-sm ${muted}`}>
                    {direct ? `${displayName(direct.user)} will see your goals and can accept or decline.` : invited.length > 0
                        ? `We invited ${invited.length} ${invited.length === 1 ? 'mentor' : 'mentors'} who fit your goals. The first to accept becomes your mentor.`
                        : 'No mentor fits yet. Your request stays open for 14 days and we match it as soon as one does.'}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <Link href="/mentorship/requests" className={btnPrimary}>See my requests</Link>
                    <Link href="/mentorship" className={btnSecondary}>Back to mentors</Link>
                </div>
            </div>
            {invited.length > 0 && !direct && (
                <section aria-labelledby="invited-heading">
                    <h2 id="invited-heading" className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Invited mentors</h2>
                    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">{invited.map((m) => <MentorCard key={m._id} mentor={m} />)}</ul>
                </section>
            )}
        </div>
    );
}

export function RequestMentorView() {
    const { user, ready } = useRequireLogin('/mentorship/request');
    const params = useSearchParams();
    const mentorId = params.get('mentor');
    const summary = useMentorshipSummary(ready);
    const mentor = useMentor(mentorId ?? '');
    const create = useCreateRequest({ inline: true });

    const [areas, setAreas] = useState<ExpertiseArea[]>([]);
    const [goals, setGoals] = useState('');
    const [level, setLevel] = useState<SkillLevel | ''>('');
    const [conduct, setConduct] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [sent, setSent] = useState<MentorshipRequest | null>(null);

    if (!ready) return <FullPageSpinner />;

    const server = fieldErrors(create.error);
    const shown = { ...server, ...errors };
    const generalError = create.error && Object.keys(server).length === 0 ? mentorshipErrorMessage(create.error) : null;
    const target = mentorId ? mentor.data : null;
    const blocked = target ? requestBlockReason(target, user?.id ?? null, !!summary.data?.openRequest) : summary.data?.openRequest ? 'You already have an open request. Cancel it first to send another.' : null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = mentorshipRequestSchema.safeParse({ expertiseAreas: areas, goals, skillLevel: level || undefined, conductAccepted: conduct });
        if (!parsed.success) {
            setErrors(issuesByField(parsed.error));
            return;
        }
        setErrors({});
        create.mutate({
            expertiseAreas: parsed.data.expertiseAreas as ExpertiseArea[],
            goals: parsed.data.goals,
            skillLevel: parsed.data.skillLevel as SkillLevel,
            conductAccepted: true,
            ...(mentorId ? { mentorId } : {}),
        }, { onSuccess: (request) => setSent(request) });
    };

    return (
        <PageShell title={target ? `Ask ${displayName(target.user)} to mentor you` : 'Match me with a mentor'} subtitle={target ? undefined : 'Tell us what you want to learn. We invite up to 5 mentors who fit, and the first to accept becomes your mentor.'} backHref={target ? `/mentorship/mentor/${target._id}` : '/mentorship'} backLabel={target ? 'Back to profile' : 'All mentors'}>
            <MentorshipNav />
            {sent ? <Sent request={sent} direct={target} /> : mentorId && mentor.isLoading ? <RowSkeleton count={2} label="Loading the mentor" /> : mentorId && mentor.isError ? (
                <ErrorState error={mentor.error} onRetry={() => mentor.refetch()} title="Could not load this mentor" />
            ) : (
                <form onSubmit={submit} noValidate className="space-y-6" data-testid="request-form">
                    {target && (
                        <div className={`${card} flex items-center gap-3 p-4`}>
                            <Avatar person={target.user} size={40} />
                            <div className="min-w-0"><p className="font-medium text-gray-900 dark:text-white">{displayName(target.user)}</p><ExpertiseChips areas={target.expertiseAreas} max={4} className="mt-1" /></div>
                        </div>
                    )}
                    {blocked && (
                        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" data-testid="request-blocked">
                            {blocked} <Link href="/mentorship/requests" className="font-medium underline">My requests</Link>
                        </p>
                    )}
                    <div className={`${cardPad} space-y-6`}>
                        <ExpertisePicker legend="What do you want help with?" value={areas} onChange={setAreas} max={LIMITS.requestAreas} error={shown.expertiseAreas} />
                        <Field id="request-goals" label="Your goals" hint={`What do you want to reach, and where are you now? (${LIMITS.goals.min} to ${LIMITS.goals.max} characters)`} error={shown.goals}>
                            <textarea id="request-goals" rows={6} value={goals} onChange={(e) => setGoals(e.target.value)} maxLength={LIMITS.goals.max + 100} className={`${fieldClass(shown.goals)} resize-y`} aria-invalid={!!shown.goals} />
                            <p className={`mt-1 text-right text-xs ${goals.trim().length > 0 && goals.trim().length < LIMITS.goals.min ? 'text-amber-800 dark:text-amber-300' : muted}`} aria-hidden="true">{goals.trim().length}/{LIMITS.goals.max}</p>
                        </Field>
                        <fieldset>
                            <legend className={labelClass}>Your level</legend>
                            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Your level">
                                {SKILL_LEVELS.map((l) => (
                                    <label key={l} className={`inline-flex cursor-pointer items-center rounded-full border px-4 py-1.5 text-sm focus-within:ring-2 focus-within:ring-orange-500 ${level === l ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>
                                        <input type="radio" name="skill-level" className="sr-only" checked={level === l} onChange={() => setLevel(l)} /> {SKILL_LABELS[l]}
                                    </label>
                                ))}
                            </div>
                            {shown.skillLevel && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{shown.skillLevel}</p>}
                        </fieldset>
                    </div>
                    <ConductBox audience="mentee" checked={conduct} onChange={setConduct} error={shown.conductAccepted} />
                    {generalError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200" data-testid="form-error">{generalError}</p>}
                    <button type="submit" className={btnPrimary} disabled={create.isPending || !!blocked}>
                        {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        {target ? 'Send request' : 'Find me a mentor'}
                    </button>
                </form>
            )}
        </PageShell>
    );
}

// ---------------------------------------------------------------------------
// My requests and incoming
// ---------------------------------------------------------------------------

function InviteDialog({ request, open, onOpenChange }: { request: MentorshipRequest; open: boolean; onOpenChange: (open: boolean) => void }) {
    const invite = useInviteMentor();
    const list = useMentorList({ expertise: request.expertiseAreas });
    const invitedIds = new Set(request.matchedMentors.map((m) => (typeof m.mentor === 'string' ? m.mentor : m.mentor._id)));
    const mentors = (list.data?.pages.flatMap((p) => p.data) ?? []).filter((m) => !invitedIds.has(m._id));
    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Invite another mentor" description="Mentors who cover your topics and have a free spot. A request can invite up to 5." size="lg" asForm={false}>
            {list.isLoading ? <RowSkeleton count={3} label="Loading mentors" /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : mentors.length === 0 ? (
                <p className={`text-sm ${muted}`}>No other mentor fits right now.</p>
            ) : (
                <ul className="space-y-2">
                    {mentors.slice(0, 8).map((m) => (
                        <li key={m._id} className={`${card} flex items-center gap-3 p-3`}>
                            <Avatar person={m.user} size={36} />
                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-900 dark:text-white">{displayName(m.user)}</p><p className={`truncate text-xs ${muted}`}>{m.expertiseAreas.slice(0, 3).map(expertiseLabel).join(', ')}</p></div>
                            <button type="button" className={`${btnSecondary} !px-3 !py-1.5`} disabled={invite.isPending} onClick={() => invite.mutate({ requestId: request._id, mentorId: m._id }, { onSuccess: () => onOpenChange(false) })}>Invite</button>
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
}

function RequestCard({ request, now }: { request: MentorshipRequest; now: Date | null }) {
    const cancel = useCancelRequest();
    const renew = useRenewRequest();
    const [confirm, setConfirm] = useState(false);
    const [invite, setInvite] = useState(false);
    const open = request.status === 'pending' || request.status === 'matched';
    const canRenew = request.status === 'expired' || request.status === 'declined';
    const invited = request.matchedMentors.length;

    return (
        <li className={`${card} p-5`} data-testid="request-card" data-status={request.status}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <RequestStatusChip status={request.status} />
                <span className={`text-xs ${muted}`}>{open && now ? daysLeftLabel(request.expiresAt, now) : ''}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">{request.goals}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2"><ExpertiseChips areas={request.expertiseAreas} /><span className={`text-xs ${muted}`}>{SKILL_LABELS[request.skillLevel]}</span></div>

            {invited > 0 && (
                <div className="mt-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Invited mentors</h3>
                    <ul className="space-y-2">
                        {request.matchedMentors.map((inv, i) => {
                            const m = typeof inv.mentor === 'string' ? null : inv.mentor;
                            return (
                                <li key={m?._id ?? i} className="flex flex-wrap items-center gap-2 text-sm">
                                    {m ? <><Avatar person={m.user} size={24} /><Link href={`/mentorship/mentor/${m._id}`} className="font-medium text-gray-900 hover:underline dark:text-white">{displayName(m.user)}</Link></> : <span>A mentor</span>}
                                    <span className={`rounded-full px-2 py-0.5 text-xs ${inv.response === 'accepted' ? 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300' : inv.response === 'declined' ? 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300' : 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300'}`}>
                                        {inv.response === 'pending' ? 'Waiting' : inv.response === 'accepted' ? 'Accepted' : inv.autoDeclined ? 'Another mentor accepted' : 'Declined'}
                                    </span>
                                    {inv.declineReason && <span className={`w-full pl-8 text-xs ${muted}`}>&ldquo;{inv.declineReason}&rdquo;</span>}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3">
                {request.status === 'accepted' && request.mentorship && <Link href={`/mentorship/${request.mentorship}`} className={btnPrimary}>Open the mentorship</Link>}
                {open && invited < 5 && <button type="button" className={btnSecondary} onClick={() => setInvite(true)}><UserPlus className="h-4 w-4" aria-hidden="true" /> Invite another mentor</button>}
                {canRenew && <button type="button" className={btnPrimary} onClick={() => renew.mutate({ id: request._id })} disabled={renew.isPending}>{renew.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Request again</button>}
                {open && <button type="button" className={btnSecondary} onClick={() => setConfirm(true)}>Cancel request</button>}
            </div>

            <Modal open={confirm} onOpenChange={setConfirm} title="Cancel this request?" description="Invited mentors will no longer see it. You can send a new one afterwards." confirmLabel="Cancel request" destructive pending={cancel.isPending} onConfirm={() => cancel.mutate({ id: request._id }, { onSuccess: () => setConfirm(false) })} />
            {invite && <InviteDialog request={request} open={invite} onOpenChange={setInvite} />}
        </li>
    );
}

function IncomingCard({ request, now }: { request: IncomingRequest; now: Date | null }) {
    const router = useRouter();
    const accept = useAcceptRequest();
    const decline = useDeclineRequest({ inline: true });
    const [dialog, setDialog] = useState(false);
    const answered = request.invitation?.response && request.invitation.response !== 'pending';
    const name = request.mentee.anonymous || !request.mentee.username ? 'A member' : `@${request.mentee.username}`;

    return (
        <li className={`${card} p-5`} data-testid="incoming-card" data-response={request.invitation?.response ?? 'pending'}>
            <div className="flex flex-wrap items-center gap-3">
                <Avatar person={{ username: request.mentee.username, avatar: request.mentee.avatar }} size={40} />
                <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">{name}</p>
                    <p className={`text-xs ${muted}`}>{SKILL_LABELS[request.skillLevel]}{!answered && now ? ` · ${daysLeftLabel(request.expiresAt, now)}` : ''}</p>
                </div>
                {answered && <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300">{request.invitation?.response === 'accepted' ? 'You accepted' : 'You declined'}</span>}
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">{request.goals}</p>
            <ExpertiseChips areas={request.expertiseAreas} className="mt-3" />
            {!answered && request.status !== 'accepted' && (
                <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" className={btnPrimary} disabled={accept.isPending} onClick={() => accept.mutate({ id: request._id }, { onSuccess: ({ mentorship }) => router.push(`/mentorship/${mentorship._id}`) })}>
                        {accept.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Accept
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => setDialog(true)} disabled={accept.isPending}>Decline</button>
                </div>
            )}
            {request.invitation?.response === 'accepted' && request.mentorship && <Link href={`/mentorship/${request.mentorship}`} className={`${btnSecondary} mt-4`}>Open the mentorship</Link>}
            <ReasonDialog open={dialog} onOpenChange={setDialog} title="Decline this request" description="The person is told. A short, kind reason helps them find the right mentor." fieldLabel="Message to the mentee" min={0} max={LIMITS.declineReason} optional confirmLabel="Decline request"
                pending={decline.isPending} error={decline.error ? mentorshipErrorMessage(decline.error) : null}
                onConfirm={(reason) => decline.mutate({ id: request._id, reason }, { onSuccess: () => setDialog(false) })} />
            {accept.isError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{mentorshipErrorMessage(accept.error)}</p>}
        </li>
    );
}

function MyRequests({ now }: { now: Date | null }) {
    const query = useMyRequests();
    const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
    if (query.isLoading) return <RowSkeleton count={3} label="Loading your requests" />;
    if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load your requests" />;
    if (rows.length === 0) return <EmptyBlock icon={Sparkles} title="No requests yet" action={<Link href="/mentorship/request" className={btnPrimary}>Match me with a mentor</Link>}>Tell us what you want to learn and we invite mentors who fit.</EmptyBlock>;
    return (
        <>
            <ul className="space-y-4" data-testid="my-requests">{rows.map((r) => <RequestCard key={r._id} request={r} now={now} />)}</ul>
            <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />
        </>
    );
}

function Incoming({ now }: { now: Date | null }) {
    const [status, setStatus] = useState<'pending' | 'all'>('pending');
    const query = useIncomingRequests({ status });
    const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
    return (
        <>
            <div className="mb-4 flex gap-2" role="group" aria-label="Show">
                {([['pending', 'Waiting for you'], ['all', 'All answers']] as const).map(([v, l]) => (
                    <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={`rounded-full border px-3 py-1 text-sm ${status === v ? 'border-orange-700 bg-orange-700 text-white' : 'border-gray-300 bg-white text-gray-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200'}`}>{l}</button>
                ))}
            </div>
            {query.isLoading ? <RowSkeleton count={2} label="Loading incoming requests" /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load incoming requests" /> : rows.length === 0 ? (
                <EmptyBlock icon={Inbox} title={status === 'pending' ? 'Nothing waiting for you' : 'No requests yet'}>When someone asks you to mentor them, it shows up here and you get a notification.</EmptyBlock>
            ) : (
                <>
                    <ul className="space-y-4" data-testid="incoming-requests">{rows.map((r) => <IncomingCard key={r._id} request={r} now={now} />)}</ul>
                    <LoadMore hasNext={!!query.hasNextPage} loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} />
                </>
            )}
        </>
    );
}

export function RequestsView() {
    const { ready } = useRequireLogin('/mentorship/requests');
    const params = useSearchParams();
    const profile = useMyMentorProfile(ready);
    const summary = useMentorshipSummary(ready);
    const now = useNow(60_000);
    const isMentor = profile.data?.status === 'approved';
    const [tab, setTab] = useState<'mine' | 'incoming'>(params.get('tab') === 'incoming' ? 'incoming' : 'mine');

    useEffect(() => {
        if (params.get('tab') === 'incoming') setTab('incoming');
    }, [params]);

    if (!ready) return <FullPageSpinner />;
    const tabs = [
        { id: 'mine' as const, label: 'My requests', count: 0 },
        ...(isMentor ? [{ id: 'incoming' as const, label: 'Waiting for me', count: summary.data?.pendingInvites ?? 0 }] : []),
    ];

    return (
        <PageShell title="Requests" subtitle="Ask for a mentor, or answer the people who ask you." backHref="/mentorship" backLabel="All mentors" actions={<Link href="/mentorship/request" className={btnPrimary}><Sparkles className="h-4 w-4" aria-hidden="true" /> New request</Link>}>
            <MentorshipNav />
            {tabs.length > 1 && (
                <div role="tablist" aria-label="Requests" className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900/60">
                    {tabs.map((t) => (
                        <button key={t.id} id={`requests-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="requests-panel" type="button" onClick={() => setTab(t.id)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${tab === t.id ? 'bg-orange-700 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-800'}`}>
                            {t.label}<CountBadge count={t.count} label="waiting" />
                        </button>
                    ))}
                </div>
            )}
            <div id="requests-panel" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? `requests-tab-${tab}` : undefined}>
                {tab === 'incoming' && isMentor ? <Incoming now={now} /> : <MyRequests now={now} />}
            </div>
        </PageShell>
    );
}
