'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCheckUrl, useCreateResource, useUpdateResource } from '@/hooks/queries/useResources';
import { DIFFICULTY_LABELS, RESOURCE_TOPIC_LABELS, RESOURCE_TYPE_LABELS } from '@/lib/learning/display';
import { duplicateOf, fieldErrors, learningErrorMessage } from '@/lib/learning/errors';
import { LIMITS, parseTags, resourceSubmitSchema, zodFieldErrors } from '@/lib/learning/schemas';
import { DIFFICULTIES } from '@/types/learning';
import { RESOURCE_TOPICS, RESOURCE_TYPES, type Resource, type UrlCheck } from '@/types/resource';
import { Field, fieldClass } from '@/components/learning/shared';
import { btnPrimary, btnSecondary, cardPad, label as labelClass, muted } from '@/components/events/styles';

interface Values {
    title: string; url: string; type: string; topic: string; difficulty: string; isFree: boolean; tags: string[]; description: string;
}

const blank: Values = { title: '', url: '', type: '', topic: '', difficulty: '', isFree: true, tags: [], description: '' };

const fromResource = (r: Resource): Values => ({
    title: r.title, url: r.url, type: r.type, topic: r.topic, difficulty: r.difficulty, isFree: r.isFree, tags: r.tags ?? [], description: r.description,
});

const CHECK_MESSAGES: Record<string, string> = {
    invalid: 'Enter a valid http or https link.',
    internal: 'The link must point to a public website.',
    blocked: 'Link shorteners and blocked sites cannot be shared. Use the full address of the page.',
};

/** What the duplicate check found, in words, with a link to the existing entry when there is one */
export function UrlCheckNote({ check, checking }: { check: UrlCheck | undefined; checking: boolean }) {
    if (checking) return <p className={`mt-1 flex items-center gap-1.5 text-xs ${muted}`} role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Checking the library</p>;
    if (!check) return null;
    if (!check.valid) return <p role="alert" className="mt-1 flex items-start gap-1.5 text-sm text-red-700 dark:text-red-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{CHECK_MESSAGES[check.reason ?? 'invalid'] ?? CHECK_MESSAGES.invalid}</p>;
    const dup = check.duplicate;
    if (dup) {
        return (
            <p role="alert" className="mt-1 flex items-start gap-1.5 text-sm text-amber-900 dark:text-amber-300" data-testid="duplicate">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                    {dup.status === 'approved' && dup.slug
                        ? <>Already in the library: <Link href={`/resources/${dup.slug}`} className="font-medium underline">{dup.title ?? 'view it'}</Link>.</>
                        // The server names a pending entry (id or slug) only when it is the caller's own
                        : dup.id || dup.slug
                            ? <>You already submitted this link. <Link href={`/resources/${dup.slug ?? dup.id}`} className="font-medium underline">{dup.title ?? 'View it'}</Link> is waiting for review.</>
                            : <>This link is already waiting for review.</>}
                </span>
            </p>
        );
    }
    return <p className="mt-1 flex items-center gap-1.5 text-xs text-green-800 dark:text-green-400" role="status"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> This link is not in the library yet{check.domain ? ` (${check.domain})` : ''}.</p>;
}

/** The tag box: Enter or a comma adds a chip, Backspace on an empty box removes the last one */
function TagInput({ id, tags, onChange, error }: { id: string; tags: string[]; onChange: (tags: string[]) => void; error?: string }) {
    const [text, setText] = useState('');
    const full = tags.length >= LIMITS.tags;
    const add = (raw: string) => {
        const next = parseTags(raw).filter((t) => !tags.includes(t));
        if (next.length) onChange([...tags, ...next].slice(0, LIMITS.tags));
        setText('');
    };
    return (
        <div>
            <div className={`flex flex-wrap gap-2 ${tags.length ? 'mb-2' : ''}`}>
                {tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-orange-100 py-0.5 pl-3 pr-1 text-sm text-orange-900 dark:bg-orange-500/15 dark:text-orange-300">
                        #{t}
                        <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded-full p-1 hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:hover:bg-orange-500/30">
                            <X className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Remove tag {t}</span>
                        </button>
                    </span>
                ))}
            </div>
            <input
                id={id}
                value={text}
                disabled={full}
                maxLength={LIMITS.tag.max + 1}
                onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); add(text); }
                    else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
                }}
                onBlur={() => text.trim() && add(text)}
                placeholder={full ? `At most ${LIMITS.tags} tags` : 'Type a tag and press Enter'}
                aria-describedby={`${id}-hint`}
                className={fieldClass(error)}
            />
            <p id={`${id}-hint`} className={`mt-1 text-xs ${muted}`}>{tags.length}/{LIMITS.tags} tags. Letters, numbers, spaces and . + # _ - only.</p>
        </div>
    );
}

