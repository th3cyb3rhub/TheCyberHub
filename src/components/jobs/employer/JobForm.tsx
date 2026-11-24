'use client';

import Link from 'next/link';
import { useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Save, Send } from 'lucide-react';
import { btnPrimary, btnSecondary, card, input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';
import { useUnsavedGuard } from '@/components/internships/UnsavedGuard';
import { useToast } from '@/context/ToastContext';
import { useCreateJob, useSaveAndSubmitJob, useUpdateJob } from '@/hooks/queries/useJobs';
import { ApiError } from '@/lib/api';
import {
    CATEGORY_OPTIONS, COMMON_BENEFITS, CURRENCIES, EMPLOYMENT_OPTIONS, EXPERIENCE_OPTIONS, JOB_LIMITS, LOCATION_OPTIONS, PERIOD_OPTIONS,
} from '@/lib/jobs/constants';
import { daysLeftText } from '@/lib/jobs/display';
import { formErrors, jobErrorMessage } from '@/lib/jobs/errors';
import {
    emptyJobForm, jobToForm, toJobPayload, validateJobForm, type JobFormValues,
} from '@/lib/jobs/form';
import type { Job, JobStatus } from '@/types/job';
import { ListEditor } from './ListEditor';

const select = `${input} cursor-pointer`;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <fieldset className={`${card} p-5 sm:p-6`}>
            <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">{title}</legend>
            {description && <p className={`mb-4 text-sm ${muted}`}>{description}</p>}
            <div className="space-y-5">{children}</div>
        </fieldset>
    );
}

const doneMessage = (status: JobStatus | undefined, requeued: boolean): string => {
    if (requeued) return 'Saved. A change to the title, description or apply link sent it back to review, so it is not public until a reviewer approves it again.';
    if (status === 'approved') return 'Your job is live.';
    if (status === 'pending') return 'Sent for review. You will be told when a reviewer decides.';
    if (status === 'draft') return 'Draft saved. Send it for review when it is ready.';
    return 'Saved.';
};

interface Props {
    /** The job to edit; none for a new job */
    job?: Job;
    /** Administrators and owners name the company themselves and may feature the job */
    admin?: boolean;
    /** The address applicants are sent to when the poster gives neither link nor email */
    accountEmail?: string;
    /** The company an employer posts for, for the note above the form */
    companyName?: string;
}

/**
 * Create and edit share this form. It checks the limits of the API before it sends, puts the
 * problems next to their fields (the server's too, when it finds more), and keeps what was typed
 * when a call fails. A new job is sent for review or saved as a draft; an edit of a draft or a
 * rejected job can be saved and sent for review in one step.
 */
