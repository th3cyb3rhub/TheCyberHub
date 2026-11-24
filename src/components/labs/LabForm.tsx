'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { btnDanger, btnPrimary, btnSecondary, input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';
import { Section } from '@/components/internships/CohortEditors';
import { useUnsavedGuard } from '@/components/internships/UnsavedGuard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { useCreateLab, useDeleteLab, useUpdateLab } from '@/hooks/queries/useLabs';
import { categoryLabel, DIFFICULTY_LABELS, LAB_STATUS_LABELS } from '@/lib/labs/display';
import { labErrorCode, labErrorMessage, unattachedDetails } from '@/lib/labs/errors';
import {
    buildCreatePayload, buildUpdatePayload, clearListErrors, emptyLab, FORM_LIMITS, formErrors, fromLab, hasVisibleField, publishNeedsFlag, TABLE_POINTS,
    unattachedErrors, validateLab, type LabFormValues,
} from '@/lib/labs/form';
import { LAB_CATEGORIES, LAB_DIFFICULTIES, type LabDetail, type LabStatus } from '@/types/lab';
import { FilesEditor, FlagsEditor, HintsEditor } from './LabFormEditors';
import { LabMarkdown } from './LabMarkdown';

const CREATE_STATUSES: LabStatus[] = ['draft', 'published'];
const EDIT_STATUSES: LabStatus[] = ['draft', 'published', 'archived'];

function InstructionsEditor({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
    const [preview, setPreview] = useState(false);
    const tab = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-orange-700 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-800'}`;
    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200" id="instructions-label">Instructions</span>
                <div role="group" aria-label="Instructions view" className="flex gap-1 rounded-xl border border-gray-200 p-1 dark:border-neutral-800">
                    <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={tab(!preview)}>Write</button>
                    <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={tab(preview)}>Preview</button>
                </div>
            </div>
            {preview ? (
                <div className="min-h-[12rem] rounded-xl border border-gray-300 p-4 dark:border-neutral-700" data-testid="instructions-preview">
                    {value.trim() ? <LabMarkdown content={value} /> : <p className={`text-sm ${muted}`}>Nothing to preview yet.</p>}
                    <p className={`mt-4 border-t border-gray-100 pt-3 text-xs dark:border-neutral-800 ${muted}`}>This is how members see it: sanitised markdown. HTML is shown as text, and only http and https links work.</p>
                </div>
            ) : (
                <Field id="instructions" label="Instructions" error={error} hint={`${value.length}/${FORM_LIMITS.instructions} characters. Markdown: headings, lists, links, code fences. A payload in a code fence is shown as text.`}>
                    {(p) => <textarea {...p} rows={14} value={value} onChange={(e) => onChange(e.target.value)} className={`${input} font-mono text-xs sm:text-sm ${error ? inputError : ''}`} aria-labelledby="instructions-label" />}
                </Field>
            )}
        </div>
    );
}

