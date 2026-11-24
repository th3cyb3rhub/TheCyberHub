'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle2, Eye, EyeOff, Loader2, MessageSquareWarning, Plus, Save, Send, Star, Trash2 } from 'lucide-react';
import { FullPageSpinner, NoAccess, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { useToast } from '@/context/ToastContext';
import {
    useCreatePath, useDeletePath, useEditorPath, useFeaturePath, useLearningPaths, usePathTransition, useRequestPathChanges, useUpdatePath,
} from '@/hooks/queries/useLearningPaths';
import { getEditorPath } from '@/lib/api/learning';
import { emptyPathValues, keyFromTitle, moveNode, newNode, pathInput, removeNode, renameKey, valuesEqual, valuesFromPath, type EditorNodeValues } from '@/lib/learning/editor';
import { CATEGORY_LABELS, DIFFICULTY_LABELS, KIND_LABELS, STATUS_LABELS } from '@/lib/learning/display';
import { fieldErrors, isConflict, learningErrorMessage } from '@/lib/learning/errors';
import { LIMITS, pathEditorSchema, requestChangesSchema, zodFieldErrors, type PathEditorValues } from '@/lib/learning/schemas';
import { isModeratorRole } from '@/lib/roles';
import { isAdminRole } from '@/lib/events/roles';
import { ApiError } from '@/lib/api';
import { DIFFICULTIES, PATH_CATEGORIES, PATH_KINDS, type EditorPath, type PathStatus } from '@/types/learning';
import { Chip, ErrorState, Field, fieldClass, Modal, type Tone } from '../shared';
import { btnPrimary, btnSecondary, cardPad, input, label as labelClass, muted } from '@/components/events/styles';
import { NodeEditor } from './NodeEditor';

const STATUS_TONE: Record<PathStatus, Tone> = { draft: 'gray', in_review: 'amber', published: 'green', archived: 'red' };

/** Published roadmaps this one can recommend finishing first */
function PrerequisitePicker({ id, selected, onChange, selfId, known }: { id: string; selected: string[]; onChange: (ids: string[]) => void; selfId?: string; known: Record<string, string> }) {
    const list = useLearningPaths({ limit: 50 });
    const options = (list.data?.data ?? []).filter((p) => p.id !== selfId);
    const listed = new Set(options.map((o) => o.id));
    const extra = selected.filter((s) => !listed.has(s));
    return (
        <fieldset>
            <legend className={labelClass}>Prerequisites <span className={`font-normal ${muted}`}>(choose up to {LIMITS.path.prerequisites})</span></legend>
            {list.isLoading && <p className={`text-sm ${muted}`} role="status">Loading</p>}
            {list.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">Could not load the list: {learningErrorMessage(list.error)}</p>}
            <div id={id} className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-gray-200 p-3 dark:border-neutral-800">
                {options.length === 0 && extra.length === 0 && !list.isLoading && <p className={`text-sm ${muted}`}>No other published roadmaps or paths yet.</p>}
                {[...options.map((o) => ({ id: o.id, title: o.title })), ...extra.map((e) => ({ id: e, title: known[e] ?? e }))].map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                            type="checkbox"
                            checked={selected.includes(o.id)}
                            disabled={!selected.includes(o.id) && selected.length >= LIMITS.path.prerequisites}
                            onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((s) => s !== o.id))}
                            className="h-4 w-4 accent-orange-600"
                        />
                        {o.title}
                    </label>
                ))}
            </div>
        </fieldset>
    );
}

type Confirm = 'delete' | 'archive' | 'unpublish' | 'changes' | null;

/** What the API said was wrong with the nodes, shown above the form */
function problemList(err: unknown): string[] {
    if (err instanceof ApiError && err.details?.length && ['PATH_NOT_PUBLISHABLE', 'PATH_ITEM_INVALID', 'VALIDATION_ERROR'].includes(err.code ?? '')) return err.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message));
    return [];
}

