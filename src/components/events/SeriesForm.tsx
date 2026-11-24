'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Repeat } from 'lucide-react';
import { useCreateSeries } from '@/hooks/queries/useEventSeries';
import { eventErrorMessage, fieldErrors } from '@/lib/events/errors';
import { CATEGORY_LABELS, EVENT_LIMITS, FORMAT_LABELS } from '@/lib/events/form';
import {
    describeRecurrence, emptySeriesForm, formatDuration, RULE_LABELS, seriesFieldKey, SERIES_LIMITS, startsOnBounds, toSeriesPayload, validateSeriesForm,
    WEEK_OF_MONTH_OPTIONS, type SeriesFormErrors, type SeriesFormValues,
} from '@/lib/events/series';
import { WEEKDAY_NAMES } from '@/lib/events/calendar';
import { isValidTimeZone } from '@/lib/events/time';
import { EVENT_CATEGORIES, EVENT_FORMATS, SERIES_RULES, type SeriesCreated } from '@/types/event';
import { btnPrimary, btnSecondary, cardPad, input, inputError, label as labelClass, muted } from './styles';

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
    name: keyof SeriesFormValues;
    label: string;
    error?: string;
    hint?: string;
    required?: boolean;
    children: (p: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

function Field({ name, label, error, hint, required, children }: FieldProps) {
    const id = `sf-${name}`;
    const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
    return (
        <div>
            <label htmlFor={id} className={labelClass}>
                {label}{required && <span className="text-red-700 dark:text-red-400" aria-hidden="true"> *</span>}
                {required && <span className="sr-only"> (required)</span>}
            </label>
            {children({ id, describedBy, invalid: !!error })}
            {hint && <p id={`${id}-hint`} className={`mt-1 text-xs ${muted}`}>{hint}</p>}
            {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{error}</p>}
        </div>
    );
}

/** Create a recurring series. Limits mirror the API, so a mistake is caught before the request. */
export function SeriesForm({ admin }: { admin: boolean }) {
    const create = useCreateSeries();
    const initial = useMemo(() => emptySeriesForm(undefined, admin), [admin]);
    const [values, setValues] = useState<SeriesFormValues>(initial);
    const [errors, setErrors] = useState<SeriesFormErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [created, setCreated] = useState<SeriesCreated | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const zones = useMemo(() => timeZones(values.timezone), [values.timezone]);
    const bounds = startsOnBounds();

    const set = <K extends keyof SeriesFormValues>(key: K, value: SeriesFormValues[K]) => {
        setValues((v) => ({ ...v, [key]: value }));
        if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const focusFirstError = (errs: SeriesFormErrors) => {
        const els = Array.from(formRef.current?.querySelectorAll<HTMLElement>('[id^="sf-"]') ?? []);
        els.find((el) => errs[el.id.replace(/^sf-/, '')])?.focus();
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        const checked = validateSeriesForm(values, { admin });
        if (!checked.ok) {
            setErrors(checked.errors);
            setFormError('Some fields need your attention. Fix the marked fields and try again.');
            requestAnimationFrame(() => focusFirstError(checked.errors));
            return;
        }
        setErrors({});
        create.mutate(toSeriesPayload(values, { admin }), {
            onSuccess: (series) => setCreated(series),
            onError: (err) => {
                const api = fieldErrors(err);
                const mapped: SeriesFormErrors = {};
                for (const [key, message] of Object.entries(api)) mapped[seriesFieldKey(key)] = message;
                setErrors(mapped);
                setFormError(eventErrorMessage(err));
                if (Object.keys(mapped).length) requestAnimationFrame(() => focusFirstError(mapped));
            },
        });
    };

    const text = (name: keyof SeriesFormValues, label: string, opts: { type?: string; hint?: string; required?: boolean; maxLength?: number; placeholder?: string; min?: string; max?: string } = {}) => (
        <Field name={name} label={label} error={errors[name]} hint={opts.hint} required={opts.required}>
            {({ id, describedBy, invalid }) => (
                <input id={id} type={opts.type ?? 'text'} value={String(values[name])} maxLength={opts.maxLength} placeholder={opts.placeholder} min={opts.min} max={opts.max}
                    aria-invalid={invalid || undefined} aria-describedby={describedBy}
                    onChange={(e) => set(name, e.target.value as never)} className={`${input} ${invalid ? inputError : ''}`} />
            )}
        </Field>
    );

    if (created) {
        return (
            <div className={cardPad} role="status" data-testid="series-created">
                <p className="mb-2 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-400" aria-hidden="true" /> Series created</p>
                <p className="mb-1 text-sm text-gray-800 dark:text-gray-200">{describeRecurrence(created.recurrence)}</p>
                <p className={`mb-4 text-sm ${muted}`}>
                    {created.generated} {created.generated === 1 ? 'date was' : 'dates were'} created.
                    {!admin && ' They wait for review before the public sees them.'}
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link href={`/events/series/${created.id}`} className={btnPrimary}>Open the series</Link>
                    <button type="button" className={btnSecondary} onClick={() => { setCreated(null); setValues(initial); }}>Create another</button>
                </div>
            </div>
        );
    }

    const weekly = values.rule !== 'monthly-by-weekday';
    const preview = !errors.interval && /^\d+$/.test(values.interval) && isValidTimeZone(values.timezone)
        ? describeRecurrence({
            rule: values.rule, interval: Number(values.interval), weekday: Number(values.weekday), weekOfMonth: weekly ? null : Number(values.weekOfMonth),
            startTime: values.startTime, timezone: values.timezone, until: values.until || null, count: values.count ? Number(values.count) : null,
        }) : null;

    return (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-8">
            {!admin && (
                <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" data-testid="review-note">
                    Occurrences wait for review. An administrator or another moderator approves each date before the public sees it, and you cannot approve your own.
                </p>
            )}

            <section className={`${cardPad} space-y-4`} aria-labelledby="sf-about">
                <h2 id="sf-about" className="text-lg font-semibold text-gray-900 dark:text-white">What happens</h2>
                {text('title', 'Title', { required: true, maxLength: EVENT_LIMITS.title.max, hint: 'Every date gets this title.' })}
                {text('shortDescription', 'One line summary', { maxLength: EVENT_LIMITS.shortDescription })}
                <Field name="description" label="Description" error={errors.description} required hint="Markdown is fine. Shown on every date.">
                    {({ id, describedBy, invalid }) => (
                        <textarea id={id} rows={6} value={values.description} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={(e) => set('description', e.target.value)} className={`${input} ${invalid ? inputError : ''}`} />
                    )}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="category" label="Category" error={errors.category} required>
                        {({ id, describedBy, invalid }) => (
                            <select id={id} value={values.category} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={(e) => set('category', e.target.value as SeriesFormValues['category'])} className={`${input} ${invalid ? inputError : ''}`}>
                                <option value="">Pick one</option>
                                {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                            </select>
                        )}
                    </Field>
                    <Field name="locationType" label="Format" error={errors.locationType}>
                        {({ id }) => <select id={id} value={values.locationType} onChange={(e) => set('locationType', e.target.value as SeriesFormValues['locationType'])} className={input}>{EVENT_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}</select>}
                    </Field>
                    {text('location', 'Location', { maxLength: EVENT_LIMITS.location, hint: values.locationType === 'online' ? 'Optional for online events.' : 'A city or a venue.' })}
                    {text('venue', 'Venue', { maxLength: EVENT_LIMITS.venue })}
                    {text('eventLink', 'Join link', { hint: 'Shown to registered members shortly before each date. https only.' })}
                    {text('registrationLink', 'Registration link', { hint: 'Only if you register people somewhere else.' })}
                    {text('streamLink', 'Stream link')}
                    {text('image', 'Image link')}
                    {text('tags', 'Tags', { hint: `Comma separated, up to ${EVENT_LIMITS.tags.count}.` })}
                    {text('organizer', 'Organizer name', { maxLength: EVENT_LIMITS.organizer, hint: 'Leave empty to use your own name.' })}
                    {text('maxParticipants', 'Capacity', { required: !admin, hint: admin ? 'Empty means no limit.' : `Up to ${EVENT_LIMITS.memberCapacity} for each date.` })}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"><input type="checkbox" checked={values.rsvpEnabled} onChange={(e) => set('rsvpEnabled', e.target.checked)} className="h-4 w-4 accent-orange-600" /> Members can register</label>
                    <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"><input type="checkbox" checked={values.waitlistEnabled} onChange={(e) => set('waitlistEnabled', e.target.checked)} className="h-4 w-4 accent-orange-600" /> Waiting list when full</label>
                </div>
            </section>

            <section className={`${cardPad} space-y-4`} aria-labelledby="sf-when">
                <h2 id="sf-when" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white"><Repeat className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> When it repeats</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field name="rule" label="How often" error={errors.rule} required>
                        {({ id }) => <select id={id} value={values.rule} onChange={(e) => set('rule', e.target.value as SeriesFormValues['rule'])} className={input}>{SERIES_RULES.map((r) => <option key={r} value={r}>{RULE_LABELS[r]}</option>)}</select>}
                    </Field>
                    {text('interval', values.rule === 'monthly-by-weekday' ? 'Every this many months' : values.rule === 'biweekly' ? 'Every this many times two weeks' : 'Every this many weeks', { required: true, type: 'number', min: String(SERIES_LIMITS.interval.min), max: String(SERIES_LIMITS.interval.max), hint: `${SERIES_LIMITS.interval.min} to ${SERIES_LIMITS.interval.max}.` })}
                    <Field name="weekday" label="Day of the week" error={errors.weekday} required>
                        {({ id }) => <select id={id} value={values.weekday} onChange={(e) => set('weekday', e.target.value)} className={input}>{WEEKDAY_NAMES.map((d, i) => <option key={d} value={String(i)}>{d}</option>)}</select>}
                    </Field>
                    {!weekly && (
                        <Field name="weekOfMonth" label="Which one of the month" error={errors.weekOfMonth} required>
                            {({ id }) => <select id={id} value={values.weekOfMonth} onChange={(e) => set('weekOfMonth', e.target.value)} className={input}>{WEEK_OF_MONTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
                        </Field>
                    )}
                    {text('startsOn', 'First date', { type: 'date', required: true, min: bounds.min, max: bounds.max, hint: 'A day in the time zone below. From 366 days back to 731 days ahead.' })}
                    {text('startTime', 'Start time', { type: 'time', required: true, hint: 'The clock time stays the same through daylight saving changes.' })}
                    <Field name="timezone" label="Time zone" error={errors.timezone} required>
                        {({ id, describedBy, invalid }) => (
                            <select id={id} value={values.timezone} aria-invalid={invalid || undefined} aria-describedby={describedBy} onChange={(e) => set('timezone', e.target.value)} className={`${input} ${invalid ? inputError : ''}`}>
                                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                            </select>
                        )}
                    </Field>
                    {text('durationMinutes', 'Length in minutes', { type: 'number', required: true, min: String(SERIES_LIMITS.durationMinutes.min), max: String(SERIES_LIMITS.durationMinutes.max), hint: /^\d+$/.test(values.durationMinutes) ? formatDuration(Number(values.durationMinutes)) : undefined })}
                    {text('until', 'Last date', { type: 'date', hint: 'Optional. Use this or a number of dates.' })}
                    {text('count', 'Number of dates in all', { type: 'number', min: String(SERIES_LIMITS.count.min), max: String(SERIES_LIMITS.count.max), hint: `Optional, up to ${SERIES_LIMITS.count.max}.` })}
                    {text('generateAheadDays', 'Create dates this many days ahead', { type: 'number', min: String(SERIES_LIMITS.generateAheadDays.min), max: String(SERIES_LIMITS.generateAheadDays.max), hint: `${SERIES_LIMITS.generateAheadDays.min} to ${SERIES_LIMITS.generateAheadDays.max}. New dates appear this far ahead.` })}
                </div>
                {preview && <p className="rounded-xl bg-gray-100 p-3 text-sm font-medium text-gray-900 dark:bg-neutral-800 dark:text-white" data-testid="rule-preview">{preview}</p>}
            </section>

            {formError && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">{formError}</p>}
            <div className="flex flex-wrap gap-3">
                <button type="submit" className={btnPrimary} disabled={create.isPending}>
                    {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Create the series
                </button>
                <Link href="/admin/events" className={btnSecondary}>Back to events</Link>
            </div>
        </form>
    );
}