/** Create and edit share this form. An edit sends only what changed, and flags only when new ones were typed. */
export function LabForm({ lab }: { lab?: LabDetail }) {
    const router = useRouter();
    const { addToast } = useToast();
    const edit = !!lab;
    const create = useCreateLab();
    const update = useUpdateLab();
    const remove = useDeleteLab();
    const pending = create.isPending || update.isPending;
    const flagCount = lab?.admin?.flagCount ?? null;

    const [initial, setInitial] = useState<LabFormValues>(() => (lab ? fromLab(lab) : emptyLab()));
    const [values, setValues] = useState<LabFormValues>(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<{ message: string; lines: string[] } | null>(null);
    const [saved, setSaved] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [offerArchive, setOfferArchive] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const bannerRef = useRef<HTMLDivElement>(null);

    // What the person changed, as the API would receive it
    const dirty = !saved && Object.keys(buildUpdatePayload(initial, values)).length > 0;

    // A newer copy of the lab replaces the form while nothing was typed; once there are edits the form keeps them
    const [seen, setSeen] = useState(lab);
    if (lab !== seen) {
        setSeen(lab);
        if (lab && !dirty) {
            const fresh = fromLab(lab);
            setInitial(fresh);
            setValues(fresh);
            setErrors({});
            setBanner(null);
        }
    }

    const leaveDialog = useUnsavedGuard(dirty);

    const set = <K extends keyof LabFormValues>(key: K, value: LabFormValues[K]) => {
        setValues((old) => ({ ...old, [key]: value }));
        setErrors((old) => (old[key] ? { ...old, [key]: '' } : old));
    };
    const setList = <K extends 'hints' | 'files' | 'flags'>(key: K, rows: LabFormValues[K]) => {
        const before = values[key] as { key: string }[];
        const after = rows as { key: string }[];
        const sameRows = before.length === after.length && before.every((r, i) => r.key === after[i].key);
        const typed = sameRows ? after.flatMap((r, i) => (r === before[i] ? [] : [i])) : null;
        setValues((old) => ({ ...old, [key]: rows }));
        setErrors((old) => {
            const next = clearListErrors(old, key, typed);
            return key === 'flags' && next.status ? { ...next, status: '' } : next;
        });
    };

    const focusFirst = () => window.setTimeout(() => (formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? bannerRef.current)?.focus(), 0);
    const fail = (found: Record<string, string>, message: string) => {
        setErrors(found);
        setBanner({ message, lines: unattachedErrors(found) });
        setAttempt((n) => n + 1);
        focusFirst();
    };

    const onError = (err: unknown) => {
        const fields = formErrors(err);
        const code = labErrorCode(err);
        if (code === 'LAB_SLUG_TAKEN') fields.slug = labErrorMessage(err);
        if (code === 'LAB_NOT_READY') { fields.status = labErrorMessage(err); fields.flags = fields.flags || 'Add at least one flag'; }
        unattachedDetails(err).forEach((m, i) => { fields[`form.${i}`] = m; });
        const marked = Object.keys(fields).filter(hasVisibleField).length;
        fail(fields, Object.keys(fields).length > 0
            ? `The server did not accept some fields.${marked > 0 ? ' The ones with a field are marked below.' : ''}`
            : labErrorMessage(err));
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setBanner(null);
        const found = validateLab(values, { initial: edit ? initial : undefined, flagCount: flagCount ?? 0 });
        const count = Object.keys(found).length;
        if (count > 0) {
            fail(found, `Please fix ${count === 1 ? 'one thing' : `${count} things`} before you save.`);
            return;
        }
        setErrors({});

        if (lab) {
            const payload = buildUpdatePayload(initial, values);
            if (Object.keys(payload).length === 0) {
                addToast({ variant: 'info', message: 'Nothing changed, so there is nothing to save.' });
                return;
            }
            update.mutate({ slug: lab.slug, payload }, {
                onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: 'Lab saved.' }); router.push('/admin/labs'); },
                onError,
            });
        } else {
            create.mutate(buildCreatePayload(values), {
                onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: values.status === 'published' ? 'Lab created and published.' : 'Lab saved as a draft.' }); router.push('/admin/labs'); },
                onError,
            });
        }
    };

    const doDelete = () => {
        if (!lab) return;
        setConfirmDelete(false);
        remove.mutate({ slug: lab.slug }, {
            onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: 'Lab deleted.' }); router.push('/admin/labs'); },
            onError: (err) => {
                // Completions are paid and final: the lab cannot go, but it can be archived
                if (labErrorCode(err) === 'LAB_HAS_COMPLETIONS') setOfferArchive(true);
                else addToast({ variant: 'error', message: labErrorMessage(err) });
            },
        });
    };

    const doArchive = () => {
        if (!lab) return;
        setOfferArchive(false);
        update.mutate({ slug: lab.slug, payload: { status: 'archived' } }, {
            onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: 'Lab archived. It is hidden from members, and completions and points stay.' }); router.push('/admin/labs'); },
            onError: (err) => addToast({ variant: 'error', message: labErrorMessage(err) }),
        });
    };

    const statuses = edit ? EDIT_STATUSES : CREATE_STATUSES;
    const err = (key: string) => errors[key] || undefined;
    const ownPoints = values.points.trim() === '' ? 0 : Number(values.points);
    const effective = Number.isInteger(ownPoints) && ownPoints > 0 ? ownPoints : TABLE_POINTS[values.difficulty];
    const needsFlag = publishNeedsFlag(values, flagCount ?? 0);

    return (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6" data-testid="lab-form" data-attempt={attempt}>
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

            <Section id="basics" title="The lab">
                <div className="space-y-4">
                    <Field id="title" label="Title" required error={err('title')}>
                        {(p) => <input {...p} type="text" value={values.title} maxLength={FORM_LIMITS.title + 20} onChange={(e) => set('title', e.target.value)} className={`${input} ${err('title') ? inputError : ''}`} />}
                    </Field>
                    <Field id="slug" label="Slug" error={err('slug')} hint={edit ? 'The address of the lab. Changing it breaks links people already have.' : 'Optional. Lower case words with hyphens. Left empty, it is made from the title.'}>
                        {(p) => <input {...p} type="text" value={values.slug} maxLength={FORM_LIMITS.slug + 20} autoCapitalize="off" spellCheck={false} onChange={(e) => set('slug', e.target.value)} className={`${input} font-mono ${err('slug') ? inputError : ''}`} />}
                    </Field>
                    <Field id="description" label="Description" required error={err('description')} hint={`${values.description.trim().length}/${FORM_LIMITS.description} characters. Plain text: HTML tags are removed. Shown on the lab page; the list shows the first lines.`}>
                        {(p) => <textarea {...p} rows={4} value={values.description} onChange={(e) => set('description', e.target.value)} className={`${input} ${err('description') ? inputError : ''}`} />}
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="category" label="Category" required error={err('category')}>
                            {(p) => <select {...p} value={values.category} onChange={(e) => set('category', e.target.value as LabFormValues['category'])} className={input}>{LAB_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select>}
                        </Field>
                        <Field id="difficulty" label="Difficulty" required error={err('difficulty')}>
                            {(p) => <select {...p} value={values.difficulty} onChange={(e) => set('difficulty', e.target.value as LabFormValues['difficulty'])} className={input}>{LAB_DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}</select>}
                        </Field>
                        <Field id="points" label="Points" error={err('points')} hint={`0 uses the table (easy ${TABLE_POINTS.easy}, medium ${TABLE_POINTS.medium}, hard ${TABLE_POINTS.hard}). This lab pays ${effective} before hints.`}>
                            {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={FORM_LIMITS.points} value={values.points} onChange={(e) => set('points', e.target.value)} className={`${input} ${err('points') ? inputError : ''}`} />}
                        </Field>
                        <Field id="estimatedMinutes" label="Estimated minutes" error={err('estimatedMinutes')} hint="Optional, 1 to 1440.">
                            {(p) => <input {...p} type="number" inputMode="numeric" min={1} max={FORM_LIMITS.estimatedMinutes} value={values.estimatedMinutes} onChange={(e) => set('estimatedMinutes', e.target.value)} className={`${input} ${err('estimatedMinutes') ? inputError : ''}`} />}
                        </Field>
                    </div>
                    <Field id="tags" label="Tags" error={err('tags')} hint={`Comma separated, up to ${FORM_LIMITS.tags}. Lower case; letters, numbers, spaces and . + # _ -`}>
                        {(p) => <input {...p} type="text" value={values.tags} onChange={(e) => set('tags', e.target.value)} className={`${input} ${err('tags') ? inputError : ''}`} />}
                    </Field>
                    <Field id="labUrl" label="Target link" error={err('labUrl')} hint="Optional. A public http or https link to the shared target. It opens in a new tab with a warning to use only this target.">
                        {(p) => <input {...p} type="url" inputMode="url" value={values.labUrl} onChange={(e) => set('labUrl', e.target.value)} className={`${input} ${err('labUrl') ? inputError : ''}`} />}
                    </Field>
                </div>
            </Section>

            <Section id="instructions-section" title="Instructions" description="Markdown. Members see it sanitised.">
                <InstructionsEditor value={values.instructions} onChange={(v) => set('instructions', v)} error={err('instructions')} />
            </Section>

            <Section id="hints-section" title="Hints" description={`Up to ${FORM_LIMITS.hints}. Each one takes its cost off the award when a member opens it. While members have the lab started, hints cannot be removed and an opened hint cannot change.`}>
                <HintsEditor rows={values.hints} onChange={(rows) => setList('hints', rows)} errors={errors} />
            </Section>

            <Section id="files-section" title="Files" description={`Up to ${FORM_LIMITS.files} downloads, hosted elsewhere.`}>
                <FilesEditor rows={values.files} onChange={(rows) => setList('files', rows)} errors={errors} />
            </Section>

            <Section id="flags-section" title="Flags (write only)">
                <FlagsEditor rows={values.flags} onChange={(rows) => setList('flags', rows)} errors={errors} flagCount={flagCount} />
            </Section>

            <Section id="status-section" title="Publishing">
                <Field id="status" label="Status" error={err('status')} hint={needsFlag ? 'Add at least one flag before you publish.' : 'Draft: only admins see it. Published: everyone. Archived: hidden, completions and points stay.'} className="sm:max-w-xs">
                    {(p) => <select {...p} value={values.status} onChange={(e) => set('status', e.target.value as LabStatus)} className={`${input} ${err('status') ? inputError : ''}`}>{statuses.map((s) => <option key={s} value={s}>{LAB_STATUS_LABELS[s]}</option>)}</select>}
                </Field>
            </Section>

            <div className="flex flex-wrap items-center justify-end gap-3">
                {edit ? (
                    <button type="button" className={`${btnDanger} sm:mr-auto`} onClick={() => setConfirmDelete(true)} disabled={remove.isPending || pending}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete lab
                    </button>
                ) : <p className={`mr-auto text-xs ${muted}`}>You can edit everything later, except the flags you cannot read back.</p>}
                <Link href="/admin/labs" className={btnSecondary}>Cancel</Link>
                <button type="submit" className={btnPrimary} disabled={pending || saved}>
                    {pending || saved ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    {edit ? 'Save changes' : values.status === 'published' ? 'Create and publish' : 'Save draft'}
                </button>
            </div>

            <ConfirmDialog
                open={confirmDelete}
                variant="danger"
                title={lab ? `Delete ${lab.title}?` : 'Delete this lab?'}
                description="The lab and every unfinished start are removed for good. A lab that members have completed cannot be deleted: you will be offered to archive it."
                confirmText="Delete lab"
                onCancel={() => setConfirmDelete(false)}
                onConfirm={doDelete}
            />
            <ConfirmDialog
                open={offerArchive}
                variant="warning"
                title="Members have completed this lab"
                description="Completions and the points they paid are final, so it cannot be deleted. Archive it instead: it disappears from the list and the lab page, and everything members earned stays."
                confirmText="Archive lab"
                cancelText="Keep it as it is"
                onCancel={() => setOfferArchive(false)}
                onConfirm={doArchive}
            />
            {leaveDialog}
        </form>
    );
}