export function JobForm({ job, admin = false, accountEmail, companyName }: Props) {
    const router = useRouter();
    const { addToast } = useToast();
    const edit = !!job;
    const create = useCreateJob();
    const update = useUpdateJob();
    const resubmit = useSaveAndSubmitJob();
    const pending = create.isPending || update.isPending || resubmit.isPending;
    const id = useId();

    const [initial] = useState<JobFormValues>(() => (job ? jobToForm(job) : emptyJobForm()));
    const [values, setValues] = useState<JobFormValues>(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<{ message: string; link?: { href: string; label: string } } | null>(null);
    const [saved, setSaved] = useState(false);
    const bannerRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const dirty = !saved && JSON.stringify(values) !== JSON.stringify(initial);
    const leaveDialog = useUnsavedGuard(dirty);

    const set = <K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) => {
        setValues((old) => ({ ...old, [key]: value }));
        setErrors((old) => (old[key] ? { ...old, [key]: '' } : old));
    };

    const status = job?.status;
    const left = job?.expiresAt ? daysLeftText(job.expiresAt) : null;
    const expiryOptions = useMemo(() => {
        const cap = admin ? 365 : JOB_LIMITS.maxExpiryDays;
        return [14, 30, 60, 90, ...(admin ? [180, 365] : [])].filter((d) => d <= cap);
    }, [admin]);

    const fail = (err: unknown) => {
        const fields = formErrors(err);
        setErrors(fields);
        let link: { href: string; label: string } | undefined;
        if (err instanceof ApiError && (err.code === 'COMPANY_REJECTED' || err.code === 'COMPANY_REQUIRED')) link = { href: '/employer/company', label: 'Open your company profile' };
        setBanner({ message: Object.keys(fields).length ? 'Some fields need attention. The server checked them again.' : jobErrorMessage(err), link });
        window.setTimeout(() => {
            const first = Object.keys(fields)[0];
            const target = first ? formRef.current?.querySelector<HTMLElement>(`[data-field="${id}-${first}"] input, [data-field="${id}-${first}"] textarea, [data-field="${id}-${first}"] select`) : null;
            (target ?? bannerRef.current)?.focus();
        }, 0);
    };

    const run = async (mode: 'draft' | 'send' | 'save' | 'resubmit') => {
        setBanner(null);
        const problems = validateJobForm(values, { admin });
        setErrors(problems);
        if (Object.keys(problems).length) {
            setBanner({ message: `Fix ${Object.keys(problems).length === 1 ? '1 problem' : `${Object.keys(problems).length} problems`} before you continue.` });
            window.setTimeout(() => {
                const first = Object.keys(problems)[0];
                const target = formRef.current?.querySelector<HTMLElement>(`[data-field="${id}-${first}"] input, [data-field="${id}-${first}"] textarea, [data-field="${id}-${first}"] select`);
                (target ?? bannerRef.current)?.focus();
            }, 0);
            return;
        }
        try {
            if (!job) {
                const made = await create.mutateAsync(toJobPayload(values, { admin, saveAsDraft: mode === 'draft' }));
                addToast({ variant: 'success', message: doneMessage(made.status, false) });
            } else if (mode === 'resubmit') {
                const done = await resubmit.mutateAsync({ id: job._id, payload: toJobPayload(values, { admin, edit: true }) });
                addToast({ variant: 'success', message: doneMessage(done.status, false) });
            } else {
                const done = await update.mutateAsync({ id: job._id, payload: toJobPayload(values, { admin, edit: true }) });
                addToast({ variant: 'success', message: doneMessage(done.status, job.status === 'approved' && done.status === 'pending') });
            }
            setSaved(true);
            router.push('/employer');
        } catch (err) {
            fail(err);
        }
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        void run(!edit ? 'send' : 'save');
    };

    const f = (key: string) => `${id}-${key}`;
    const wrap = (key: keyof JobFormValues | string, label: string, control: (p: { id: string; 'aria-invalid': boolean | undefined; 'aria-describedby': string | undefined; 'aria-required': boolean | undefined }) => React.ReactNode, opts: { required?: boolean; hint?: string; className?: string } = {}) => (
        <Field id={f(key)} label={label} required={opts.required} hint={opts.hint} error={errors[key]} className={opts.className}>{control}</Field>
    );
    const invalid = (key: string) => (errors[key] ? inputError : '');

    return (
        <form ref={formRef} onSubmit={submit} noValidate className="space-y-6" data-testid="job-form">
            {leaveDialog}
            {banner && (
                <div ref={bannerRef} tabIndex={-1} role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="form-banner">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                        <p>{banner.message}</p>
                        {banner.link && <p className="mt-1"><Link href={banner.link.href} className="font-medium underline">{banner.link.label}</Link></p>}
                    </div>
                </div>
            )}

            {edit && status === 'rejected' && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="rejected-note">
                    <p className="font-medium">A reviewer did not approve this job.</p>
                    {job?.moderation?.reason && <p className="mt-1">Reason: {job.moderation.reason}</p>}
                    <p className="mt-1">Fix what the reviewer pointed out, then save and resubmit it.</p>
                </div>
            )}
            {edit && (status === 'approved' || status === 'pending') && (
                <p className={`rounded-xl border border-gray-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900/60 ${muted}`}>
                    Changing the title, the description or how to apply sends a live job back to review unless your company is verified.
                </p>
            )}
            {!edit && companyName && (
                <p className={`text-sm ${muted}`}>Posting for <strong className="text-gray-900 dark:text-white">{companyName}</strong>. The company name, logo and website come from your company profile.</p>
            )}

            <Section title="The role">
                {wrap('title', 'Job title', (p) => (
                    <>
                        <input {...p} type="text" value={values.title} onChange={(e) => set('title', e.target.value)} maxLength={JOB_LIMITS.titleMax + 20} placeholder="Senior penetration tester" className={`${input} ${invalid('title')}`} autoComplete="off" />
                        <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{values.title.trim().length}/{JOB_LIMITS.titleMax}</p>
                    </>
                ), { required: true })}
                {wrap('description', 'Description', (p) => (
                    <>
                        <textarea {...p} rows={10} value={values.description} onChange={(e) => set('description', e.target.value)} placeholder="What the team does, what this person will work on, how the hiring works." className={`${input} resize-y ${invalid('description')}`} />
                        <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{values.description.trim().length}/{JOB_LIMITS.descriptionMax}</p>
                    </>
                ), { required: true, hint: `At least ${JOB_LIMITS.descriptionMin} characters. Plain text and simple markdown; links must start with http or https.` })}
                <div className="grid gap-5 sm:grid-cols-2">
                    {wrap('category', 'Category', (p) => (
                        <select {...p} value={values.category} onChange={(e) => set('category', e.target.value as JobFormValues['category'])} className={select}>
                            {CATEGORY_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    ))}
                    {wrap('experienceLevel', 'Experience level', (p) => (
                        <select {...p} value={values.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value as JobFormValues['experienceLevel'])} className={select}>
                            {EXPERIENCE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    ))}
                    {wrap('employmentType', 'Employment type', (p) => (
                        <select {...p} value={values.employmentType} onChange={(e) => set('employmentType', e.target.value as JobFormValues['employmentType'])} className={select}>
                            {EMPLOYMENT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    ))}
                    {wrap('locationType', 'Where the work happens', (p) => (
                        <select {...p} value={values.locationType} onChange={(e) => set('locationType', e.target.value as JobFormValues['locationType'])} className={select}>
                            {LOCATION_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    ))}
                </div>
                {wrap('location', 'Location', (p) => (
                    <input {...p} type="text" value={values.location} onChange={(e) => set('location', e.target.value)} maxLength={JOB_LIMITS.locationMax + 20} placeholder={values.locationType === 'remote' ? 'Worldwide, EU time zones...' : 'Berlin, Germany'} className={`${input} ${invalid('location')}`} />
                ), { hint: values.locationType === 'remote' ? 'Optional for a remote job.' : 'The city or region of the office.' })}
            </Section>

            <Section title="Pay" description="Optional, and it helps: jobs with a pay range get more applications.">
                <div className="grid gap-5 sm:grid-cols-4">
                    {wrap('salary.min', 'Lowest pay', (p) => <input {...p} type="number" inputMode="numeric" min={0} value={values.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} className={`${input} ${invalid('salary.min')}`} />)}
                    {wrap('salary.max', 'Highest pay', (p) => <input {...p} type="number" inputMode="numeric" min={0} value={values.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} className={`${input} ${invalid('salary.max')}`} />)}
                    {wrap('salary.currency', 'Currency', (p) => (
                        <select {...p} value={values.salaryCurrency} onChange={(e) => set('salaryCurrency', e.target.value)} className={select}>
                            {Array.from(new Set([...CURRENCIES, values.salaryCurrency])).map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    ))}
                    {wrap('salaryPeriod', 'Per', (p) => (
                        <select {...p} value={values.salaryPeriod} onChange={(e) => set('salaryPeriod', e.target.value as JobFormValues['salaryPeriod'])} className={select}>
                            {PERIOD_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    ))}
                </div>
            </Section>

            <Section title="Requirements and perks">
                <ListEditor id={f('requirements')} label="Requirements" noun="requirement" items={values.requirements} onChange={(v) => set('requirements', v)} maxItems={JOB_LIMITS.listItems} maxLength={JOB_LIMITS.listItemLength} placeholder="3+ years of web application testing" error={errors.requirements} />
                <ListEditor id={f('responsibilities')} label="Responsibilities" noun="responsibility" items={values.responsibilities} onChange={(v) => set('responsibilities', v)} maxItems={JOB_LIMITS.listItems} maxLength={JOB_LIMITS.listItemLength} placeholder="Run and report on penetration tests" error={errors.responsibilities} />
                <ListEditor id={f('skills')} label="Skills" noun="skill" items={values.skills} onChange={(v) => set('skills', v)} maxItems={JOB_LIMITS.listItems} maxLength={JOB_LIMITS.skillLength} placeholder="Burp Suite" hint="Short tags, up to 50 characters each." error={errors.skills} />
                <ListEditor id={f('benefits')} label="Benefits" noun="benefit" items={values.benefits} onChange={(v) => set('benefits', v)} maxItems={JOB_LIMITS.listItems} maxLength={JOB_LIMITS.benefitLength} placeholder="Conference budget" error={errors.benefits} suggestions={COMMON_BENEFITS} />
            </Section>

            <Section title="How to apply" description="People apply on your own site. TheCyberHub counts the clicks and does not receive applications.">
                {wrap('applyUrl', 'Application link', (p) => (
                    <input {...p} type="url" value={values.applyUrl} onChange={(e) => set('applyUrl', e.target.value)} placeholder="https://careers.example.com/apply/123" className={`${input} ${invalid('applyUrl')}`} autoComplete="off" />
                ), { hint: 'Must start with http:// or https://.' })}
                {wrap('applyEmail', 'Application email', (p) => (
                    <input {...p} type="email" value={values.applyEmail} onChange={(e) => set('applyEmail', e.target.value)} placeholder="careers@example.com" className={`${input} ${invalid('applyEmail')}`} autoComplete="off" />
                ), { hint: !edit && accountEmail ? `If you add neither a link nor an email, applicants are sent to your account email, ${accountEmail}, and it is shown on the job page.` : 'Shown on the job page. Used when there is no link.' })}
                <div className="grid gap-5 sm:grid-cols-2">
                    {wrap('applicationDeadline', 'Apply by', (p) => (
                        <input {...p} type="date" value={values.applicationDeadline} onChange={(e) => set('applicationDeadline', e.target.value)} className={`${input} ${invalid('applicationDeadline')}`} />
                    ), { hint: 'Optional. It is shown to applicants; it does not close the job.' })}
                    {wrap('runFor', 'Keep the job public for', (p) => (
                        <select {...p} value={values.runFor} onChange={(e) => set('runFor', e.target.value)} className={select}>
                            <option value="">{edit ? `Keep the current end date${left ? ` (${left})` : ''}` : 'The default: 30 days'}</option>
                            {expiryOptions.map((d) => <option key={d} value={String(d)}>{d} days from now</option>)}
                        </select>
                    ), { hint: `A job ends on its own date and can be reopened. Up to ${admin ? 365 : JOB_LIMITS.maxExpiryDays} days.` })}
                </div>
            </Section>

            {admin && (
                <Section title="Company (administrators and owners)" description="Employers never set these: their company profile does. Here you post for any company name.">
                    {wrap('company', 'Company name', (p) => <input {...p} type="text" value={values.company} onChange={(e) => set('company', e.target.value)} maxLength={JOB_LIMITS.companyName.max + 20} className={`${input} ${invalid('company')}`} />, { required: true })}
                    <div className="grid gap-5 sm:grid-cols-2">
                        {wrap('companyLogo', 'Logo address', (p) => <input {...p} type="url" value={values.companyLogo} onChange={(e) => set('companyLogo', e.target.value)} className={`${input} ${invalid('companyLogo')}`} />)}
                        {wrap('companyWebsite', 'Website', (p) => <input {...p} type="url" value={values.companyWebsite} onChange={(e) => set('companyWebsite', e.target.value)} className={`${input} ${invalid('companyWebsite')}`} />)}
                    </div>
                    {wrap('companyDescription', 'About the company', (p) => <textarea {...p} rows={3} value={values.companyDescription} onChange={(e) => set('companyDescription', e.target.value)} className={`${input} resize-y ${invalid('companyDescription')}`} />)}
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input type="checkbox" checked={values.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} className="h-4 w-4 accent-orange-600" /> Feature this job at the top of the list
                    </label>
                </Section>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-5 dark:border-neutral-800">
                <Link href="/employer" className={btnSecondary}>Cancel</Link>
                {!edit && (
                    <button type="button" className={btnSecondary} disabled={pending} onClick={() => void run('draft')} data-testid="save-draft">
                        {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Save as draft
                    </button>
                )}
                {edit && (status === 'draft' || status === 'rejected') && (
                    <button type="button" className={btnPrimary} disabled={pending} onClick={() => void run('resubmit')} data-testid="save-resubmit">
                        {resubmit.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        {status === 'rejected' ? 'Save and resubmit' : 'Save and send for review'}
                    </button>
                )}
                <button type="submit" className={edit && (status === 'draft' || status === 'rejected') ? btnSecondary : btnPrimary} disabled={pending} data-testid="save-job-form">
                    {(create.isPending && !pending) || update.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : edit ? <Save className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    {edit ? 'Save changes' : 'Post job'}
                </button>
            </div>
        </form>
    );
}
