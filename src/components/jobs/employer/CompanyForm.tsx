'use client';

import { useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { btnPrimary, card, input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';
import { useUnsavedGuard } from '@/components/internships/UnsavedGuard';
import { useBecomeEmployer, useSaveMyCompany } from '@/hooks/queries/useJobs';
import { JOB_LIMITS } from '@/lib/jobs/constants';
import { formErrors, jobErrorMessage } from '@/lib/jobs/errors';
import { companyToForm, toCompanyPayload, validateCompanyForm, type CompanyFormValues } from '@/lib/jobs/form';
import { COMPANY_SIZES, type Company } from '@/types/job';

interface Props {
    /** `setup` registers the organisation and makes the account an employer; `profile` edits it */
    mode: 'setup' | 'profile';
    company?: Company | null;
    /** The organisation name to start from in the setup */
    fallbackName?: string;
    onSaved: (company: Company) => void;
}

/**
 * The company profile. It names the employer on every job. A verified company that changes its name
 * or website goes back to review, and the form says so before the save.
 */
export function CompanyForm({ mode, company, fallbackName = '', onSaved }: Props) {
    const id = useId();
    const become = useBecomeEmployer();
    const save = useSaveMyCompany();
    const pending = become.isPending || save.isPending;
    const [initial] = useState<CompanyFormValues>(() => companyToForm(company, fallbackName));
    const [values, setValues] = useState<CompanyFormValues>(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const bannerRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const dirty = !done && JSON.stringify(values) !== JSON.stringify(initial);
    const leaveDialog = useUnsavedGuard(dirty);

    const set = <K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) => {
        setValues((old) => ({ ...old, [key]: value }));
        const field = key === 'linkedin' ? 'socialLinks.linkedin' : key === 'twitter' ? 'socialLinks.twitter' : key;
        setErrors((old) => (old[field] ? { ...old, [field]: '' } : old));
    };

    const focusFirst = (problems: Record<string, string>) => {
        window.setTimeout(() => {
            const first = Object.keys(problems).find((k) => problems[k]);
            const target = first ? formRef.current?.querySelector<HTMLElement>(`[data-field="${id}-${first}"] input, [data-field="${id}-${first}"] textarea, [data-field="${id}-${first}"] select`) : null;
            (target ?? bannerRef.current)?.focus();
        }, 0);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBanner(null);
        const problems = validateCompanyForm(values);
        setErrors(problems);
        if (Object.keys(problems).length) {
            setBanner(`Fix ${Object.keys(problems).length === 1 ? '1 problem' : `${Object.keys(problems).length} problems`} before you save.`);
            focusFirst(problems);
            return;
        }
        try {
            const payload = toCompanyPayload(values);
            const saved = mode === 'setup' ? await become.mutateAsync(payload) : await save.mutateAsync(payload);
            setDone(true);
            onSaved(saved);
        } catch (err) {
            const fields = formErrors(err);
            setErrors(fields);
            setBanner(Object.keys(fields).length ? 'Some fields need attention. The server checked them again.' : jobErrorMessage(err));
            focusFirst(Object.keys(fields).length ? fields : {});
        }
    };

    const invalid = (key: string) => (errors[key] ? inputError : '');
    const field = (key: string, label: string, control: Parameters<typeof Field>[0]['children'], opts: { required?: boolean; hint?: string; className?: string } = {}) => (
        <Field id={`${id}-${key}`} label={label} required={opts.required} hint={opts.hint} error={errors[key]} className={opts.className}>{control}</Field>
    );
    const wasVerified = company?.status === 'verified';

    return (
        <form ref={formRef} onSubmit={(e) => void submit(e)} noValidate className="space-y-6" data-testid="company-form">
            {leaveDialog}
            {banner && (
                <div ref={bannerRef} tabIndex={-1} role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="form-banner">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>{banner}</p>
                </div>
            )}
            <fieldset className={`${card} space-y-5 p-5 sm:p-6`}>
                <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">About the company</legend>
                {field('name', 'Company name', (p) => <input {...p} type="text" value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={JOB_LIMITS.companyName.max + 20} autoComplete="organization" className={`${input} ${invalid('name')}`} />, {
                    required: true,
                    hint: wasVerified ? 'Changing the name or the website sends a verified company back to review. Its jobs stay public while it waits.' : undefined,
                })}
                {field('description', 'Description', (p) => (
                    <>
                        <textarea {...p} rows={5} value={values.description} onChange={(e) => set('description', e.target.value)} placeholder="What the company does and what working there is like." className={`${input} resize-y ${invalid('description')}`} />
                        <p className={`mt-1 text-right text-xs ${muted}`} aria-hidden="true">{values.description.trim().length}/{JOB_LIMITS.companyDescription}</p>
                    </>
                ))}
                <div className="grid gap-5 sm:grid-cols-2">
                    {field('industry', 'Industry', (p) => <input {...p} type="text" value={values.industry} onChange={(e) => set('industry', e.target.value)} placeholder="Managed security" className={`${input} ${invalid('industry')}`} />)}
                    {field('size', 'Company size', (p) => (
                        <select {...p} value={values.size} onChange={(e) => set('size', e.target.value)} className={`${input} cursor-pointer ${invalid('size')}`}>
                            <option value="">Not shown</option>
                            {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} people</option>)}
                        </select>
                    ))}
                </div>
                {field('location', 'Headquarters', (p) => <input {...p} type="text" value={values.location} onChange={(e) => set('location', e.target.value)} placeholder="Berlin, Germany" className={`${input} ${invalid('location')}`} />)}
            </fieldset>

            <fieldset className={`${card} space-y-5 p-5 sm:p-6`}>
                <legend className="px-1 text-base font-semibold text-gray-900 dark:text-white">Links</legend>
                <p className={`text-sm ${muted}`}>Every link must start with https:// (or http://).</p>
                {field('website', 'Website', (p) => <input {...p} type="url" value={values.website} onChange={(e) => set('website', e.target.value)} placeholder="https://example.com" className={`${input} ${invalid('website')}`} autoComplete="url" />)}
                {field('logo', 'Logo address', (p) => <input {...p} type="url" value={values.logo} onChange={(e) => set('logo', e.target.value)} placeholder="https://example.com/logo.png" className={`${input} ${invalid('logo')}`} />, { hint: 'A link to an image. It is shown beside your jobs.' })}
                <div className="grid gap-5 sm:grid-cols-2">
                    {field('socialLinks.linkedin', 'LinkedIn', (p) => <input {...p} type="url" value={values.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="https://www.linkedin.com/company/example" className={`${input} ${invalid('socialLinks.linkedin')}`} />)}
                    {field('socialLinks.twitter', 'X (Twitter)', (p) => <input {...p} type="url" value={values.twitter} onChange={(e) => set('twitter', e.target.value)} placeholder="https://x.com/example" className={`${input} ${invalid('socialLinks.twitter')}`} />)}
                </div>
            </fieldset>

            <div className="flex justify-end">
                <button type="submit" className={btnPrimary} disabled={pending} data-testid="save-company">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    {mode === 'setup' ? 'Register as an employer' : 'Save profile'}
                </button>
            </div>
        </form>
    );
}
