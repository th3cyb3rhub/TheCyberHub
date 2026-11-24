'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Lock, Send } from 'lucide-react';
import { FullPageSpinner, useRequireLogin } from '@/components/events/PageShell';
import { btnPrimary, btnSecondary, card, cardPad, focusRing, input, inputError, muted, pageBg } from '@/components/events/styles';
import { useApplyInternship, useInternship } from '@/hooks/queries/useInternships';
import { ApiError } from '@/lib/api';
import {
    buildApplyPayload, emptyApplication, LIMITS, validateApplication, type ApplicationValues,
} from '@/lib/internships/application';
import { applyView } from '@/lib/internships/display';
import { formErrors, internshipErrorCode, internshipErrorMessage } from '@/lib/internships/errors';
import type { CustomField } from '@/types/internship';
import { Field } from './FormField';
import { ErrorState } from './ListStates';
import { ViewerTime } from './ViewerTime';

const LINK_FIELDS = [
    { name: 'githubUrl', label: 'GitHub profile', placeholder: 'https://github.com/username' },
    { name: 'linkedinUrl', label: 'LinkedIn profile', placeholder: 'https://linkedin.com/in/username' },
    { name: 'portfolioUrl', label: 'Portfolio or website', placeholder: 'https://example.com' },
    { name: 'resumeUrl', label: 'Resume link', placeholder: 'https://drive.google.com/...' },
] as const;

function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'error'; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className={`${card} p-8 text-center`} role={tone === 'error' ? 'alert' : 'status'}>
            {tone === 'error' ? <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" /> : <Lock className="mx-auto mb-3 h-8 w-8 text-gray-500" aria-hidden="true" />}
            <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            {children && <p className={`mx-auto mb-5 max-w-md text-sm ${muted}`}>{children}</p>}
            {action}
        </div>
    );
}

