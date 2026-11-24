'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { btnPrimary, btnSecondary, input, inputError, muted } from '@/components/events/styles';
import { useToast } from '@/context/ToastContext';
import { useCreateCohort, useUpdateCohort } from '@/hooks/queries/useInternships';
import { COHORT_STATUS_LABELS, TYPE_LABELS } from '@/lib/internships/display';
import { formErrors, internshipErrorCode, internshipErrorMessage } from '@/lib/internships/errors';
import { ApiError } from '@/lib/api';
import {
    buildCreatePayload, buildUpdatePayload, clearListErrors, emptyCohort, FORM_LIMITS, fromCohort, hasVisibleField, LIST_FIELDS, unattachedErrors, validateCohort,
    type CohortFormValues,
} from '@/lib/internships/form';
import { COHORT_STATUSES, COHORT_TYPES, type CohortDetail, type CohortStatus } from '@/types/internship';
import { CustomFieldsEditor, Section, ShowcaseEditor, SyllabusEditor } from './CohortEditors';
import { Field } from './FormField';
import { useUnsavedGuard } from './UnsavedGuard';

const CREATE_STATUSES: CohortStatus[] = ['draft', 'open'];

/** Create and edit share this form. An edit sends only what changed. */
export function CohortForm({ cohort }: { cohort?: CohortDetail }) {
    const router = useRouter();
    const { addToast } = useToast();
    const edit = !!cohort;
    const create = useCreateCohort();
    const update = useUpdateCohort();
    const pending = create.isPending || update.isPending;

    const [initial, setInitial] = useState<CohortFormValues>(() => (cohort ? fromCohort(cohort) : emptyCohort()));
    const [values, setValues] = useState<CohortFormValues>(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<{ message: string; lines: string[] } | null>(null);
    // After a successful save the button stays off until the page has moved on
    const [saved, setSaved] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const bannerRef = useRef<HTMLDivElement>(null);
    const [attempt, setAttempt] = useState(0);

    // What the person changed, as the API would receive it: for a new program, anything but the blank form
    const dirty = !saved && Object.keys(buildUpdatePayload(initial, values)).length > 0;

    // A newer copy of the program (the page loaded it again, or somebody saved) replaces the form
    // while nothing was typed; once there are edits the form keeps them, measured against what was loaded first
    const [seen, setSeen] = useState(cohort);
    if (cohort !== seen) {
        setSeen(cohort);
        if (cohort && !dirty) {
            const fresh = fromCohort(cohort);
            setInitial(fresh);
            setValues(fresh);
            setErrors({});
            setBanner(null);
        }
    }

    const leaveDialog = useUnsavedGuard(dirty);

    const set = <K extends keyof CohortFormValues>(key: K, value: CohortFormValues[K]) => {
        setValues((old) => ({ ...old, [key]: value }));
        setErrors((old) => (old[key] ? { ...old, [key]: '' } : old));
    };

    // Errors of a list are keyed by the row's position. Typing clears that row's; adding, removing or
    // moving a row shifts the positions, so the list's errors go (they would point at the wrong row).
    const setList = <K extends (typeof LIST_FIELDS)[number]>(key: K, rows: CohortFormValues[K]) => {
        const before = values[key] as { key: string }[];
        const after = rows as { key: string }[];
        const sameRows = before.length === after.length && before.every((r, i) => r.key === after[i].key);
        const typed = sameRows ? after.flatMap((r, i) => (r === before[i] ? [] : [i])) : null;
        setValues((old) => ({ ...old, [key]: rows }));
        setErrors((old) => clearListErrors(old, key, typed));
    };

    const showShowcase = values.status === 'completed' || values.showcaseProjects.length > 0;

    // Move to the first field that needs attention after each failed attempt; with none, to the banner
    const focusFirst = () => window.setTimeout(() => (formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? bannerRef.current)?.focus(), 0);

    const fail = (found: Record<string, string>, message: string) => {
        setErrors(found);
        // An error with no input of its own (an image link, a date pair, a bare server detail) is read in the banner
        setBanner({ message, lines: unattachedErrors(found, { showShowcase }) });
        setAttempt((n) => n + 1);
        focusFirst();
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setBanner(null);
        const found = validateCohort(values, { initial: edit ? initial : undefined, acceptedCount: cohort?.acceptedCount });
        const count = Object.keys(found).length;
        if (count > 0) {
            fail(found, `Please fix ${count === 1 ? 'one thing' : `${count} things`} before you save.`);
            return;
        }
        setErrors({});

        const onError = (err: unknown) => {
            const fields = formErrors(err);
            if (internshipErrorCode(err) === 'INTERNSHIP_CAPACITY_TOO_LOW') fields.capacity = internshipErrorMessage(err);
            // A detail without a field name still has to be read
            if (err instanceof ApiError) err.details?.forEach((d, i) => { if (!d.field && d.message) fields[`form.${i}`] = d.message; });
            const marked = Object.keys(fields).filter((k) => hasVisibleField(k, { showShowcase })).length;
            fail(fields, Object.keys(fields).length > 0
                ? `The server did not accept some fields.${marked > 0 ? ' The ones with a field are marked below.' : ''}`
                : internshipErrorMessage(err));
        };

        if (cohort) {
            const payload = buildUpdatePayload(initial, values);
            if (Object.keys(payload).length === 0) {
                addToast({ variant: 'info', message: 'Nothing changed, so there is nothing to save.' });
                return;
            }
            update.mutate({ id: cohort._id, payload }, {
                onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: 'Program saved.' }); router.push('/admin/internships'); },
                onError,
            });
        } else {
            create.mutate(buildCreatePayload(values), {
                onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: values.status === 'open' ? 'Program created and open for applications.' : 'Program saved as a draft.' }); router.push('/admin/internships'); },
                onError,
            });
        }
    };

    const statuses = edit ? [...COHORT_STATUSES] : CREATE_STATUSES;
    const err = (key: string) => errors[key] || undefined;
    const zone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';

    return (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6" data-testid="cohort-form" data-attempt={attempt}>
            {banner && (
                <div ref={bannerRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="form-error">
                    <p>{banner.message}</p>
                    {banner.lines.length > 0 && (
                        <ul className="mt-2 list-disc space-y-0.5 pl-5" data-testid="form-error-lines">
                            {banner.lines.map((line) => <li key={line}>{line}</li>)}
                        </ul>
                    )}
                </div>
            )}

            <Section id="basics" title="The program">
                <div className="space-y-4">
                    <Field id="title" label="Title" required error={err('title')}>
                        {(p) => <input {...p} type="text" value={values.title} maxLength={FORM_LIMITS.title + 20} onChange={(e) => set('title', e.target.value)} className={`${input} ${err('title') ? inputError : ''}`} />}
                    </Field>
                    <Field id="description" label="Description" required error={err('description')} hint={`${values.description.trim().length}/${FORM_LIMITS.description} characters. Plain text.`}>
                        {(p) => <textarea {...p} rows={5} value={values.description} onChange={(e) => set('description', e.target.value)} className={`${input} ${err('description') ? inputError : ''}`} />}
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field id="type" label="Type" error={err('type')}>
                            {(p) => <select {...p} value={values.type} onChange={(e) => set('type', e.target.value as CohortFormValues['type'])} className={input}>{COHORT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select>}
                        </Field>
                        <Field id="status" label="Status" error={err('status')}
                            hint={edit ? 'Opening applications needs a deadline in the future.' : 'Save as a draft to prepare it, or open it straight away.'}>
                            {(p) => <select {...p} value={values.status} onChange={(e) => set('status', e.target.value as CohortStatus)} className={input}>{statuses.map((s) => <option key={s} value={s}>{COHORT_STATUS_LABELS[s]}</option>)}</select>}
                        </Field>
                        <Field id="capacity" label="Capacity" error={err('capacity')} hint={cohort?.acceptedCount ? `0 means no limit. ${cohort.acceptedCount} accepted so far.` : '0 means no limit.'}>
                            {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={FORM_LIMITS.capacity} value={values.capacity} onChange={(e) => set('capacity', e.target.value)} className={`${input} ${err('capacity') ? inputError : ''}`} />}
                        </Field>
                    </div>
                    {edit && (
                        <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                            <input type="checkbox" checked={values.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4 rounded border-gray-400 text-orange-700 focus:ring-orange-500" />
                            Visible to the public (switch off to hide this program everywhere)
                        </label>
                    )}
                </div>
            </Section>

            <Section id="dates" title="Dates" description={`Times are in your time zone${zone ? ` (${zone})` : ''}. The deadline must be on or before the start, and the end after the start.`}>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field id="applicationDeadline" label="Application deadline" required error={err('applicationDeadline')}>
                        {(p) => <input {...p} type="datetime-local" value={values.applicationDeadline} onChange={(e) => set('applicationDeadline', e.target.value)} className={`${input} ${err('applicationDeadline') ? inputError : ''}`} />}
                    </Field>
                    <Field id="startDate" label="Start" required error={err('startDate')}>
                        {(p) => <input {...p} type="datetime-local" value={values.startDate} onChange={(e) => set('startDate', e.target.value)} className={`${input} ${err('startDate') ? inputError : ''}`} />}
                    </Field>
                    <Field id="endDate" label="End" required error={err('endDate')}>
                        {(p) => <input {...p} type="datetime-local" value={values.endDate} onChange={(e) => set('endDate', e.target.value)} className={`${input} ${err('endDate') ? inputError : ''}`} />}
                    </Field>
                </div>
            </Section>

            <Section id="details" title="Details" description="One item per line. Shown as lists on the program page.">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="requirements" label="Requirements" error={err('requirements')} hint={`Up to ${FORM_LIMITS.listItems} lines of ${FORM_LIMITS.listItemLength} characters.`}>
                        {(p) => <textarea {...p} rows={5} value={values.requirements} onChange={(e) => set('requirements', e.target.value)} className={`${input} ${err('requirements') ? inputError : ''}`} />}
                    </Field>
                    <Field id="responsibilities" label="What participants will do" error={err('responsibilities')}>
                        {(p) => <textarea {...p} rows={5} value={values.responsibilities} onChange={(e) => set('responsibilities', e.target.value)} className={`${input} ${err('responsibilities') ? inputError : ''}`} />}
                    </Field>
                    <Field id="benefits" label="What participants gain" error={err('benefits')}>
                        {(p) => <textarea {...p} rows={5} value={values.benefits} onChange={(e) => set('benefits', e.target.value)} className={`${input} ${err('benefits') ? inputError : ''}`} />}
                    </Field>
                    <Field id="technologies" label="Technologies" error={err('technologies')} hint={`Up to ${FORM_LIMITS.technologies} lines.`}>
                        {(p) => <textarea {...p} rows={5} value={values.technologies} onChange={(e) => set('technologies', e.target.value)} className={`${input} ${err('technologies') ? inputError : ''}`} />}
                    </Field>
                </div>
            </Section>

            <Section id="syllabus" title="Curriculum" description="A row for each week. Shown in week order.">
                <SyllabusEditor rows={values.syllabus} onChange={(rows) => setList('syllabus', rows)} errors={errors} />
            </Section>

            <Section id="questions" title="Application questions" description="Extra questions applicants answer with their application. Text answers are shown to reviewers as plain text.">
                <CustomFieldsEditor rows={values.customFields} onChange={(rows) => setList('customFields', rows)} errors={errors} />
            </Section>

            {showShowcase && (
                <Section id="showcase" title="Showcase" description="What the cohort built. Shown on the program page and in the past programs list.">
                    <ShowcaseEditor rows={values.showcaseProjects} onChange={(rows) => setList('showcaseProjects', rows)} errors={errors} />
                </Section>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3">
                <p className={`mr-auto text-xs ${muted}`}>{edit ? 'Only the fields you change are sent.' : 'You can edit everything later.'}</p>
                <Link href="/admin/internships" className={btnSecondary}>Cancel</Link>
                <button type="submit" className={btnPrimary} disabled={pending || saved}>
                    {pending || saved ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    {edit ? 'Save changes' : values.status === 'open' ? 'Create and open' : 'Save draft'}
                </button>
            </div>
            {leaveDialog}
        </form>
    );
}
