'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCreateEvent, useUpdateEvent } from '@/hooks/queries/useEvents';
import { eventErrorMessage, fieldErrors } from '@/lib/events/errors';
import {
    API_FIELD_TO_FORM, CATEGORY_LABELS, EVENT_LIMITS, FORMAT_LABELS, emptyEventForm, eventToFormValues, lockedFieldsFor,
    toCreatePayload, toUpdatePayload, validateEventForm, type EventFormErrors, type EventFormValues,
} from '@/lib/events/form';
import { effectiveStatus, localToInstant } from '@/lib/events/time';
import { EVENT_CATEGORIES, EVENT_FORMATS, type EventDetail } from '@/types/event';
import { EventDescription } from './EventDescription';
import { EventTimes } from './EventTimes';
import { btnPrimary, btnSecondary, cardPad, input, inputError, label as labelClass, muted } from './styles';

// The form field behind each API field, for the locked fields of a public event
const FORM_TO_API: Partial<Record<keyof EventFormValues, string>> = {
    startDate: 'startDate', startTime: 'startDate', endDate: 'endDate', endTime: 'endDate', timezone: 'timezone',
    rsvpDeadlineDate: 'rsvpDeadline', rsvpDeadlineTime: 'rsvpDeadline',
};

function timeZones(current: string): string[] {
    let zones: string[] = [];
    try {
        zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    } catch { /* older browsers */ }
    if (!zones.length) zones = ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];
    const set = new Set(zones);
    set.add('UTC');
    if (current) set.add(current);
    return Array.from(set).sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)));
}

