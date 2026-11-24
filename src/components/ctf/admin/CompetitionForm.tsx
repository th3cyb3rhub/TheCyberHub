'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Ban, Loader2, Save, Trash2, Upload } from 'lucide-react';
import { btnDanger, btnPrimary, btnSecondary, input, inputError, muted } from '@/components/events/styles';
import { Field } from '@/components/internships/FormField';
import { Section } from '@/components/internships/CohortEditors';
import { useUnsavedGuard } from '@/components/internships/UnsavedGuard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { useCancelCtf, useCreateCtf, useDeleteCtf, useUpdateCtf } from '@/hooks/queries/useCtf';
import { uploadFile } from '@/lib/api';
import { ctfErrorCode, ctfErrorMessage, lockedFields, lockedFieldName, unattachedDetails } from '@/lib/ctf/errors';
import {
    buildCreatePayload, buildUpdatePayload, clearPrizeErrors, emptyCompetition, formErrors, fromCompetition, FORM_LIMITS, hasVisibleField,
    revertLocked, shiftZone, slugFromTitle, unattachedErrors, validateCompetition, type CtfFormValues,
} from '@/lib/ctf/form';
import { safeHref } from '@/lib/ctf/display';
import type { CtfCompetition } from '@/types/ctf';
import { ChallengeSetEditor } from './ChallengeSetEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { PlayersSection, PublishingSection, ScoringSection, WhenSection } from './FormSections';
import { PrizesEditor } from './PrizesEditor';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Players have solved this many challenges in total: the set, the mode and teams are then fixed */
const solvesOf = (c?: CtfCompetition) => (c?.challengeDetails ?? []).reduce((sum, d) => sum + (d.solveCount ?? 0), 0);

