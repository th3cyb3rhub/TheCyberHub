'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Ban, ClipboardList, Loader2, Pause, Pencil, Play } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useEndSeries, usePatchSeries, usePauseSeries, useResumeSeries } from '@/hooks/queries/useEventSeries';
import { eventErrorMessage, fieldErrors } from '@/lib/events/errors';
import { EVENT_LIMITS, FORMAT_LABELS } from '@/lib/events/form';
import { isAdminRole } from '@/lib/events/roles';
import {
    seriesFieldKey, seriesToEditValues, SERIES_LIMITS, toSeriesPatch, validateSeriesEdit, type SeriesEditValues, type SeriesFormErrors, type SeriesScope,
} from '@/lib/events/series';
import { formatClock, formatDayYear } from '@/lib/events/time';
import { EVENT_FORMATS, type Series } from '@/types/event';
import { useViewerZone } from '@/lib/events/clock';
import { DialogShell } from './DialogShell';
import { EventDialog } from './EventDialog';
import { btnPrimary, btnSecondary, cardPad, input, inputError, label as labelClass, muted } from './styles';

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: (p: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode }) {
    const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
    return (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            {children({ id, describedBy, invalid: !!error })}
            {hint && <p id={`${id}-hint`} className={`mt-1 text-xs ${muted}`}>{hint}</p>}
            {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
        </div>
    );
}

/** Change one occurrence or this and every later one. Only what changed is sent. */
function EditDialog({ series, open, onOpenChange }: { series: Series; open: boolean; onOpenChange: (o: boolean) => void }) {
    const { user } = useAuth();
    const admin = isAdminRole(user?.role);
    const patch = usePatchSeries();
    const initial = useMemo(() => seriesToEditValues(series), [series]);
    const [values, setValues] = useState<SeriesEditValues>(initial);
    const [scope, setScope] = useState<SeriesScope>('future');
    const [eventId, setEventId] = useState<string>(series.nextOccurrences[0]?.id ?? '');
    const [errors, setErrors] = useState<SeriesFormErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const occurrence = series.nextOccurrences.find((o) => o.id === eventId) ?? null;

    const set = <K extends keyof SeriesEditValues>(key: K, value: SeriesEditValues[K]) => {
        setValues((v) => ({ ...v, [key]: value }));
        if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        setDone(null);
        const checked = validateSeriesEdit(values, scope, { admin, occurrence });
        if (!checked.ok) {
            setErrors(checked.errors);
            setFormError('Some fields need your attention.');
            return;
        }
        setErrors({});
        if (scope === 'this' && !occurrence) {
            setFormError('Pick the date you want to change.');
            return;
        }
        const payload = toSeriesPatch(initial, values, scope, { eventId: occurrence?.id, occurrenceZone: occurrence?.timezone });
        if (!Object.keys(payload).length) {
            setFormError('Nothing has changed yet.');
            return;
        }
        patch.mutate({ id: series.id, payload }, {
            onSuccess: (result) => {
                setDone(result.scope === 'future'
                    ? `Saved. ${result.updated} upcoming ${result.updated === 1 ? 'date was' : 'dates were'} updated${result.created ? `, ${result.created} new ${result.created === 1 ? 'date was' : 'dates were'} created` : ''}${result.cancelled ? `, ${result.cancelled} cancelled` : ''}.`
                    : 'Saved. This date was changed and later changes to the series leave it alone.');
                onOpenChange(false);
            },
            onError: (err) => {
                const api = fieldErrors(err);
                if (Object.keys(api).length) {
                    const mapped: SeriesFormErrors = {};
                    for (const [key, message] of Object.entries(api)) mapped[key === 'startDate' ? 'moveTime' : seriesFieldKey(key)] = message;
                    setErrors(mapped);
                }
                setFormError(eventErrorMessage(err));
            },
        });
    };

    const text = (key: keyof SeriesEditValues, label: string, opts: { type?: string; hint?: string; maxLength?: number } = {}) => (
        <Field id={`se-${key}`} label={label} error={errors[key]} hint={opts.hint}>
            {({ id, describedBy, invalid }) => (
                <input id={id} type={opts.type ?? 'text'} value={String(values[key])} maxLength={opts.maxLength} aria-invalid={invalid || undefined} aria-describedby={describedBy}
                    onChange={(e) => set(key, e.target.value as never)} className={`${input} ${invalid ? inputError : ''}`} />
            )}
        </Field>
    );

    return (
        <>
            {done && <p role="status" className="mt-3 text-sm text-green-800 dark:text-green-300" data-testid="series-saved">{done}</p>}
            <DialogShell open={open} onOpenChange={(o) => !patch.isPending && onOpenChange(o)} title="Edit the series" description="Choose how far the change reaches, then change what you need." wide>
                <form onSubmit={submit} noValidate className="space-y-4">
                    <fieldset className="space-y-2">
                        <legend className={labelClass}>What should change</legend>
                        <label className="flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 text-sm dark:border-neutral-800">
                            <input type="radio" name="scope" checked={scope === 'future'} onChange={() => setScope('future')} className="mt-0.5 accent-orange-600" />
                            <span><span className="font-medium text-gray-900 dark:text-white">This and all future dates</span>
                                <span className={`block text-xs ${muted}`}>Changes the template and the upcoming dates that were not edited by hand. Dates that already started stay as they are.</span></span>
                        </label>
                        <label className={`flex items-start gap-2.5 rounded-xl border border-gray-200 p-3 text-sm dark:border-neutral-800 ${series.nextOccurrences.length === 0 ? 'opacity-60' : ''}`}>
                            <input type="radio" name="scope" checked={scope === 'this'} disabled={series.nextOccurrences.length === 0} onChange={() => setScope('this')} className="mt-0.5 accent-orange-600" />
                            <span><span className="font-medium text-gray-900 dark:text-white">Only one date</span>
                                <span className={`block text-xs ${muted}`}>Changes a single date, or moves it to another time. Later changes to the series leave that date alone.</span></span>
                        </label>
                    </fieldset>

                    {scope === 'this' && (
                        <Field id="se-occurrence" label="Which date">
                            {({ id }) => (
                                <select id={id} value={eventId} onChange={(e) => setEventId(e.target.value)} className={input}>
                                    {series.nextOccurrences.map((o) => <option key={o.id} value={o.id}>{formatDayYear(o.startDate, o.timezone)} at {formatClock(o.startDate, o.timezone)}</option>)}
                                </select>
                            )}
                        </Field>
                    )}

                    {text('title', 'Title', { maxLength: EVENT_LIMITS.title.max })}
                    {text('shortDescription', 'Summary', { maxLength: EVENT_LIMITS.shortDescription })}
                    <Field id="se-description" label="Description" error={errors.description}>
                        {({ id, describedBy, invalid }) => (
                            <textarea id={id} rows={5} value={values.description} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={(e) => set('description', e.target.value)} className={`${input} ${invalid ? inputError : ''}`} />
                        )}
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="se-locationType" label="Format">
                            {({ id }) => <select id={id} value={values.locationType} onChange={(e) => set('locationType', e.target.value as SeriesEditValues['locationType'])} className={input}>{EVENT_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}</select>}
                        </Field>
                        {text('location', 'Location')}
                        {text('venue', 'Venue')}
                        {text('maxParticipants', 'Capacity', { hint: admin ? 'Empty means no limit.' : `Up to ${EVENT_LIMITS.memberCapacity}.` })}
                        {text('eventLink', 'Join link')}
                        {text('registrationLink', 'Registration link')}
                        {text('streamLink', 'Stream link')}
                        {text('durationMinutes', 'Length in minutes', { hint: `${SERIES_LIMITS.durationMinutes.min} to ${SERIES_LIMITS.durationMinutes.max}.` })}
                    </div>

                    {scope === 'this' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            {text('moveDate', 'Move to date', { type: 'date', hint: 'Leave empty to keep the time.' })}
                            {text('moveTime', 'Move to time', { type: 'time', hint: occurrence ? `In ${occurrence.timezone}.` : undefined })}
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                            {text('startTime', 'Start time', { type: 'time', hint: `In ${values.timezone}. The clock time stays the same through clock changes.` })}
                            {text('timezone', 'Time zone', { hint: 'An IANA zone, for example Europe/London.' })}
                            {text('until', 'Last date', { type: 'date', hint: 'Empty keeps it open.' })}
                            {text('count', 'Number of dates in all', { hint: `${SERIES_LIMITS.count.min} to ${SERIES_LIMITS.count.max}, or empty.` })}
                            {text('generateAheadDays', 'Create dates this many days ahead', { hint: `${SERIES_LIMITS.generateAheadDays.min} to ${SERIES_LIMITS.generateAheadDays.max}.` })}
                        </div>
                    )}

                    {formError && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{formError}</p>}
                    <div className="flex justify-end gap-3">
                        <button type="button" className={btnSecondary} disabled={patch.isPending} onClick={() => onOpenChange(false)}>Cancel</button>
                        <button type="submit" className={btnPrimary} disabled={patch.isPending}>
                            {patch.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save changes
                        </button>
                    </div>
                </form>
            </DialogShell>
        </>
    );
}

/** For the creator and administrators: counts, and edit, pause, resume and end with a confirmation */
export function SeriesManagePanel({ series }: { series: Series }) {
    const { user } = useAuth();
    const admin = isAdminRole(user?.role);
    const zone = useViewerZone() ?? 'UTC';
    const pause = usePauseSeries();
    const resume = useResumeSeries();
    const end = useEndSeries();
    const [editing, setEditing] = useState(false);
    const [confirm, setConfirm] = useState<'pause' | 'resume' | 'end' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const ended = series.status === 'ended';
    const counts = series.counts;
    const generated = series.lastGeneratedAt ? `${formatDayYear(series.lastGeneratedAt, zone)} ${formatClock(series.lastGeneratedAt, zone)}` : 'not yet';

    const close = () => { setConfirm(null); setError(null); };
    const fail = (err: unknown) => setError(eventErrorMessage(err));

    return (
        <section aria-labelledby="manage-heading" className={cardPad} data-testid="series-manage">
            <h2 id="manage-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                <ClipboardList className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Manage this series
            </h2>
            {counts && (
                <dl className="mb-4 grid grid-cols-3 gap-3 text-sm" data-testid="series-counts">
                    <div><dt className={muted}>Created dates</dt><dd className="text-lg font-semibold text-gray-900 dark:text-white">{counts.generated}</dd></div>
                    <div><dt className={muted}>Edited by hand</dt><dd className="text-lg font-semibold text-gray-900 dark:text-white">{counts.overridden}</dd></div>
                    <div><dt className={muted}>Waiting for review</dt><dd className="text-lg font-semibold text-gray-900 dark:text-white" data-testid="pending-count">{counts.pending}</dd></div>
                </dl>
            )}
            {!admin && (
                <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="review-note">
                    Occurrences wait for review. An administrator or another moderator approves each date before the public sees it
                    {counts && counts.pending > 0 ? <>; {counts.pending} {counts.pending === 1 ? 'is' : 'are'} waiting now. <Link href="/admin/events" className="font-medium underline">Open the review queue</Link>.</> : '.'}
                </p>
            )}
            <p className={`mb-4 text-xs ${muted}`}>
                Dates are created up to {series.generateAheadDays ?? SERIES_LIMITS.generateAheadDays.default} days ahead. Last run: {generated}.
            </p>
            {ended ? (
                <p className={`text-sm ${muted}`}>This series has ended and cannot be changed.</p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <button type="button" className={btnSecondary} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</button>
                    {series.status === 'active' ? (
                        <button type="button" className={btnSecondary} onClick={() => { setError(null); setConfirm('pause'); }}><Pause className="h-4 w-4" aria-hidden="true" /> Pause</button>
                    ) : (
                        <button type="button" className={btnSecondary} onClick={() => { setError(null); setConfirm('resume'); }}><Play className="h-4 w-4" aria-hidden="true" /> Resume</button>
                    )}
                    <button type="button" className={`${btnSecondary} text-red-800 dark:text-red-300`} onClick={() => { setError(null); setConfirm('end'); }}><Ban className="h-4 w-4" aria-hidden="true" /> End the series</button>
                </div>
            )}

            {editing && <EditDialog series={series} open={editing} onOpenChange={setEditing} />}

            <EventDialog
                open={confirm === 'pause'}
                onOpenChange={(o) => !o && close()}
                title="Pause this series?"
                description="No new dates are created while it is paused. Dates that already exist stay and members can still register."
                confirmLabel="Pause"
                pending={pause.isPending}
                error={error}
                onConfirm={() => pause.mutate({ id: series.id }, { onSuccess: close, onError: fail })}
            />
            <EventDialog
                open={confirm === 'resume'}
                onOpenChange={(o) => !o && close()}
                title="Resume this series?"
                description="New dates are created again, up to the number of days ahead you set."
                confirmLabel="Resume"
                pending={resume.isPending}
                error={error}
                onConfirm={() => resume.mutate({ id: series.id }, { onSuccess: close, onError: fail })}
            />
            <EventDialog
                open={confirm === 'end'}
                onOpenChange={(o) => !o && close()}
                title="End this series for good?"
                description="No more dates are created. Upcoming dates with registrations are cancelled and those members are told. Upcoming dates nobody joined are removed. Past dates stay. This cannot be undone."
                confirmLabel="End the series"
                destructive
                reason={{ label: 'Reason, shown to registered members', min: SERIES_LIMITS.reason.min, max: SERIES_LIMITS.reason.max, placeholder: 'For example: the host team is taking a break.' }}
                pending={end.isPending}
                error={error}
                onConfirm={(reason) => end.mutate({ id: series.id, reason }, { onSuccess: close, onError: fail })}
            />
        </section>
    );
}