interface ResourceFormProps {
    /** Edit mode: the entry being changed */
    resource?: Resource;
    /** The roadmap the visitor came from, for the hint */
    from?: string | null;
}

export function ResourceForm({ resource, from }: ResourceFormProps) {
    const router = useRouter();
    const { user } = useAuth();
    const create = useCreateResource();
    const update = useUpdateResource();
    const uid = useId();
    const editing = !!resource;
    const initial = resource ? fromResource(resource) : blank;
    const [values, setValues] = useState<Values>(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [duplicate, setDuplicate] = useState<ReturnType<typeof duplicateOf>>(null);
    const [checkedUrl, setCheckedUrl] = useState('');
    const [submitted, setSubmitted] = useState<Resource | null>(null);
    const errorSummary = useRef<HTMLDivElement>(null);

    // An edit that keeps the link needs no duplicate check: it would find itself
    const unchangedLink = editing && checkedUrl.trim() === resource.url;
    const check = useCheckUrl(unchangedLink ? '' : checkedUrl);
    const checkData = unchangedLink ? undefined : check.data;
    const blocking = !!checkData && (!checkData.valid || !!checkData.duplicate);
    const pending = create.isPending || update.isPending;

    const set = <K extends keyof Values>(key: K, value: Values[K]) => {
        setValues((v) => ({ ...v, [key]: value }));
        if (errors[key]) setErrors((e) => { const next = { ...e }; delete next[key]; return next; });
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pending) return;
        setFormError(null);
        setDuplicate(null);
        const parsed = resourceSubmitSchema.safeParse(values);
        if (!parsed.success) {
            setErrors(zodFieldErrors(parsed.error));
            setFormError('Fix the highlighted fields and try again.');
            window.setTimeout(() => errorSummary.current?.focus(), 0);
            return;
        }
        setErrors({});
        const onError = (err: unknown) => {
            setErrors(fieldErrors(err));
            setDuplicate(duplicateOf(err));
            setFormError(learningErrorMessage(err));
            window.setTimeout(() => errorSummary.current?.focus(), 0);
        };
        if (editing) {
            update.mutate({ slug: resource.slug, input: parsed.data }, { onSuccess: (saved) => router.push(`/resources/${saved.slug ?? resource.slug}`), onError });
        } else {
            create.mutate(parsed.data, { onSuccess: (saved) => setSubmitted(saved), onError });
        }
    };

    if (submitted) {
        return (
            <div className={`${cardPad} text-center`} role="status" data-testid="submitted">
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-700 dark:text-green-400" aria-hidden="true" />
                <h2 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">Submitted for review</h2>
                <p className={`mx-auto mt-2 max-w-md text-sm ${muted}`}>A moderator will look at it, usually within two days. You will get a notification with the decision, and you can follow it in My submissions.</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <Link href="/resources/my" className={btnPrimary}>My submissions</Link>
                    <button type="button" className={btnSecondary} onClick={() => { setSubmitted(null); setValues(blank); setCheckedUrl(''); }}>Submit another</button>
                    <Link href="/resources" className={btnSecondary}>Back to the library</Link>
                </div>
            </div>
        );
    }

    const needsVerify = user && user.isVerified === false && !['moderator', 'admin', 'owner'].includes(user.role);

    return (
        <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label={editing ? 'Edit resource' : 'Submit a resource'}>
            {needsVerify && <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">Verify your email address before you submit. New accounts can submit after a short wait.</p>}
            {from && !editing && <p className={`text-sm ${muted}`}>Suggesting a resource for <Link href={`/roadmaps/${from}`} className="font-medium text-orange-800 underline dark:text-orange-400">this roadmap</Link>. Once approved, a moderator can add it to the right step.</p>}
            {editing && resource.status === 'approved' && <p role="note" className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">Changing the title, link, type or description sends this resource back for review. It stays hidden until a moderator approves it again.</p>}
            {editing && resource.status === 'rejected' && <p role="note" className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">Saving sends this submission back to the review queue.</p>}

            {formError && (
                <div ref={errorSummary} tabIndex={-1} role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950 focus:outline-none dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="form-error">
                    {formError}
                    {duplicate?.slug && <> <Link href={`/resources/${duplicate.slug}`} className="font-medium underline">{duplicate.title ?? 'See the existing entry'}</Link></>}
                </div>
            )}

            <Field id={`${uid}-title`} label="Title" error={errors.title} hint="What the resource is called. 5 to 200 characters.">
                <input id={`${uid}-title`} value={values.title} onChange={(e) => set('title', e.target.value)} maxLength={LIMITS.title.max + 20} className={fieldClass(errors.title)} aria-invalid={!!errors.title} aria-describedby={errors.title ? `${uid}-title-error` : undefined} />
            </Field>

            <div>
                <label htmlFor={`${uid}-url`} className={labelClass}>Link</label>
                <input
                    id={`${uid}-url`}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    value={values.url}
                    onChange={(e) => { set('url', e.target.value); }}
                    onBlur={() => setCheckedUrl(values.url.trim())}
                    placeholder="https://"
                    className={fieldClass(errors.url)}
                    aria-invalid={!!errors.url}
                    aria-describedby={`${uid}-url-note`}
                />
                <div id={`${uid}-url-note`}>
                    {errors.url ? <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">{errors.url}</p> : (
                        <UrlCheckNote check={checkData} checking={check.isFetching && !unchangedLink && !!checkedUrl} />
                    )}
                    {!errors.url && !checkData && <p className={`mt-1 text-xs ${muted}`}>Use the full web address (http or https). Shortened links are not accepted.</p>}
                </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
                <Field id={`${uid}-type`} label="Type" error={errors.type}>
                    <select id={`${uid}-type`} value={values.type} onChange={(e) => set('type', e.target.value)} className={fieldClass(errors.type)} aria-invalid={!!errors.type}>
                        <option value="">Choose a type</option>
                        {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{RESOURCE_TYPE_LABELS[t]}</option>)}
                    </select>
                </Field>
                <Field id={`${uid}-topic`} label="Topic" error={errors.topic}>
                    <select id={`${uid}-topic`} value={values.topic} onChange={(e) => set('topic', e.target.value)} className={fieldClass(errors.topic)} aria-invalid={!!errors.topic}>
                        <option value="">Choose a topic</option>
                        {RESOURCE_TOPICS.map((t) => <option key={t} value={t}>{RESOURCE_TOPIC_LABELS[t]}</option>)}
                    </select>
                </Field>
                <Field id={`${uid}-difficulty`} label="Difficulty" error={errors.difficulty}>
                    <select id={`${uid}-difficulty`} value={values.difficulty} onChange={(e) => set('difficulty', e.target.value)} className={fieldClass(errors.difficulty)} aria-invalid={!!errors.difficulty}>
                        <option value="">Choose a level</option>
                        {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
                    </select>
                </Field>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-gray-800 dark:text-gray-200">
                <input type="checkbox" checked={values.isFree} onChange={(e) => set('isFree', e.target.checked)} className="h-4 w-4 accent-orange-600" /> Free to use (no payment needed to follow it)
            </label>

            <div>
                <label htmlFor={`${uid}-tags`} className={labelClass}>Tags <span className={`font-normal ${muted}`}>(optional)</span></label>
                <TagInput id={`${uid}-tags`} tags={values.tags} onChange={(tags) => set('tags', tags)} error={errors.tags} />
                {errors.tags && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">{errors.tags}</p>}
            </div>

            <Field id={`${uid}-description`} label="Why is it worth it?" error={errors.description} hint="Write your own summary. Do not paste text from the site.">
                <textarea id={`${uid}-description`} rows={5} value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={LIMITS.description.max + 50} className={`${fieldClass(errors.description)} resize-y`} aria-invalid={!!errors.description} aria-describedby={errors.description ? `${uid}-description-error` : `${uid}-description-hint`} />
                <p className={`mt-1 text-right text-xs ${values.description.trim().length > LIMITS.description.max ? 'text-red-700 dark:text-red-400' : muted}`} aria-hidden="true">{values.description.trim().length}/{LIMITS.description.max}</p>
            </Field>

            <div className="flex flex-wrap items-center gap-3 pt-2">
                <button type="submit" disabled={pending || blocking} className={btnPrimary}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {editing ? (resource.status === 'rejected' ? 'Save and resubmit' : 'Save changes') : 'Submit for review'}
                </button>
                <Link href={editing ? `/resources/${resource.slug}` : '/resources'} className={btnSecondary}>Cancel</Link>
                {blocking && <span className="text-sm text-amber-900 dark:text-amber-300">Fix the link problem above to continue.</span>}
            </div>
        </form>
    );
}