export function PathEditor({ pathRef }: { pathRef?: string }) {
    const router = useRouter();
    const { user, ready } = useRequireLogin(pathRef ? `/admin/learning-paths/${pathRef}` : '/admin/learning-paths/new');
    const { addToast } = useToast();
    const uid = useId();
    const allowed = isModeratorRole(user?.role);
    const admin = isAdminRole(user?.role);
    const editing = !!pathRef;
    const loaded = useEditorPath(pathRef ?? '', { enabled: ready && allowed && editing });

    const create = useCreatePath();
    const update = useUpdatePath();
    const transition = usePathTransition();
    const requestChanges = useRequestPathChanges();
    const feature = useFeaturePath();
    const remove = useDeletePath();

    const [values, setValues] = useState<PathEditorValues>(emptyPathValues());
    const [baseline, setBaseline] = useState<PathEditorValues>(emptyPathValues());
    const [meta, setMeta] = useState<EditorPath | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [problems, setProblems] = useState<string[]>([]);
    const [banner, setBanner] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);
    const [confirm, setConfirm] = useState<Confirm>(null);
    const [note, setNote] = useState('');
    const [noteError, setNoteError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
    const [skillsText, setSkillsText] = useState('');
    const hydrated = useRef<string | null>(null);

    // Take the loaded path as the form's starting point (once per version)
    const serverVersion = loaded.data ? `${loaded.data.id}:${loaded.data.updatedAt}` : null;
    useEffect(() => {
        if (!loaded.data || hydrated.current === serverVersion) return;
        hydrated.current = serverVersion;
        const v = valuesFromPath(loaded.data);
        setValues(v);
        setBaseline(v);
        setMeta(loaded.data);
        setSkillsText(v.skills.join(', '));
        setExpanded(new Set(v.modules.length <= 5 ? v.modules.map((_, i) => i) : []));
    }, [loaded.data, serverVersion]);

    const dirty = !valuesEqual(values, baseline);

    // Leaving with unsaved changes asks first
    useEffect(() => {
        if (!dirty) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

    const knownPrereqs = useMemo(() => Object.fromEntries((meta?.prerequisites ?? []).map((p) => [p.id, p.title ?? p.id])), [meta]);
    const stages = useMemo(() => Array.from(new Set(values.modules.map((m) => m.stage).filter(Boolean))), [values.modules]);

    const set = <K extends keyof PathEditorValues>(key: K, value: PathEditorValues[K]) => {
        setValues((v) => ({ ...v, [key]: value }));
        if (errors[key]) setErrors((e) => { const next = { ...e }; delete next[key]; return next; });
    };

    const setNode = (index: number, node: EditorNodeValues) => setValues((v) => {
        const old = v.modules[index];
        const modules = node.key !== old.key ? renameKey(v.modules, index, node.key) : [...v.modules];
        modules[index] = { ...node, requires: modules[index].requires.length === node.requires.length || node.key === old.key ? node.requires : modules[index].requires };
        return { ...v, modules };
    });

    const applySaved = (saved: EditorPath) => {
        const v = valuesFromPath(saved);
        hydrated.current = `${saved.id}:${saved.updatedAt}`;
        setValues(v);
        setBaseline(v);
        setMeta(saved);
        setSkillsText(v.skills.join(', '));
        setErrors({});
        setProblems([]);
        setBanner(null);
    };

    const failed = (err: unknown) => {
        setProblems(problemList(err));
        setErrors((e) => ({ ...e, ...fieldErrors(err) }));
        if (isConflict(err)) setConflict(true);
        else setBanner(learningErrorMessage(err));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const validate = (): PathEditorValues | null => {
        const parsed = pathEditorSchema.safeParse({ ...values, skills: skillsText.split(',').map((s) => s.trim()).filter(Boolean) });
        if (!parsed.success) {
            const found = zodFieldErrors(parsed.error);
            setErrors(found);
            setBanner('Fix the highlighted fields and save again.');
            const bad = new Set<number>();
            Object.keys(found).forEach((k) => { const m = /^modules\.(\d+)\./.exec(k); if (m) bad.add(Number(m[1])); });
            if (bad.size) setExpanded((prev) => new Set(Array.from(prev).concat(Array.from(bad))));
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return null;
        }
        return parsed.data;
    };

    const save = (overrideUpdatedAt?: string) => {
        setBanner(null);
        setProblems([]);
        const data = validate();
        if (!data) return;
        setErrors({});
        if (!editing) {
            create.mutate(pathInput(data), {
                onSuccess: (saved) => { applySaved(saved); addToast({ variant: 'success', message: 'Saved as a draft.' }); router.replace(`/admin/learning-paths/${saved.id}`); },
                onError: failed,
            });
            return;
        }
        if (!meta) return;
        update.mutate({ ref: meta.id, input: pathInput(data, { updatedAt: overrideUpdatedAt ?? meta.updatedAt }) }, {
            onSuccess: (saved) => { applySaved(saved); setConflict(false); addToast({ variant: 'success', message: 'Saved.' }); },
            onError: failed,
        });
    };

    const reloadLatest = async () => {
        try {
            const latest = await getEditorPath(meta?.id ?? pathRef ?? '');
            applySaved(latest);
            setConflict(false);
            addToast({ variant: 'info', message: 'Loaded the latest version. Your unsaved changes were dropped.' });
        } catch (err) {
            setBanner(learningErrorMessage(err));
        }
    };

    /** Keep my edits: take the newest version's timestamp and save my form on top of it */
    const overwrite = async () => {
        try {
            const latest = await getEditorPath(meta?.id ?? pathRef ?? '');
            setMeta(latest);
            setConflict(false);
            save(latest.updatedAt);
        } catch (err) {
            setBanner(learningErrorMessage(err));
        }
    };

    const run = (action: 'submit' | 'publish' | 'unpublish' | 'archive' | 'restore', message: string) => {
        if (!meta) return;
        setBanner(null);
        setProblems([]);
        transition.mutate({ ref: meta.id, action }, {
            onSuccess: (saved) => { applySaved(saved); setConfirm(null); addToast({ variant: 'success', message }); },
            onError: (err) => { setConfirm(null); failed(err); },
        });
    };

    if (!ready) return <FullPageSpinner />;
    if (!allowed) return <NoAccess message="Only moderators and administrators can edit roadmaps." href="/roadmaps" label="Back to roadmaps" />;
    if (editing && loaded.isLoading) return <FullPageSpinner label="Loading the editor" />;
    if (editing && loaded.isError) {
        return <PageShell title="Edit roadmap" backHref="/admin/learning-paths" backLabel="All roadmaps"><ErrorState error={loaded.error} onRetry={() => void loaded.refetch()} title="Could not load this roadmap" /></PageShell>;
    }

    const status: PathStatus | null = meta?.status ?? null;
    const busy = create.isPending || update.isPending || transition.isPending;
    const published = status === 'published';
    const saveLabel = !editing ? 'Save draft' : 'Save changes';
    const nodeCount = values.modules.length;

    return (
        <PageShell
            title={editing ? 'Edit roadmap' : 'New roadmap'}
            subtitle={meta?.title}
            backHref="/admin/learning-paths"
            backLabel="All roadmaps and paths"
            wide
            actions={status && <div className="flex flex-wrap items-center gap-2"><Chip tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Chip>{dirty && <Chip tone="amber">Unsaved changes</Chip>}</div>}
        >
            {(banner || problems.length > 0) && (
                <div role="alert" className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="editor-error">
                    {banner && <p>{banner}</p>}
                    {problems.length > 0 && <ul className="mt-1 list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                </div>
            )}
            {meta?.reviewNote && status === 'draft' && <p role="note" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">Changes requested: {meta.reviewNote}</p>}
            {published && <p role="note" className="mb-6 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">This roadmap is live. Saving changes it for everyone at once, and members keep their progress on steps you keep.</p>}

            <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate className="space-y-8" aria-label="Roadmap editor">
                <section className={`${cardPad} space-y-5`} aria-labelledby={`${uid}-details`}>
                    <h2 id={`${uid}-details`} className="text-lg font-semibold text-gray-900 dark:text-white">Details</h2>
                    <Field id={`${uid}-title`} label="Title" error={errors.title}>
                        <input id={`${uid}-title`} value={values.title} onChange={(e) => set('title', e.target.value)} maxLength={LIMITS.path.title.max + 20} className={fieldClass(errors.title)} aria-invalid={!!errors.title} />
                    </Field>
                    <div className="grid gap-5 sm:grid-cols-3">
                        <Field id={`${uid}-kind`} label="Type" error={errors.kind} hint={editing ? 'Cannot change once members have joined.' : undefined}>
                            <select id={`${uid}-kind`} value={values.kind} onChange={(e) => set('kind', e.target.value as PathEditorValues['kind'])} className={fieldClass(errors.kind)}>
                                {PATH_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                            </select>
                        </Field>
                        <Field id={`${uid}-category`} label="Category" error={errors.category}>
                            <select id={`${uid}-category`} value={values.category} onChange={(e) => set('category', e.target.value as PathEditorValues['category'])} className={fieldClass(errors.category)}>
                                {PATH_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                            </select>
                        </Field>
                        <Field id={`${uid}-difficulty`} label="Difficulty" error={errors.difficulty}>
                            <select id={`${uid}-difficulty`} value={values.difficulty} onChange={(e) => set('difficulty', e.target.value as PathEditorValues['difficulty'])} className={fieldClass(errors.difficulty)}>
                                {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
                            </select>
                        </Field>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                        <Field id={`${uid}-duration`} label="Time needed" hint="For example 10 weeks" error={errors.estimatedDuration}>
                            <input id={`${uid}-duration`} value={values.estimatedDuration} onChange={(e) => set('estimatedDuration', e.target.value)} maxLength={LIMITS.path.duration + 10} className={fieldClass(errors.estimatedDuration)} />
                        </Field>
                        <Field id={`${uid}-skills`} label="Skills" hint="Separate with commas. Up to 20." error={errors.skills}>
                            <input id={`${uid}-skills`} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} className={fieldClass(errors.skills)} />
                        </Field>
                    </div>
                    <Field id={`${uid}-short`} label="Short description" hint="Shown on the cards. Up to 300 characters." error={errors.shortDescription}>
                        <textarea id={`${uid}-short`} rows={2} value={values.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} maxLength={LIMITS.path.shortDescription + 20} className={`${fieldClass(errors.shortDescription)} resize-y`} />
                    </Field>
                    <Field id={`${uid}-desc`} label="Description" error={errors.description}>
                        <textarea id={`${uid}-desc`} rows={5} value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={LIMITS.path.description.max + 50} className={`${fieldClass(errors.description)} resize-y`} aria-invalid={!!errors.description} />
                    </Field>
                    <Field id={`${uid}-meta`} label="Search description" hint="Shown by search engines. Up to 160 characters." error={errors.metaDescription}>
                        <input id={`${uid}-meta`} value={values.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} maxLength={LIMITS.path.metaDescription + 20} className={fieldClass(errors.metaDescription)} />
                    </Field>
                    <PrerequisitePicker id={`${uid}-prereq`} selected={values.prerequisites} onChange={(ids) => set('prerequisites', ids)} selfId={meta?.id} known={knownPrereqs} />
                </section>

                <section aria-labelledby={`${uid}-steps`}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 id={`${uid}-steps`} className="text-lg font-semibold text-gray-900 dark:text-white">Steps <span className={`text-sm font-normal ${muted}`}>({nodeCount}/{LIMITS.path.nodes})</span></h2>
                        <button
                            type="button"
                            className={btnSecondary}
                            disabled={nodeCount >= LIMITS.path.nodes}
                            onClick={() => { setValues((v) => ({ ...v, modules: [...v.modules, newNode(v.modules.map((m) => m.key), v.modules[v.modules.length - 1]?.stage ?? '')] })); setExpanded((p) => new Set(p).add(nodeCount)); }}
                        ><Plus className="h-4 w-4" aria-hidden="true" /> Add a step</button>
                    </div>
                    {errors.modules && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">{errors.modules}</p>}
                    {nodeCount === 0 ? (
                        <p className={`${cardPad} text-sm ${muted}`}>No steps yet. A roadmap needs at least 3 steps and a path at least 1 before it can be published.</p>
                    ) : (
                        <ol className="list-none space-y-4">
                            {values.modules.map((node, i) => (
                                <NodeEditor
                                    key={node.id ?? `new-${i}-${node.key}`}
                                    node={node}
                                    index={i}
                                    count={nodeCount}
                                    otherKeys={values.modules.filter((_, j) => j !== i).map((m) => ({ key: m.key, title: m.title }))}
                                    stages={stages}
                                    errors={errors}
                                    expanded={expanded.has(i)}
                                    onToggle={() => setExpanded((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                                    onChange={(n) => setNode(i, n)}
                                    onMove={(d) => { setValues((v) => ({ ...v, modules: moveNode(v.modules, i, d) })); setExpanded((p) => { const n = new Set(p); const had = n.has(i); const to = i + d; n.delete(i); if (had) n.add(to); return n; }); }}
                                    onRemove={() => {
                                        if (node.id && !window.confirm(`Remove step "${node.title || i + 1}"? Members lose their progress on it.`)) return;
                                        setValues((v) => ({ ...v, modules: removeNode(v.modules, i) }));
                                        setExpanded(new Set());
                                    }}
                                />
                            ))}
                        </ol>
                    )}
                </section>

                <div className="sticky bottom-16 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 md:bottom-0" data-testid="editor-actions">
                    <button type="submit" disabled={busy || (editing && !dirty)} className={btnPrimary}>
                        {create.isPending || update.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} {saveLabel}
                    </button>
                    {editing && meta && (
                        <>
                            {status === 'draft' && meta && <button type="button" className={btnSecondary} disabled={busy || dirty} onClick={() => run('submit', 'Sent for review.')}><Send className="h-4 w-4" aria-hidden="true" /> Submit for review</button>}
                            {admin && (status === 'draft' || status === 'in_review') && <button type="button" className={btnSecondary} disabled={busy || dirty} onClick={() => run('publish', 'Published.')}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Publish</button>}
                            {admin && status === 'in_review' && <button type="button" className={btnSecondary} disabled={busy || dirty} onClick={() => { setNote(''); setNoteError(null); setConfirm('changes'); }}><MessageSquareWarning className="h-4 w-4" aria-hidden="true" /> Request changes</button>}
                            {admin && published && <button type="button" className={btnSecondary} disabled={busy || dirty} onClick={() => setConfirm('unpublish')}><EyeOff className="h-4 w-4" aria-hidden="true" /> Unpublish</button>}
                            {admin && published && (
                                <button type="button" className={btnSecondary} aria-pressed={meta.isFeatured} disabled={busy || feature.isPending} onClick={() => feature.mutate({ ref: meta.id, featured: !meta.isFeatured }, { onSuccess: (saved) => setMeta((m) => (m ? { ...m, isFeatured: saved.isFeatured, updatedAt: saved.updatedAt } : m)), onError: failed })}>
                                    <Star className="h-4 w-4" aria-hidden="true" /> {meta.isFeatured ? 'Unfeature' : 'Feature'}
                                </button>
                            )}
                            {admin && status && status !== 'archived' && <button type="button" className={btnSecondary} disabled={busy || dirty} onClick={() => setConfirm('archive')}><Archive className="h-4 w-4" aria-hidden="true" /> Archive</button>}
                            {admin && status === 'archived' && <button type="button" className={btnSecondary} disabled={busy} onClick={() => run('restore', 'Restored as a draft.')}><ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Restore</button>}
                            {published && <Link href={`/${meta.kind === 'roadmap' ? 'roadmaps' : 'learning-paths'}/${meta.slug}`} className={btnSecondary}><Eye className="h-4 w-4" aria-hidden="true" /> View page</Link>}
                            {admin && <button type="button" className={`${btnSecondary} ml-auto text-red-800 dark:text-red-300`} disabled={busy} onClick={() => setConfirm('delete')}><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete</button>}
                        </>
                    )}
                    {dirty && editing && <span className={`text-xs ${muted}`}>Save your changes before changing the status.</span>}
                </div>
            </form>

            <Modal
                open={conflict}
                onOpenChange={setConflict}
                title="Someone else edited this roadmap"
                description="A newer version was saved after you opened it. Load it to see what changed, or keep editing and save over it later."
                confirmLabel="Load the latest version"
                onConfirm={() => void reloadLatest()}
                asForm={false}
            >
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Loading the latest version drops your unsaved changes.</div>
                <button type="button" className={`${btnSecondary} mt-4 w-full`} onClick={() => void overwrite()}>Save my version over theirs</button>
            </Modal>

            <Modal open={confirm === 'delete'} onOpenChange={(o) => !o && setConfirm(null)} title="Delete this roadmap?" description="A roadmap nobody joined is deleted. If members joined it is archived instead, so they keep their progress and certificates." confirmLabel="Delete" destructive pending={remove.isPending} error={remove.error ? learningErrorMessage(remove.error) : null}
                onConfirm={() => meta && remove.mutate({ ref: meta.id }, { onSuccess: (r) => { addToast({ variant: 'success', message: r.deleted ? 'Deleted.' : 'Archived, because members had joined.' }); router.replace('/admin/learning-paths'); } })} />
            <Modal open={confirm === 'archive'} onOpenChange={(o) => !o && setConfirm(null)} title="Archive this roadmap?" description="It leaves the catalogue. Members who joined keep their progress and certificates." confirmLabel="Archive" destructive pending={transition.isPending} onConfirm={() => run('archive', 'Archived.')} />
            <Modal open={confirm === 'unpublish'} onOpenChange={(o) => !o && setConfirm(null)} title="Unpublish this roadmap?" description="It goes back to a draft and disappears from the catalogue until you publish it again." confirmLabel="Unpublish" destructive pending={transition.isPending} onConfirm={() => run('unpublish', 'Unpublished. It is a draft again.')} />
            <Modal
                open={confirm === 'changes'}
                onOpenChange={(o) => !o && setConfirm(null)}
                title="Request changes"
                description="The note goes to the author and the roadmap returns to a draft."
                confirmLabel="Send"
                pending={requestChanges.isPending}
                error={noteError ?? (requestChanges.error ? learningErrorMessage(requestChanges.error) : null)}
                onConfirm={() => {
                    const parsed = requestChangesSchema.safeParse({ note });
                    if (!parsed.success) { setNoteError(parsed.error.issues[0]?.message ?? 'Write a note'); return; }
                    setNoteError(null);
                    if (meta) requestChanges.mutate({ ref: meta.id, note: parsed.data.note }, { onSuccess: (saved) => { applySaved(saved); setConfirm(null); addToast({ variant: 'success', message: 'Sent back to the author.' }); } });
                }}
            >
                <label htmlFor={`${uid}-note`} className={labelClass}>Note</label>
                <textarea id={`${uid}-note`} rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.requestChangesNote.max} className={`${input} resize-none`} />
            </Modal>
        </PageShell>
    );
}