interface FieldProps {
    name: keyof EventFormValues;
    label: string;
    error?: string;
    hint?: string;
    required?: boolean;
    children: (p: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

function Field({ name, label, error, hint, required, children }: FieldProps) {
    const id = `ef-${name}`;
    const hintId = hint ? `${id}-hint` : undefined;
    const errId = error ? `${id}-error` : undefined;
    const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
    return (
        <div>
            <label htmlFor={id} className={labelClass}>
                {label}{required && <span className="text-red-700 dark:text-red-400" aria-hidden="true"> *</span>}
                {required && <span className="sr-only"> (required)</span>}
            </label>
            {children({ id, describedBy, invalid: !!error })}
            {hint && <p id={hintId} className={`mt-1 text-xs ${muted}`}>{hint}</p>}
            {error && <p id={errId} className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
        </div>
    );
}

interface EventFormProps {
    mode: 'create' | 'edit';
    /** Administrators and owners: publish directly, set the type, feature, larger capacity */
    admin: boolean;
    /** Whether the signed-in member has a verified email (submitting needs it) */
    verified?: boolean;
    event?: EventDetail;
    cancelHref: string;
    onDone: (event: EventDetail) => void;
}

export function EventForm({ mode, admin, verified = true, event, cancelHref, onDone }: EventFormProps) {
    const create = useCreateEvent();
    const update = useUpdateEvent();
    const initial = useMemo(() => (event ? eventToFormValues(event) : emptyEventForm(undefined, admin)), [event, admin]);
    const [values, setValues] = useState<EventFormValues>(initial);
    const [errors, setErrors] = useState<EventFormErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [preview, setPreview] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);

    const status = event ? effectiveStatus(event, new Date()) : 'upcoming';
    const lockedApi = useMemo(() => lockedFieldsFor(event ?? null, admin, status), [event, admin, status]);
    const locked = (name: keyof EventFormValues) => lockedApi.includes(FORM_TO_API[name] ?? name);
    const pending = create.isPending || update.isPending;
    const blockedByEmail = mode === 'create' && !admin && !verified;
    const resubmitting = mode === 'edit' && event?.status === 'rejected';
    const showAfterEvent = mode === 'edit';

    const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => {
        setValues((v) => ({ ...v, [key]: value }));
        if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const zones = useMemo(() => timeZones(values.timezone), [values.timezone]);
    const startInstant = values.startDate && values.startTime ? localToInstant(values.startDate, values.startTime, values.timezone) : null;
    const endInstant = values.endTime ? localToInstant(values.endDate || values.startDate, values.endTime, values.timezone) : null;

    const focusFirstError = (errs: EventFormErrors) => {
        const order = Array.from(formRef.current?.querySelectorAll<HTMLElement>('[id^="ef-"]') ?? []);
        const first = order.find((el) => errs[el.id.replace(/^ef-/, '')]);
        first?.focus();
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        const checked = validateEventForm(values, { admin, creating: mode === 'create', initial: event ? initial : undefined });
        if (!checked.ok) {
            setErrors(checked.errors);
            setFormError('Some fields need your attention. Fix the marked fields and try again.');
            requestAnimationFrame(() => focusFirstError(checked.errors));
            return;
        }
        setErrors({});

        const onError = (err: unknown) => {
            const apiErrors = fieldErrors(err);
            const mapped: EventFormErrors = {};
            for (const [field, message] of Object.entries(apiErrors)) {
                mapped[(API_FIELD_TO_FORM[field] ?? field) as string] = message;
            }
            setErrors(mapped);
            setFormError(eventErrorMessage(err));
            if (Object.keys(mapped).length) requestAnimationFrame(() => focusFirstError(mapped));
        };

        if (mode === 'create') {
            create.mutate(toCreatePayload(values, { admin }), { onSuccess: onDone, onError });
        } else if (event) {
            const payload = toUpdatePayload(values, initial, { admin, locked: lockedApi });
            if (Object.keys(payload).length === 0 && !resubmitting) {
                setFormError('You have not changed anything.');
                return;
            }
            update.mutate({ id: event._id, payload }, { onSuccess: onDone, onError });
        }
    };

    const speakerErrors = (i: number) => errors[`speakers.${i}.name`];

    return (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6" aria-label={mode === 'create' ? 'Event details' : 'Edit event'}>
            {formError && (
                <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="form-error">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>{formError}</p>
                </div>
            )}
            {blockedByEmail && (
                <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    Verify your email address before you submit an event. Check your inbox for the verification link.
                </div>
            )}
            {mode === 'edit' && lockedApi.length > 0 && (
                <p className={`rounded-xl border border-gray-200 p-3 text-sm dark:border-neutral-800 ${muted}`}>
                    {status === 'ended'
                        ? 'This event is over, so only the recording, slides and notes can be changed.'
                        : 'This event is public, so a few fields (such as the title and category) can only be changed by an administrator.'}
                </p>
            )}

            <fieldset className={`${cardPad} space-y-4`}>
                <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">Basics</legend>
                <Field name="title" label="Title" required error={errors.title}>
                    {(p) => <input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.title} onChange={(e) => set('title', e.target.value)} maxLength={EVENT_LIMITS.title.max + 20} disabled={locked('title')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                </Field>
                <Field name="shortDescription" label="One-line summary" error={errors.shortDescription} hint={`Shown on cards. ${values.shortDescription.length}/${EVENT_LIMITS.shortDescription}`}>
                    {(p) => <input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} disabled={locked('shortDescription')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="category" label="Category" required error={errors.category}>
                        {(p) => (
                            <select id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.category} onChange={(e) => set('category', e.target.value as EventFormValues['category'])} disabled={locked('category')} className={`${input} ${p.invalid ? inputError : ''}`}>
                                <option value="">Choose a category</option>
                                {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                            </select>
                        )}
                    </Field>
                    <Field name="locationType" label="Format" required error={errors.locationType}>
                        {(p) => (
                            <select id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.locationType} onChange={(e) => set('locationType', e.target.value as EventFormValues['locationType'])} disabled={locked('locationType')} className={`${input} ${p.invalid ? inputError : ''}`}>
                                {EVENT_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
                            </select>
                        )}
                    </Field>
                </div>
            </fieldset>

            <fieldset className={`${cardPad} space-y-4`}>
                <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">When</legend>
                <Field name="timezone" label="Time zone" required error={errors.timezone} hint="The times below are in this zone. Everyone else sees them converted to their own.">
                    {(p) => (
                        <select id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.timezone} onChange={(e) => set('timezone', e.target.value)} disabled={locked('timezone')} className={`${input} ${p.invalid ? inputError : ''}`}>
                            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                        </select>
                    )}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="startDate" label="Start date" required error={errors.startDate}>
                        {(p) => <input id={p.id} type="date" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.startDate} onChange={(e) => set('startDate', e.target.value)} disabled={locked('startDate')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                    <Field name="startTime" label="Start time" required error={errors.startTime}>
                        {(p) => <input id={p.id} type="time" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.startTime} onChange={(e) => set('startTime', e.target.value)} disabled={locked('startTime')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                    <Field name="endDate" label="End date" error={errors.endDate} hint="Leave empty if it ends the same day.">
                        {(p) => <input id={p.id} type="date" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.endDate} onChange={(e) => set('endDate', e.target.value)} disabled={locked('endDate')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                    <Field name="endTime" label="End time" error={errors.endTime} hint="Without an end time the event is shown as two hours long.">
                        {(p) => <input id={p.id} type="time" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.endTime} onChange={(e) => set('endTime', e.target.value)} disabled={locked('endTime')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                    <Field name="rsvpDeadlineDate" label="Registration closes (date)" error={errors.rsvpDeadlineDate} hint="Optional. Empty means until the event starts.">
                        {(p) => <input id={p.id} type="date" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.rsvpDeadlineDate} onChange={(e) => set('rsvpDeadlineDate', e.target.value)} disabled={locked('rsvpDeadlineDate')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                    <Field name="rsvpDeadlineTime" label="Registration closes (time)" error={errors.rsvpDeadlineTime}>
                        {(p) => <input id={p.id} type="time" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.rsvpDeadlineTime} onChange={(e) => set('rsvpDeadlineTime', e.target.value)} disabled={locked('rsvpDeadlineTime')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                </div>
                {startInstant && (
                    <div className="rounded-xl bg-gray-50 p-3 dark:bg-neutral-800/60" aria-live="polite" data-testid="time-preview">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">How it will read</p>
                        <EventTimes event={{ startDate: startInstant.toISOString(), endDate: endInstant ? endInstant.toISOString() : null, timezone: values.timezone }} />
                    </div>
                )}
            </fieldset>

            <fieldset className={`${cardPad} space-y-4`}>
                <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">Where</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="location" label={values.locationType === 'online' ? 'Platform (optional)' : 'City or area'} required={values.locationType !== 'online'} error={errors.location}>
                        {(p) => <input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.location} onChange={(e) => set('location', e.target.value)} placeholder={values.locationType === 'online' ? 'Zoom, Discord, YouTube Live' : 'Berlin, Germany'} disabled={locked('location')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                    {values.locationType !== 'online' && (
                        <Field name="venue" label="Venue" error={errors.venue}>
                            {(p) => <input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.venue} onChange={(e) => set('venue', e.target.value)} disabled={locked('venue')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                        </Field>
                    )}
                </div>
                {values.locationType !== 'in-person' && (
                    <Field name="eventLink" label="Join link" error={errors.eventLink} hint="Only registered members see it, from 30 minutes before the start. https only.">
                        {(p) => <input id={p.id} type="url" inputMode="url" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.eventLink} onChange={(e) => set('eventLink', e.target.value)} placeholder="https://" disabled={locked('eventLink')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                )}
                <Field name="registrationLink" label="External registration link" error={errors.registrationLink} hint="Optional. Use it only if people must also sign up elsewhere. https only.">
                    {(p) => <input id={p.id} type="url" inputMode="url" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.registrationLink} onChange={(e) => set('registrationLink', e.target.value)} placeholder="https://" disabled={locked('registrationLink')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                </Field>
            </fieldset>

            <fieldset className={`${cardPad} space-y-4`}>
                <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">Details</legend>
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="ef-description" className={`${labelClass} mb-0`}>Description <span className="text-red-700 dark:text-red-400" aria-hidden="true">*</span><span className="sr-only"> (required)</span></label>
                        <button type="button" className="inline-flex items-center gap-1 rounded text-xs font-medium text-orange-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-orange-300" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {preview ? 'Edit' : 'Preview'}
                        </button>
                    </div>
                    {preview ? (
                        <div className="min-h-40 rounded-xl border border-gray-300 p-4 dark:border-neutral-700" data-testid="description-preview">
                            {values.description.trim() ? <EventDescription content={values.description} /> : <p className={`text-sm ${muted}`}>Nothing to preview yet.</p>}
                        </div>
                    ) : (
                        <textarea id="ef-description" value={values.description} onChange={(e) => set('description', e.target.value)} disabled={locked('description')} rows={9} aria-invalid={!!errors.description} aria-describedby="ef-description-hint" className={`${input} font-mono ${errors.description ? inputError : ''}`} />
                    )}
                    <p id="ef-description-hint" className={`mt-1 text-xs ${muted}`}>Markdown works: **bold**, lists, links, `code`. {values.description.length}/{EVENT_LIMITS.description}</p>
                    {errors.description && <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{errors.description}</p>}
                </div>
                <Field name="tags" label="Tags" error={errors.tags} hint="Comma separated, up to 10.">
                    {(p) => <input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.tags} onChange={(e) => set('tags', e.target.value)} disabled={locked('tags')} placeholder="beginner, web, forensics" className={`${input} ${p.invalid ? inputError : ''}`} />}
                </Field>
                <Field name="image" label="Cover image link" error={errors.image} hint="Optional. https only.">
                    {(p) => <input id={p.id} type="url" inputMode="url" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.image} onChange={(e) => set('image', e.target.value)} disabled={locked('image')} placeholder="https://" className={`${input} ${p.invalid ? inputError : ''}`} />}
                </Field>
            </fieldset>

            <fieldset className={`${cardPad} space-y-4`}>
                <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">Organizer and capacity</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="organizer" label="Organizer name" error={errors.organizer} hint={admin ? 'Defaults to TheCyberHub.' : 'Defaults to your name.'}>
                        {(p) => <input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.organizer} onChange={(e) => set('organizer', e.target.value)} disabled={locked('organizer')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                    <Field name="maxParticipants" label="Capacity" required={!admin} error={errors.maxParticipants} hint={admin ? 'Empty means no limit.' : `Required, up to ${EVENT_LIMITS.memberCapacity}.`}>
                        {(p) => <input id={p.id} type="number" inputMode="numeric" min={1} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.maxParticipants} onChange={(e) => set('maxParticipants', e.target.value)} disabled={locked('maxParticipants')} className={`${input} ${p.invalid ? inputError : ''}`} />}
                    </Field>
                </div>
                <label className="flex items-center gap-2.5 text-sm text-gray-800 dark:text-gray-200">
                    <input type="checkbox" checked={values.waitlistEnabled} onChange={(e) => set('waitlistEnabled', e.target.checked)} disabled={locked('waitlistEnabled')} className="h-4 w-4 accent-orange-600" />
                    Open a waiting list when the event is full
                </label>
                {admin && (
                    <div className="grid gap-4 border-t border-gray-200 pt-4 sm:grid-cols-2 dark:border-neutral-800">
                        <Field name="eventType" label="Event type" error={errors.eventType}>
                            {(p) => (
                                <select id={p.id} value={values.eventType} onChange={(e) => set('eventType', e.target.value as EventFormValues['eventType'])} className={input}>
                                    <option value="official">Official (TheCyberHub)</option>
                                    <option value="community">Community</option>
                                </select>
                            )}
                        </Field>
                        <label className="flex items-center gap-2.5 self-end pb-2.5 text-sm text-gray-800 dark:text-gray-200">
                            <input type="checkbox" checked={values.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} className="h-4 w-4 accent-orange-600" />
                            Feature this event on the events page
                        </label>
                    </div>
                )}
            </fieldset>

            <fieldset className={`${cardPad} space-y-3`}>
                <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">Speakers</legend>
                {values.speakers.length === 0 && <p className={`text-sm ${muted}`}>No speakers added.</p>}
                {values.speakers.map((s, i) => (
                    <div key={i} className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1fr_1fr_auto] dark:border-neutral-800">
                        <div>
                            <label htmlFor={`ef-speakers.${i}.name`} className={labelClass}>Name</label>
                            <input id={`ef-speakers.${i}.name`} value={s.name} onChange={(e) => set('speakers', values.speakers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-invalid={!!speakerErrors(i)} disabled={locked('speakers')} className={`${input} ${speakerErrors(i) ? inputError : ''}`} />
                            {speakerErrors(i) && <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{speakerErrors(i)}</p>}
                        </div>
                        <div>
                            <label htmlFor={`ef-speaker-title-${i}`} className={labelClass}>Role or company</label>
                            <input id={`ef-speaker-title-${i}`} value={s.title ?? ''} onChange={(e) => set('speakers', values.speakers.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} disabled={locked('speakers')} className={input} />
                        </div>
                        <button type="button" disabled={locked('speakers')} onClick={() => set('speakers', values.speakers.filter((_, j) => j !== i))} className="self-end rounded-lg p-2.5 text-gray-600 hover:bg-gray-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-gray-400 dark:hover:bg-neutral-800" aria-label={`Remove speaker ${i + 1}`}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                ))}
                {values.speakers.length < EVENT_LIMITS.speakers && (
                    <button type="button" className={btnSecondary} disabled={locked('speakers')} onClick={() => set('speakers', [...values.speakers, { name: '' }])}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> Add a speaker
                    </button>
                )}
            </fieldset>

            {showAfterEvent && (
                <fieldset className={`${cardPad} space-y-4`}>
                    <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">After the event</legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field name="recordingLink" label="Recording link" error={errors.recordingLink} hint="https only.">
                            {(p) => <input id={p.id} type="url" inputMode="url" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.recordingLink} onChange={(e) => set('recordingLink', e.target.value)} placeholder="https://" className={`${input} ${p.invalid ? inputError : ''}`} />}
                        </Field>
                        <Field name="slidesLink" label="Slides link" error={errors.slidesLink} hint="https only.">
                            {(p) => <input id={p.id} type="url" inputMode="url" aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.slidesLink} onChange={(e) => set('slidesLink', e.target.value)} placeholder="https://" className={`${input} ${p.invalid ? inputError : ''}`} />}
                        </Field>
                    </div>
                    <Field name="summaryNotes" label="Summary notes" error={errors.summaryNotes} hint={`Plain text. ${values.summaryNotes.length}/${EVENT_LIMITS.summaryNotes}`}>
                        {(p) => <textarea id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} value={values.summaryNotes} onChange={(e) => set('summaryNotes', e.target.value)} rows={4} className={`${input} resize-y ${p.invalid ? inputError : ''}`} />}
                    </Field>
                </fieldset>
            )}

            {mode === 'create' && !admin && (
                <p className={`text-sm ${muted}`}>A moderator reviews every community event, usually within 48 hours. You can have up to 3 events waiting at once and submit 5 per day.</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className={btnPrimary} disabled={pending || blockedByEmail}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {mode === 'create' ? (admin ? 'Publish event' : 'Submit for review') : resubmitting ? 'Save and send for review' : 'Save changes'}
                </button>
                <Link href={cancelHref} className={btnSecondary}>Cancel</Link>
            </div>
        </form>
    );
}
