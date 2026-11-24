'use client';

import { useId, useMemo, useState } from 'react';
import { CalendarClock, CalendarPlus, CheckCircle2, ExternalLink, Pencil, Star, StickyNote, XCircle } from 'lucide-react';
import {
    useCancelSession, useCompleteSession, useCreateSession, useSaveSessionNotes, useSessionFeedback, useSessions, useUpdateSession,
} from '@/hooks/queries/useMentorship';
import { useViewerZone } from '@/lib/events/clock';
import { fieldErrors } from '@/lib/events/errors';
import { safeMeetingUrl } from '@/lib/mentorship/display';
import { mentorshipErrorMessage } from '@/lib/mentorship/errors';
import { issuesByField, LIMITS, sessionFormSchema } from '@/lib/mentorship/schemas';
import { browserTimeZone, clockRange, formatMoment, isValidTimeZone, sessionInstant, sessionTimes, toLocalParts } from '@/lib/mentorship/time';
import type { Mentorship, MentorshipSession } from '@/types/mentorship';
import { FeedbackDialog } from './FeedbackDialog';
import { EmptyBlock, ErrorState, Field, fieldClass, Modal, ReasonDialog, RowSkeleton, SessionStatusChip } from './shared';
import { btnPrimary, btnSecondary, card, muted } from './styles';

const DURATIONS = [15, 30, 45, 60, 90, 120];

interface FormState { title: string; date: string; time: string; timezone: string; duration: string; meetingUrl: string; description: string }

function initialForm(session: MentorshipSession | undefined, zone: string): FormState {
    if (!session) return { title: '', date: '', time: '18:00', timezone: zone, duration: '60', meetingUrl: '', description: '' };
    const tz = isValidTimeZone(session.timezone) ? session.timezone : zone;
    const parts = toLocalParts(session.scheduledAt, tz);
    return { title: session.title, date: parts.date, time: parts.time, timezone: tz, duration: String(session.duration), meetingUrl: session.meetingUrl ?? '', description: session.description ?? '' };
}