function CustomQuestion({ field, value, error, onChange }: { field: CustomField; value: string; error?: string; onChange: (v: string) => void }) {
    const id = `answer-${field._id}`;
    return (
        <Field id={id} label={field.label} required={field.required} error={error}
            hint={field.type === 'file' ? 'Paste a link to the file (Google Drive, Dropbox or similar). Make sure anyone with the link can open it.' : field.type === 'textarea' ? `Up to ${LIMITS.answerTextarea} characters.` : field.type === 'text' ? `Up to ${LIMITS.answerText} characters.` : undefined}>
            {(p) => {
                const cls = `${input} ${error ? inputError : ''}`;
                if (field.type === 'textarea') return <textarea {...p} rows={4} maxLength={LIMITS.answerTextarea} value={value} onChange={(e) => onChange(e.target.value)} className={cls} />;
                if (field.type === 'dropdown') {
                    return (
                        <select {...p} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
                            <option value="">Choose an option</option>
                            {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    );
                }
                return <input {...p} type={field.type === 'file' ? 'url' : 'text'} inputMode={field.type === 'file' ? 'url' : undefined} maxLength={field.type === 'file' ? LIMITS.url : LIMITS.answerText} value={value} onChange={(e) => onChange(e.target.value)} className={cls} placeholder={field.type === 'file' ? 'https://' : undefined} />;
            }}
        </Field>
    );
}

export function ApplyView({ id }: { id: string }) {
    const { user, ready } = useRequireLogin(`/internships/${id}/apply`);
    const query = useInternship(id);
    const apply = useApplyInternship();
    const [values, setValues] = useState<ApplicationValues>(emptyApplication);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const summaryId = useId();

    const cohort = query.data;
    const view = useMemo(() => (cohort ? applyView(cohort) : null), [cohort]);

    // After an error, move to the first field that needs attention
    const failed = useRef(0);
    useEffect(() => {
        if (failed.current === 0) return;
        const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        first?.focus();
    }, [errors]);

    if (!ready || !user) return <FullPageSpinner />;

    const shell = (children: React.ReactNode) => (
        <div className={pageBg}>
            <div className="mx-auto max-w-2xl px-4 pb-16 pt-24 sm:px-6">
                <Link href={`/internships/${id}`} className={`mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${focusRing}`}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {cohort ? `Back to ${cohort.title}` : 'Back to the program'}
                </Link>
                {children}
            </div>
        </div>
    );

    if (!cohort) {
        if (query.isError) {
            const missing = query.error instanceof ApiError && query.error.status === 404;
            return shell(missing
                ? <Notice title="This program is not available" action={<Link href="/internships" className={btnSecondary}>Back to internships</Link>}>It may have been removed, or it is not published yet.</Notice>
                : <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this program" />);
        }
        return <FullPageSpinner label="Loading program" />;
    }

    if (done) {
        return shell(
            <div className={`${card} p-8 text-center`} role="status" data-testid="apply-success">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-700 dark:text-green-400" aria-hidden="true" />
                <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">Application sent</h1>
                <p className={`mx-auto mb-6 max-w-md text-sm ${muted}`}>You will get a notification, and an email when your address is confirmed, as soon as a reviewer moves your application. You can follow it and withdraw it from your applications.</p>
                <div className="flex flex-wrap justify-center gap-2">
                    <Link href="/internships/applications" className={btnPrimary}>See my applications</Link>
                    <Link href={`/internships/${id}`} className={btnSecondary}>Back to the program</Link>
                </div>
            </div>,
        );
    }

    if (view && view.state !== 'can-apply') {
        return shell(
            view.state === 'applied'
                ? <Notice title="You have already applied" action={<Link href="/internships/applications" className={btnPrimary}>See my applications</Link>}>One application per program. You can follow it, or withdraw it, from your applications.</Notice>
                : <Notice title={view.state === 'full' ? 'This program is full' : 'Applications are closed'} action={<Link href={`/internships/${id}`} className={btnSecondary}>Back to the program</Link>}>{view.reason}</Notice>,
        );
    }

    const setValue = (name: keyof ApplicationValues, v: string) => {
        setValues((old) => ({ ...old, [name]: v }));
        setErrors((old) => (old[name] ? { ...old, [name]: '' } : old));
    };
    const setAnswer = (fieldId: string, v: string) => {
        setAnswers((old) => ({ ...old, [fieldId]: v }));
        setErrors((old) => (old[`answers.${fieldId}`] ? { ...old, [`answers.${fieldId}`]: '' } : old));
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setBanner(null);
        const found = validateApplication(values, cohort.customFields, answers);
        if (Object.keys(found).length > 0) {
            failed.current += 1;
            setErrors(found);
            return;
        }
        setErrors({});
        apply.mutate({ id, payload: buildApplyPayload(values, cohort.customFields, answers) }, {
            onSuccess: () => setDone(true),
            onError: (err) => {
                const fields = formErrors(err);
                const code = internshipErrorCode(err);
                if (Object.keys(fields).length > 0) {
                    failed.current += 1;
                    setErrors(fields);
                    setBanner('Some answers need your attention. They are marked below.');
                } else {
                    setBanner(internshipErrorMessage(err));
                }
                // The cohort changed under the form: show what is true now
                if (code === 'INTERNSHIP_CLOSED' || code === 'INTERNSHIP_ALREADY_APPLIED' || code === 'INTERNSHIP_FULL') void query.refetch();
            },
        });
    };

    const shown = Object.entries(errors).filter(([, m]) => !!m);

    return shell(
        <div className={`${cardPad} !p-6 sm:!p-8`}>
            <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">Apply to {cohort.title}</h1>
            <p className={`mb-6 text-sm ${muted}`}>
                Apply by <ViewerTime iso={cohort.applicationDeadline} kind="moment" />. Fields marked <span aria-hidden="true">*</span><span className="sr-only">with an asterisk</span> are required.
            </p>

            {banner && (
                <div role="alert" id={summaryId} className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="apply-error">
                    {banner}
                    {(internshipErrorCode(apply.error) === 'INTERNSHIP_ALREADY_APPLIED') && <> <Link href="/internships/applications" className="font-medium underline">See my applications</Link></>}
                </div>
            )}
            {!banner && shown.length > 0 && (
                <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
                    Please fix {shown.length === 1 ? 'one thing' : `${shown.length} things`} below before you send.
                </div>
            )}

            <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6">
                <Field id="coverLetter" label="Why do you want to join?" required error={errors.coverLetter}
                    hint={`${values.coverLetter.trim().length}/${LIMITS.coverLetter} characters. Tell the reviewers about yourself, your goals and why you fit.`}>
                    {(p) => <textarea {...p} rows={7} maxLength={LIMITS.coverLetter + 200} value={values.coverLetter} onChange={(e) => setValue('coverLetter', e.target.value)} className={`${input} ${errors.coverLetter ? inputError : ''}`} />}
                </Field>

                <fieldset className="grid gap-5 sm:grid-cols-2">
                    <legend className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Links (optional)</legend>
                    {LINK_FIELDS.map((f) => (
                        <Field key={f.name} id={f.name} label={f.label} error={errors[f.name]}>
                            {(p) => <input {...p} type="url" inputMode="url" value={values[f.name] ?? ''} onChange={(e) => setValue(f.name, e.target.value)} placeholder={f.placeholder} className={`${input} ${errors[f.name] ? inputError : ''}`} />}
                        </Field>
                    ))}
                </fieldset>

                {cohort.customFields.length > 0 && (
                    <fieldset className="space-y-5" data-testid="custom-questions">
                        <legend className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Questions from the team</legend>
                        {cohort.customFields.map((f) => (
                            <CustomQuestion key={f._id} field={f} value={answers[f._id] ?? ''} error={errors[`answers.${f._id}`]} onChange={(v) => setAnswer(f._id, v)} />
                        ))}
                    </fieldset>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-5 dark:border-neutral-800">
                    <p className={`text-xs ${muted}`}>Reviewers see your name, email, answers and links. You cannot edit an application after you send it, but you can withdraw it.</p>
                    <button type="submit" className={btnPrimary} disabled={apply.isPending}>
                        {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        {apply.isPending ? 'Sending' : 'Send application'}
                    </button>
                </div>
            </form>
        </div>,
    );
}