/** Create and edit share this form. An edit sends only what changed; the challenge set of an existing competition saves by itself. */
export function CompetitionForm({ competition }: { competition?: CtfCompetition }) {
    const router = useRouter();
    const { addToast } = useToast();
    const edit = !!competition;
    const create = useCreateCtf();
    const update = useUpdateCtf();
    const cancel = useCancelCtf();
    const remove = useDeleteCtf();
    const pending = create.isPending || update.isPending;

    const [initial, setInitial] = useState<CtfFormValues>(() => (competition ? fromCompetition(competition) : emptyCompetition()));
    const [values, setValues] = useState<CtfFormValues>(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<{ message: string; lines: string[] } | null>(null);
    const [locked, setLocked] = useState<string[]>([]);
    const [saved, setSaved] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [confirm, setConfirm] = useState<'delete' | 'cancel' | null>(null);
    const [uploading, setUploading] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);
    const bannerRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const solves = solvesOf(competition);
    // Fixed by the solves already on record: the server would refuse the change, so the form does not offer it
    const fixed = [...locked, ...(solves > 0 ? ['teamsEnabled', 'scoringMode'] : [])];

    // What the person changed, as the API would receive it
    const dirty = !saved && (Object.keys(buildUpdatePayload(initial, values)).length > 0 || (!edit && values.challenges.length > 0));

    // A newer copy replaces the form while nothing was typed; once there are edits the form keeps them
    const [seen, setSeen] = useState(competition);
    if (competition !== seen) {
        setSeen(competition);
        if (competition && !dirty) {
            const fresh = fromCompetition(competition);
            setInitial(fresh);
            setValues(fresh);
            setErrors({});
            setBanner(null);
        }
    }

    const leaveDialog = useUnsavedGuard(dirty);

    const set = <K extends keyof CtfFormValues>(key: K, value: CtfFormValues[K]) => {
        setValues((old) => ({ ...old, [key]: value }));
        setErrors((old) => {
            const next = { ...old };
            if (next[key]) next[key] = '';
            // The date errors belong to the two boxes of each moment
            if ((key === 'startDate' || key === 'startTime' || key === 'endDate' || key === 'endTime') && (next.startDate || next.endDate)) { next.startDate = ''; next.endDate = ''; }
            if ((key === 'frozenDate' || key === 'frozenTime') && next.frozenAt) next.frozenAt = '';
            if (key === 'teamsEnabled' && (next.minTeamSize || next.maxTeamSize)) { next.minTeamSize = ''; next.maxTeamSize = ''; }
            return next;
        });
    };
    const setPrizes = (rows: CtfFormValues['prizes']) => {
        const before = values.prizes;
        const sameRows = before.length === rows.length && before.every((r, i) => r.key === rows[i].key);
        const typed = sameRows ? rows.flatMap((r, i) => (r === before[i] ? [] : [i])) : null;
        setValues((old) => ({ ...old, prizes: rows }));
        setErrors((old) => clearPrizeErrors(old, typed));
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
        const code = ctfErrorCode(err);
        const named = lockedFields(err);
        if (code === 'CTF_SLUG_TAKEN') fields.slug = ctfErrorMessage(err);
        if (named.length > 0) {
            // Teams or solves exist: put the fields back and say which ones cannot change
            for (const f of named) fields[f] = `Cannot change ${lockedFieldName(f)} once teams or solves exist.`;
            setLocked((old) => Array.from(new Set([...old, ...named])));
            setValues((old) => revertLocked(initial, old, named));
        }
        unattachedDetails(err).forEach((m, i) => { fields[`form.${i}`] = m; });
        const marked = Object.keys(fields).filter(hasVisibleField).length;
        fail(fields, named.length > 0
            ? ctfErrorMessage(err)
            : Object.keys(fields).length > 0
                ? `The server did not accept some fields.${marked > 0 ? ' The ones with a field are marked below.' : ''}`
                : ctfErrorMessage(err));
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setBanner(null);
        const found = validateCompetition(values, { initial: edit ? initial : undefined });
        const count = Object.keys(found).length;
        if (count > 0) {
            fail(found, `Please fix ${count === 1 ? 'one thing' : `${count} things`} before you save.`);
            return;
        }
        setErrors({});

        if (competition) {
            const payload = buildUpdatePayload(initial, values);
            if (Object.keys(payload).length === 0) {
                addToast({ variant: 'info', message: 'Nothing changed, so there is nothing to save.' });
                return;
            }
            update.mutate({ id: competition._id, payload }, {
                onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: 'Competition saved.' }); router.push('/admin/ctf'); },
                onError,
                onSettled: () => update.reset(),
            });
        } else {
            create.mutate(buildCreatePayload(values), {
                onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: values.status === 'published' ? 'Competition created and published.' : 'Competition saved as a draft.' }); router.push('/admin/ctf'); },
                onError,
                onSettled: () => create.reset(),
            });
        }
    };

    const doDelete = () => {
        if (!competition) return;
        setConfirm(null);
        remove.mutate({ id: competition._id }, {
            onSuccess: (r) => {
                setSaved(true);
                addToast(r.deleted
                    ? { variant: 'success', message: 'Competition deleted.' }
                    : { variant: 'info', message: 'Players already have solves, so it was cancelled instead. The results stay.' });
                router.push('/admin/ctf');
            },
            onError: (err) => addToast({ variant: 'error', message: ctfErrorMessage(err) }),
        });
    };

    const doCancel = () => {
        if (!competition) return;
        setConfirm(null);
        cancel.mutate({ id: competition._id }, {
            onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: 'Competition cancelled. Nothing can change in it any more.' }); router.push('/admin/ctf'); },
            onError: (err) => addToast({ variant: 'error', message: ctfErrorMessage(err) }),
        });
    };

    const onFile = async (file: File | undefined) => {
        if (!file) return;
        if (!IMAGE_TYPES.includes(file.type)) { setErrors((o) => ({ ...o, image: 'Choose a JPEG, PNG, WebP or GIF image.' })); return; }
        if (file.size > FORM_LIMITS.uploadMaxBytes) { setErrors((o) => ({ ...o, image: 'The image is larger than 5 MB. Choose a smaller one.' })); return; }
        setUploading(true);
        try {
            const url = await uploadFile(file, 'misc');
            set('image', url);
        } catch (err) {
            setErrors((o) => ({ ...o, image: err instanceof Error && err.message ? err.message : 'The upload failed. Try again.' }));
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const err = (key: string) => errors[key] || undefined;
    const cancellable = edit && values.status !== 'cancelled' && values.status !== 'ended';
    const preview = safeHref(values.image.trim());
    const slugHint = edit
        ? 'The address of the competition. Changing it breaks the links people already have.'
        : `Optional. Lower case words with hyphens. Left empty it is made from the title${values.title.trim() ? ` (${slugFromTitle(values.title) || 'competition'})` : ''}.`;

    return (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6" data-testid="ctf-form" data-attempt={attempt}>
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

            <Section id="basics" title="The competition">
                <div className="space-y-4">
                    <Field id="title" label="Title" required error={err('title')}>
                        {(p) => <input {...p} type="text" value={values.title} maxLength={FORM_LIMITS.titleMax + 20} onChange={(e) => set('title', e.target.value)} className={`${input} ${err('title') ? inputError : ''}`} />}
                    </Field>
                    <Field id="slug" label="Slug" error={err('slug')} hint={slugHint}>
                        {(p) => <input {...p} type="text" value={values.slug} maxLength={FORM_LIMITS.slugMax + 20} autoCapitalize="off" spellCheck={false} onChange={(e) => set('slug', e.target.value)} className={`${input} font-mono ${err('slug') ? inputError : ''}`} />}
                    </Field>
                    <Field id="shortDescription" label="Summary" error={err('shortDescription')} hint={`${values.shortDescription.trim().length}/${FORM_LIMITS.shortDescriptionMax} characters. One or two lines for the list. Plain text.`}>
                        {(p) => <input {...p} type="text" value={values.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} className={`${input} ${err('shortDescription') ? inputError : ''}`} />}
                    </Field>
                    <Field id="description" label="Description" required error={err('description')} hint={`${values.description.trim().length}/${FORM_LIMITS.descriptionMax} characters. Plain text, shown on the competition page.`}>
                        {(p) => <textarea {...p} rows={5} value={values.description} onChange={(e) => set('description', e.target.value)} className={`${input} ${err('description') ? inputError : ''}`} />}
                    </Field>
                    <Field id="image" label="Banner image" error={err('image')} hint={`A public http or https link, or upload one (JPEG, PNG, WebP or GIF, up to 5 MB). At most ${FORM_LIMITS.url} characters.`}>
                        {(p) => (
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input {...p} type="url" inputMode="url" value={values.image} onChange={(e) => set('image', e.target.value)} className={`${input} ${err('image') ? inputError : ''}`} placeholder="https://" />
                                <input ref={fileRef} id="image-file" type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Upload a banner image" />
                                <button type="button" className={`${btnSecondary} shrink-0`} disabled={uploading} onClick={() => fileRef.current?.click()}>
                                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />} Upload
                                </button>
                            </div>
                        )}
                    </Field>
                    {preview && (
                        <div className="relative aspect-[16/6] w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-neutral-800 dark:bg-neutral-800" data-testid="image-preview">
                            <Image src={preview} alt="" fill sizes="28rem" className="object-cover" unoptimized />
                        </div>
                    )}
                </div>
            </Section>

            <Section id="rules-section" title="Rules" description="Markdown. Players see it sanitised.">
                <MarkdownEditor id="rules" label="Rules" value={values.rules} onChange={(v) => set('rules', v)} error={err('rules')} max={FORM_LIMITS.rulesMax} rows={12} />
            </Section>

            <WhenSection values={values} set={set} err={err} locked={fixed} onZone={(zone) => setValues((old) => shiftZone(old, zone))} />
            <PlayersSection values={values} set={set} err={err} locked={fixed} />
            <ScoringSection values={values} set={set} err={err} locked={fixed} />

            <Section id="prizes-section" title="Prizes" description={`Up to ${FORM_LIMITS.prizesMax}. Shown on the competition page and the results, in order of place.`}>
                <PrizesEditor rows={values.prizes} onChange={setPrizes} errors={errors} error={err('prizes')} />
                <div className="mt-5">
                    <Field id="prizesNote" label="Note about prizes" error={err('prizesNote')} hint={`${values.prizesNote.trim().length}/${FORM_LIMITS.prizesNoteMax} characters. Optional free text, for example how prizes are handed out. Shown when there is no prize list.`}>
                        {(p) => <textarea {...p} rows={3} value={values.prizesNote} onChange={(e) => set('prizesNote', e.target.value)} className={`${input} ${err('prizesNote') ? inputError : ''}`} />}
                    </Field>
                </div>
            </Section>

            <Section id="challenges-section" title="Challenges" description="The existing challenges players solve. They stay hidden from everybody but staff until the competition starts.">
                <ChallengeSetEditor competition={competition} value={values.challenges} onChange={(ids) => set('challenges', ids)} error={err('challenges')} />
            </Section>

            <PublishingSection values={values} set={set} err={err} locked={fixed} editing={edit} />

            <div className="flex flex-wrap items-center justify-end gap-3">
                {edit ? (
                    <div className="flex flex-wrap gap-3 sm:mr-auto">
                        <button type="button" className={btnDanger} onClick={() => setConfirm('delete')} disabled={remove.isPending || cancel.isPending || pending}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                        </button>
                        {cancellable && (
                            <button type="button" className={btnSecondary} onClick={() => setConfirm('cancel')} disabled={remove.isPending || cancel.isPending || pending}>
                                <Ban className="h-4 w-4" aria-hidden="true" /> Cancel competition
                            </button>
                        )}
                    </div>
                ) : <p className={`mr-auto text-xs ${muted}`}>You can edit everything later, except teams and scoring once there are teams or solves.</p>}
                <Link href="/admin/ctf" className={btnSecondary}>Back to the list</Link>
                <button type="submit" className={btnPrimary} disabled={pending || saved || uploading}>
                    {pending || saved ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                    {edit ? 'Save changes' : values.status === 'published' ? 'Create and publish' : 'Save draft'}
                </button>
            </div>

            <ConfirmDialog
                open={confirm === 'delete'}
                variant="danger"
                title={competition ? `Delete ${competition.title}?` : 'Delete this competition?'}
                description={solves > 0
                    ? 'Players have already solved challenges in it, so it cannot be deleted: it is cancelled instead. Nobody can play or change anything in it any more, and the results and points stay.'
                    : 'The competition, its teams, registrations and attempts are removed for good. This cannot be undone.'}
                confirmText={solves > 0 ? 'Cancel it instead' : 'Delete competition'}
                onCancel={() => setConfirm(null)}
                onConfirm={doDelete}
            />
            <ConfirmDialog
                open={confirm === 'cancel'}
                variant="warning"
                title={competition ? `Cancel ${competition.title}?` : 'Cancel this competition?'}
                description="Nobody can send flags or change a team any more. Results and points already earned stay. It stays in the list as cancelled."
                confirmText="Cancel competition"
                cancelText="Keep it"
                onCancel={() => setConfirm(null)}
                onConfirm={doCancel}
            />
            {leaveDialog}
        </form>
    );
}