/** Schedule or move a session. The time is entered in a zone of the person's choice and shown in both zones before saving. */
export function SessionFormDialog({ open, onOpenChange, mentorship, session }: { open: boolean; onOpenChange: (open: boolean) => void; mentorship: Mentorship; session?: MentorshipSession }) {
    const id = useId();
    const viewerZone = useViewerZone() ?? browserTimeZone();
    const create = useCreateSession(mentorship._id);
    const update = useUpdateSession();
    const mutation = session ? update : create;
    const mentorZone = typeof mentorship.mentorProfile === 'object' && mentorship.mentorProfile?.timezone && isValidTimeZone(mentorship.mentorProfile.timezone) ? mentorship.mentorProfile.timezone : null;
    const [form, setForm] = useState<FormState>(() => initialForm(session, viewerZone));
    const [problems, setProblems] = useState<Record<string, string>>({});

    const zones = useMemo(() => Array.from(new Set([viewerZone, ...(mentorZone ? [mentorZone] : []), ...(session && isValidTimeZone(session.timezone) ? [session.timezone] : []), 'UTC'])), [viewerZone, mentorZone, session]);
    const set = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));
    const instant = sessionInstant(form.date, form.time, form.timezone);
    const server = fieldErrors(mutation.error);
    const shown = { ...server, ...problems };

    const submit = () => {
        const parsed = sessionFormSchema(new Date()).safeParse({ ...form, duration: Number(form.duration) });
        if (!parsed.success) { setProblems(issuesByField(parsed.error)); return; }
        setProblems({});
        const at = sessionInstant(parsed.data.date, parsed.data.time, parsed.data.timezone);
        if (!at) return;
        const input = { title: parsed.data.title, scheduledAt: at.toISOString(), timezone: parsed.data.timezone, duration: parsed.data.duration, meetingUrl: parsed.data.meetingUrl, description: parsed.data.description };
        if (session) update.mutate({ id: session._id, input }, { onSuccess: () => onOpenChange(false) });
        else create.mutate(input, { onSuccess: () => onOpenChange(false) });
    };

    return (
        <Modal open={open} onOpenChange={onOpenChange} size="lg" title={session ? 'Reschedule or edit the session' : 'Schedule a session'}
            description="The other person is told, and sees the time in their own time zone." confirmLabel={session ? 'Save changes' : 'Schedule session'} pending={mutation.isPending}
            error={mutation.error && Object.keys(server).length === 0 ? mentorshipErrorMessage(mutation.error) : null} onConfirm={submit}>
            <div className="space-y-4">
                <Field id={`${id}-title`} label="Title" error={shown.title}>
                    <input id={`${id}-title`} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={LIMITS.sessionTitle.max + 20} className={fieldClass(shown.title)} placeholder="First call: goals and plan" aria-invalid={!!shown.title} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id={`${id}-date`} label="Date" error={shown.date}>
                        <input id={`${id}-date`} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={fieldClass(shown.date)} aria-invalid={!!shown.date} />
                    </Field>
                    <Field id={`${id}-time`} label="Start time" error={shown.time ?? shown.scheduledAt}>
                        <input id={`${id}-time`} type="time" value={form.time} onChange={(e) => set('time', e.target.value)} className={fieldClass(shown.time)} aria-invalid={!!shown.time} />
                    </Field>
                    <Field id={`${id}-tz`} label="Time zone" error={shown.timezone}>
                        <select id={`${id}-tz`} value={form.timezone} onChange={(e) => set('timezone', e.target.value)} className={fieldClass(shown.timezone)}>
                            {zones.map((z) => <option key={z} value={z}>{z === viewerZone ? `${z} (your zone)` : z === mentorZone ? `${z} (mentor's zone)` : z}</option>)}
                        </select>
                    </Field>
                    <Field id={`${id}-duration`} label="Length" error={shown.duration}>
                        <select id={`${id}-duration`} value={form.duration} onChange={(e) => set('duration', e.target.value)} className={fieldClass(shown.duration)}>
                            {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
                        </select>
                    </Field>
                </div>
                {instant && (
                    <div className="rounded-xl bg-gray-100 p-3 text-sm text-gray-800 dark:bg-neutral-800 dark:text-gray-200" data-testid="time-preview" aria-live="polite">
                        <p><span className="font-medium">Your time:</span> {formatMoment(instant, viewerZone)}</p>
                        {mentorZone && mentorZone !== viewerZone && <p><span className="font-medium">Mentor&apos;s time:</span> {formatMoment(instant, mentorZone)}</p>}
                        <p className={muted}>UTC: {formatMoment(instant, 'UTC')}</p>
                    </div>
                )}
                <Field id={`${id}-url`} label="Meeting link (optional)" hint="An https link to Meet, Zoom, Discord or similar." error={shown.meetingUrl}>
                    <input id={`${id}-url`} type="url" inputMode="url" value={form.meetingUrl} onChange={(e) => set('meetingUrl', e.target.value)} className={fieldClass(shown.meetingUrl)} placeholder="https://" aria-invalid={!!shown.meetingUrl} />
                </Field>
                <Field id={`${id}-desc`} label="Agenda (optional)" error={shown.description}>
                    <textarea id={`${id}-desc`} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={LIMITS.sessionDescription + 50} className={`${fieldClass(shown.description)} resize-none`} />
                </Field>
            </div>
        </Modal>
    );
}

function NotesDialog({ session, open, onOpenChange }: { session: MentorshipSession; open: boolean; onOpenChange: (open: boolean) => void }) {
    const save = useSaveSessionNotes();
    const [text, setText] = useState(session.notes ?? '');
    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Your notes" description="Private: only you can see them." confirmLabel="Save notes" pending={save.isPending} error={save.error ? mentorshipErrorMessage(save.error) : null}
            onConfirm={() => save.mutate({ id: session._id, notes: text }, { onSuccess: () => onOpenChange(false) })}>
            <label htmlFor={`notes-${session._id}`} className="sr-only">Notes</label>
            <textarea id={`notes-${session._id}`} rows={8} value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.notes} className={`${fieldClass()} resize-y`} />
            <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{text.length}/{LIMITS.notes}</p>
        </Modal>
    );
}

type Dialog = 'edit' | 'cancel' | 'complete' | 'notes' | 'feedback' | null;

export function SessionCard({ session, mentorship, zone }: { session: MentorshipSession; mentorship: Mentorship; zone: string | null }) {
    const [dialog, setDialog] = useState<Dialog>(null);
    const cancel = useCancelSession();
    const complete = useCompleteSession();
    const feedback = useSessionFeedback();
    const times = sessionTimes(session.scheduledAt, session.timezone, zone);
    const link = safeMeetingUrl(session.meetingUrl);
    const v = session.viewer;
    const scheduled = session.status === 'scheduled';
    const mentee = mentorship.viewer.role === 'mentee';
    const started = new Date(session.scheduledAt).getTime() <= Date.now();

    return (
        <li className={`${card} p-5`} data-testid="session-card" data-status={session.status}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="break-words text-base font-semibold text-gray-900 dark:text-white">{session.title}</h3>
                    <p className="mt-1 text-sm text-gray-800 dark:text-gray-200" data-testid="session-time">{times.primary}</p>
                    {times.secondary && <p className={`text-xs ${muted}`} data-testid="session-time-secondary">Planned in {session.timezone}: {times.secondary}</p>}
                    <p className={`text-xs ${muted}`}>{session.duration} minutes · {clockRange(session.scheduledAt, session.duration, zone ?? 'UTC')}</p>
                </div>
                <SessionStatusChip status={session.status} />
            </div>
            {session.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">{session.description}</p>}
            {session.status === 'cancelled' && session.cancelReason && <p className={`mt-3 text-sm ${muted}`}>Cancelled: {session.cancelReason}</p>}
            {session.notes && <p className="mt-3 rounded-lg bg-gray-100 p-3 text-sm text-gray-800 dark:bg-neutral-800 dark:text-gray-200"><span className="font-medium">Your notes:</span> <span className="whitespace-pre-wrap break-words">{session.notes}</span></p>}

            <div className="mt-4 flex flex-wrap gap-2">
                {link && scheduled && <a href={link} target="_blank" rel="noopener noreferrer" className={btnPrimary}><ExternalLink className="h-4 w-4" aria-hidden="true" /> Join the call<span className="sr-only"> (opens in a new tab)</span></a>}
                {v.canComplete && <button type="button" className={btnSecondary} onClick={() => setDialog('complete')}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Mark as held</button>}
                {v.canReschedule && <button type="button" className={btnSecondary} onClick={() => setDialog('edit')}><Pencil className="h-4 w-4" aria-hidden="true" /> Reschedule</button>}
                {v.canCancel && <button type="button" className={btnSecondary} onClick={() => setDialog('cancel')}><XCircle className="h-4 w-4" aria-hidden="true" /> Cancel</button>}
                {v.canAddNotes && <button type="button" className={btnSecondary} onClick={() => setDialog('notes')}><StickyNote className="h-4 w-4" aria-hidden="true" /> {session.notes ? 'Edit notes' : 'Add notes'}</button>}
                {session.feedback.canSubmit && <button type="button" className={btnPrimary} onClick={() => setDialog('feedback')}><Star className="h-4 w-4" aria-hidden="true" /> Give feedback</button>}
            </div>
            {scheduled && started && mentee && !v.canComplete && <p className={`mt-3 text-xs ${muted}`}>Only your mentor can mark a session as held.</p>}
            {session.status === 'completed' && session.feedback.submitted && <p className={`mt-3 text-xs ${muted}`}>You gave feedback for this session.</p>}

            {dialog === 'edit' && <SessionFormDialog open onOpenChange={(o) => !o && setDialog(null)} mentorship={mentorship} session={session} />}
            <ReasonDialog open={dialog === 'cancel'} onOpenChange={(o) => !o && setDialog(null)} title="Cancel this session?" description="The other person is told and sees your reason." fieldLabel="Reason" min={3} max={LIMITS.reason.max} confirmLabel="Cancel session" destructive
                pending={cancel.isPending} error={cancel.error ? mentorshipErrorMessage(cancel.error) : null} onConfirm={(reason) => cancel.mutate({ id: session._id, reason }, { onSuccess: () => setDialog(null) })} />
            <Modal open={dialog === 'complete'} onOpenChange={(o) => !o && setDialog(null)} title="Mark this session as held?" description="Both of you are asked for feedback afterwards. It counts towards your hours." confirmLabel="Mark as held" pending={complete.isPending}
                error={complete.error ? mentorshipErrorMessage(complete.error) : null} onConfirm={() => complete.mutate({ id: session._id }, { onSuccess: () => setDialog(null) })} />
            {dialog === 'notes' && <NotesDialog session={session} open onOpenChange={(o) => !o && setDialog(null)} />}
            <FeedbackDialog open={dialog === 'feedback'} onOpenChange={(o) => !o && setDialog(null)} title="How was the session?" description={`Within 7 days of the session. ${mentee ? 'Your rating helps other members choose.' : 'Only the mentor sees how the mentee rated.'}`}
                offerShareName={mentee} pending={feedback.isPending} error={feedback.error} onSubmit={(value) => feedback.mutate({ id: session._id, rating: value.rating, comment: value.comment, shareName: value.shareName }, { onSuccess: () => setDialog(null) })} />
        </li>
    );
}

export function SessionsPanel({ mentorship }: { mentorship: Mentorship }) {
    const sessions = useSessions(mentorship._id);
    const zone = useViewerZone();
    const [open, setOpen] = useState(false);
    const rows = sessions.data?.data ?? [];
    const upcoming = rows.filter((s) => s.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    const past = rows.filter((s) => s.status !== 'scheduled').sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
    const viewer = mentorship.viewer;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Sessions</h2>
                {viewer.canSchedule && <button type="button" className={btnPrimary} onClick={() => setOpen(true)}><CalendarPlus className="h-4 w-4" aria-hidden="true" /> Schedule a session</button>}
            </div>
            {!viewer.canSchedule && mentorship.status === 'paused' && <p className={`text-sm ${muted}`}>Sessions cannot be scheduled while the mentorship is paused.</p>}
            {sessions.isLoading ? <RowSkeleton count={2} label="Loading sessions" /> : sessions.isError ? (
                <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} title="Could not load sessions" />
            ) : rows.length === 0 ? (
                <EmptyBlock icon={CalendarClock} title="No sessions yet" action={viewer.canSchedule ? <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>Schedule the first one</button> : undefined}>
                    A first call to agree on goals is a good start. Either of you can schedule it.
                </EmptyBlock>
            ) : (
                <>
                    <section aria-label="Upcoming sessions">
                        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Upcoming ({upcoming.length})</h3>
                        {upcoming.length ? <ul className="space-y-3" data-testid="upcoming-sessions">{upcoming.map((s) => <SessionCard key={s._id} session={s} mentorship={mentorship} zone={zone} />)}</ul> : <p className={`text-sm ${muted}`}>Nothing is scheduled.</p>}
                    </section>
                    {past.length > 0 && (
                        <section aria-label="Past sessions">
                            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Past ({past.length})</h3>
                            <ul className="space-y-3" data-testid="past-sessions">{past.map((s) => <SessionCard key={s._id} session={s} mentorship={mentorship} zone={zone} />)}</ul>
                        </section>
                    )}
                </>
            )}
            {open && <SessionFormDialog open onOpenChange={setOpen} mentorship={mentorship} />}
        </div>
    );
}
