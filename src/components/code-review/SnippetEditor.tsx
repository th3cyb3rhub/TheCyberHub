'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Info, Loader2, Save, Trash2 } from 'lucide-react';
import { btnDanger, btnPrimary, btnSecondary, card, input, inputError, muted } from '@/components/events/styles';
import { Section } from '@/components/internships/CohortEditors';
import { Field } from '@/components/internships/FormField';
import { useUnsavedGuard } from '@/components/internships/UnsavedGuard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { useCreateSnippet, useDeleteSnippet, useSetPublished, useUpdateSnippet } from '@/hooks/queries/useCodeReview';
import { CR_LIMITS, DIFFICULTY_LABELS, categoryLabel, languageLabel } from '@/lib/codeReview/constants';
import { crErrorCode, crErrorMessage, fieldErrors, keyChangeInfo, unattachedDetails, type KeyChange } from '@/lib/codeReview/errors';
import {
    buildPayload, byteLength, countLines, emptySnippet, findingBands, fromSnippet, isLiveError, normaliseCode, overlapBands, sanitisedFieldsStripped, validateSnippet,
    type CrFormValues,
} from '@/lib/codeReview/form';
import { clampLine, moveSelection, selectLine, splitCode, type Selection } from '@/lib/codeReview/selection';
import { CR_CATEGORIES, CR_DIFFICULTIES, CR_LANGUAGES, type CrAdminSnippet, type CrSnippetPayload } from '@/types/codeReview';
import { CodeLines, type Band } from './CodeLines';
import { FindingsEditor } from './FindingsEditor';
import { HintsEditor } from './HintsEditor';

// A disabled field is dimmed by the shared input style; a moderator reading the answer key needs it at full contrast
const READ_ONLY_FIELDS = '[&_input:disabled]:opacity-100 [&_input:disabled]:text-gray-900 dark:[&_input:disabled]:text-white [&_textarea:disabled]:opacity-100 [&_textarea:disabled]:text-gray-900 dark:[&_textarea:disabled]:text-white [&_select:disabled]:opacity-100 [&_select:disabled]:text-gray-900 dark:[&_select:disabled]:text-white';

/** What a held-back save would change, in the numbers the API gave */
function keyChangeText(k: KeyChange): string {
    const members = k.solveCount === 1 ? '1 member has' : `${k.solveCount} members have`;
    return `${members} solved this exercise. This change touches its code, findings or hints: findings go from ${k.oldFindingCount} to ${k.newFindingCount}, hints from ${k.oldHintCount} to ${k.newHintCount}. Attempts already graded keep their score; every later attempt is graded against the new answer key.`;
}

const mono = `${input} font-mono text-[13px] leading-6`;

/**
 * The exercise editor: the text fields with the API's limits, the code with a line-numbered
 * preview, the findings (ranges picked on the preview and checked as they change), the hints and
 * the solution material. Admins and owners save; for a moderator it is a read-only view of the same
 * data. The API refuses whatever a role may not do whatever this page shows.
 */
export function SnippetEditor({ snippet, readOnly = false }: { snippet?: CrAdminSnippet; readOnly?: boolean }) {
    const edit = !!snippet;
    const mode = edit ? 'edit' : 'create';
    const router = useRouter();
    const { addToast } = useToast();
    const create = useCreateSnippet();
    const update = useUpdateSnippet();
    const remove = useDeleteSnippet();
    const unpublish = useSetPublished();
    const pending = create.isPending || update.isPending;

    const [initial] = useState<CrFormValues>(() => (snippet ? fromSnippet(snippet) : emptySnippet()));
    const [values, setValues] = useState<CrFormValues>(initial);
    const [server, setServer] = useState<Record<string, string>>({});
    const [submitted, setSubmitted] = useState(false);
    const [banner, setBanner] = useState<{ message: string; lines: string[]; unpublish?: boolean } | null>(null);
    /** A save the API held back because members solved the exercise: the numbers it gave, and what was sent */
    const [keyChange, setKeyChange] = useState<{ info: KeyChange; payload: CrSnippetPayload } | null>(null);
    const [saved, setSaved] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    // The finding being picked is followed by its own key, so adding, removing or moving rows never changes which one it is
    const [pickingKey, setPickingKey] = useState<string | null>(null);
    const [anchor, setAnchor] = useState<number | null>(null);
    const [cursor, setCursor] = useState<Selection | null>(null);
    const [previewFocused, setPreviewFocused] = useState(false);
    const [pickNote, setPickNote] = useState('');
    const bannerRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const dirty = !readOnly && !saved && JSON.stringify(buildPayload(initial, mode)) !== JSON.stringify(buildPayload(values, mode));
    const leaveDialog = useUnsavedGuard(dirty);

    const set = <K extends keyof CrFormValues>(key: K, value: CrFormValues[K]) => {
        setValues((old) => ({ ...old, [key]: value }));
        setServer((old) => (old[key as string] ? { ...old, [key as string]: '' } : old));
    };
    const setList = <K extends 'findings' | 'hints'>(key: K, rows: CrFormValues[K]) => {
        setValues((old) => ({ ...old, [key]: rows }));
        // The rows moved: what the server said about their positions no longer holds
        setServer((old) => Object.fromEntries(Object.entries(old).filter(([k]) => k !== key && !k.startsWith(`${key}.`))));
    };

    const picking = useMemo(() => {
        const at = pickingKey === null ? -1 : values.findings.findIndex((f) => f.key === pickingKey);
        return at >= 0 ? at : null;
    }, [pickingKey, values.findings]);

    const lineCount = useMemo(() => countLines(values.vulnerableCode), [values.vulnerableCode]);
    const lines = useMemo(() => (lineCount ? splitCode(normaliseCode(values.vulnerableCode)) : []), [values.vulnerableCode, lineCount]);
    const bytes = useMemo(() => byteLength(normaliseCode(values.vulnerableCode)), [values.vulnerableCode]);
    const local = useMemo(() => validateSnippet(values, { mode }), [values, mode]);
    const errors = useMemo(() => {
        const shown: Record<string, string> = {};
        for (const [k, v] of Object.entries(local)) if (submitted || isLiveError(k)) shown[k] = v;
        for (const [k, v] of Object.entries(server)) if (v) shown[k] = v;
        return shown;
    }, [local, server, submitted]);

    const bands = useMemo<Band[]>(() => {
        const found = findingBands(values.findings, lineCount);
        return [
            ...found.map((b) => ({ start: b.start, end: b.end, tone: 'finding' as const })),
            ...overlapBands(found).map((b) => ({ ...b, tone: 'conflict' as const })),
        ];
    }, [values.findings, lineCount]);

    // Code and answer text are stored as written; only these fields still lose script-like text
    const stripped = sanitisedFieldsStripped(values);

    // ---- Picking lines on the preview ----
    const pick = (line: number) => {
        if (pickingKey === null || picking === null) return;
        const n = clampLine(line, lineCount);
        if (anchor === null) {
            setValues((old) => ({ ...old, findings: old.findings.map((f) => (f.key === pickingKey ? { ...f, lineStart: String(n), lineEnd: String(n) } : f)) }));
            setAnchor(n);
            setPickNote(`First line ${n}. Now pick the last line, or pick ${n} again for a single line.`);
        } else {
            const start = Math.min(anchor, n);
            const end = Math.max(anchor, n);
            setValues((old) => ({ ...old, findings: old.findings.map((f) => (f.key === pickingKey ? { ...f, lineStart: String(start), lineEnd: String(end) } : f)) }));
            setPickNote(`Finding ${picking + 1} now covers ${start === end ? `line ${start}` : `lines ${start} to ${end}`}.`);
            setAnchor(null);
            setPickingKey(null);
        }
        setServer((old) => Object.fromEntries(Object.entries(old).filter(([k]) => !k.startsWith('findings.'))));
    };
    const startPicking = (key: string | null) => {
        setPickingKey(key);
        setAnchor(null);
        const index = key === null ? -1 : values.findings.findIndex((f) => f.key === key);
        setPickNote(index < 0 ? 'Stopped picking.' : `Picking lines for finding ${index + 1}. Click the first line on the preview, then the last line.`);
    };
    const onPreviewKey = (e: React.KeyboardEvent<HTMLOListElement>) => {
        if (picking === null || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pick((cursor ?? selectLine(1, lineCount)).focus); return; }
        if (e.key === 'Escape') { e.preventDefault(); startPicking(null); return; }
        const next = moveSelection(cursor, e.key, false, lineCount);
        if (next) { e.preventDefault(); setCursor(next); }
    };

    // ---- Saving ----
    const focusProblem = () => window.setTimeout(() => (formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? bannerRef.current)?.focus(), 0);
    const fail = (found: Record<string, string>, message: string) => {
        setServer(found);
        setBanner({ message, lines: Object.entries(found).filter(([k, v]) => v && k.startsWith('form.')).map(([, v]) => v) });
        focusProblem();
    };

    const onError = (err: unknown, sent?: CrSnippetPayload) => {
        const change = keyChangeInfo(err);
        if (change && sent) { setKeyChange({ info: change, payload: sent }); return; }
        const fields = fieldErrors(err);
        const code = crErrorCode(err);
        if (code === 'CR_SLUG_TAKEN') fields.slug = crErrorMessage(err);
        if (code === 'CR_NOT_READY') { fields.findings = crErrorMessage(err); }
        unattachedDetails(err).forEach((m, i) => { fields[`form.${i}`] = m; });
        const marked = Object.keys(fields).filter((k) => !k.startsWith('form.')).length;
        fail(fields, marked > 0 && code === 'VALIDATION_ERROR'
            ? 'The server did not accept some fields. The ones with a field are marked below.'
            : crErrorMessage(err));
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly) return;
        setBanner(null);
        setSubmitted(true);
        const found = validateSnippet(values, { mode });
        const count = Object.keys(found).length;
        if (count > 0) {
            setServer({});
            setBanner({ message: `Please fix ${count === 1 ? 'one thing' : `${count} things`} before you save.`, lines: [] });
            focusProblem();
            return;
        }
        setServer({});
        const payload = buildPayload(values, mode);
        const done = (message: string) => { setSaved(true); addToast({ variant: 'success', message }); router.push('/admin/code-review'); };
        if (snippet) update.mutate({ ref: snippet.slug, payload }, { onSuccess: () => done('Exercise saved.'), onError: (err) => onError(err, payload) });
        else create.mutate(payload, { onSuccess: () => done(values.isPublished ? 'Exercise created and published.' : 'Exercise saved as a draft.'), onError });
    };

    /** The author read the numbers and confirmed: the same save again, now with the confirmation the API asks for */
    const confirmKeyChange = () => {
        if (!snippet || !keyChange) return;
        const payload = { ...keyChange.payload, confirmKeyChange: true };
        setKeyChange(null);
        update.mutate({ ref: snippet.slug, payload }, {
            onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: 'Exercise saved.' }); router.push('/admin/code-review'); },
            onError: (err) => onError(err),
        });
    };

    const doUnpublish = () => {
        if (!snippet) return;
        setBanner(null);
        unpublish.mutate({ ref: snippet.slug, published: false }, {
            onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: 'Exercise unpublished.' }); router.push('/admin/code-review'); },
            onError: (err) => setBanner({ message: crErrorMessage(err), lines: [] }),
        });
    };

    const doDelete = () => {
        if (!snippet) return;
        setConfirmDelete(false);
        setBanner(null);
        remove.mutate({ ref: snippet.slug }, {
            onSuccess: () => { setSaved(true); addToast({ variant: 'success', message: 'Exercise deleted.' }); router.push('/admin/code-review'); },
            // Members passed it: the answer is to unpublish it, so that is one press away
            onError: (err) => setBanner({ message: crErrorMessage(err), lines: [], unpublish: crErrorCode(err) === 'CR_HAS_PROGRESS' && values.isPublished }),
        });
    };

    const e = errors;
    const previewActive = picking !== null;

    return (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-6" data-testid="snippet-editor">
            {leaveDialog}
            {readOnly && (
                <p role="note" className="flex items-start gap-2 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100" data-testid="read-only-note">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Read-only: moderators can read an exercise and its answer key, but only administrators and owners can change it.</span>
                </p>
            )}
            {banner && (
                <div ref={bannerRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="form-banner">
                    <p className="flex items-start gap-2 font-medium"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {banner.message}</p>
                    {banner.lines.length > 0 && <ul className="mt-2 list-disc pl-9">{banner.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
                    {banner.unpublish && (
                        <div className="mt-3 pl-6">
                            <button type="button" className={btnSecondary} onClick={doUnpublish} disabled={unpublish.isPending} data-testid="unpublish-now">
                                {unpublish.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Unpublish now
                            </button>
                        </div>
                    )}
                </div>
            )}

            <fieldset disabled={readOnly} className={`min-w-0 space-y-6 border-0 p-0 ${readOnly ? READ_ONLY_FIELDS : ''}`}>
                <legend className="sr-only">Exercise</legend>

                <Section id="cr-basics" title="Basics" description="What members see in the list and at the top of the exercise.">
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                        <Field id="cr-title" label="Title" required error={e.title} hint={`${values.title.trim().length}/${CR_LIMITS.title}. Avoid naming the vulnerability class: it gives the answer away.`} className="sm:col-span-2">
                            {(p) => <input {...p} maxLength={CR_LIMITS.title + 50} value={values.title} onChange={(ev) => set('title', ev.target.value)} className={`${input} ${e.title ? inputError : ''}`} />}
                        </Field>
                        {edit ? (
                            <div className="sm:col-span-2" data-testid="slug-readonly">
                                <p className="mb-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">Slug</p>
                                <code className="break-all rounded bg-gray-100 px-2 py-1 text-sm text-gray-900 dark:bg-neutral-800 dark:text-gray-100">{values.slug}</code>
                                <p className={`mt-1 text-xs ${muted}`}>The slug is part of every link to this exercise, so it is set when the exercise is created and not changed here.</p>
                            </div>
                        ) : (
                            <Field id="cr-slug" label="Slug" error={e.slug} hint={`Optional: made from the title when left empty. ${CR_LIMITS.slugMin} to ${CR_LIMITS.slug} characters, lowercase words joined by single hyphens.`} className="sm:col-span-2">
                                {(p) => <input {...p} autoComplete="off" value={values.slug} onChange={(ev) => set('slug', ev.target.value)} className={`${input} ${e.slug ? inputError : ''}`} />}
                            </Field>
                        )}
                        <Field id="cr-description" label="Description" required error={e.description} hint={`${values.description.trim().length}/${CR_LIMITS.description}. Plain text; the first part is the card summary.`} className="sm:col-span-2">
                            {(p) => <textarea {...p} rows={4} value={values.description} onChange={(ev) => set('description', ev.target.value)} className={`${input} ${e.description ? inputError : ''}`} />}
                        </Field>
                        <Field id="cr-language" label="Language" required error={e.language}>
                            {(p) => (
                                <select {...p} value={values.language} onChange={(ev) => set('language', ev.target.value)} className={input}>
                                    {CR_LANGUAGES.map((l) => <option key={l} value={l}>{languageLabel(l)}</option>)}
                                </select>
                            )}
                        </Field>
                        <Field id="cr-category" label="Category" required error={e.category}>
                            {(p) => (
                                <select {...p} value={values.category} onChange={(ev) => set('category', ev.target.value)} className={input}>
                                    {!(CR_CATEGORIES as readonly string[]).includes(values.category) && <option value="">Choose a category</option>}
                                    {CR_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                                </select>
                            )}
                        </Field>
                        <Field id="cr-difficulty" label="Difficulty" error={e.difficulty}>
                            {(p) => (
                                <select {...p} value={values.difficulty} onChange={(ev) => set('difficulty', ev.target.value as CrFormValues['difficulty'])} className={input}>
                                    {CR_DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
                                </select>
                            )}
                        </Field>
                        <Field id="cr-points" label="Points" error={e.points} hint="What a clean first pass pays. 0 uses the table: 25 easy, 50 medium, 100 hard.">
                            {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={CR_LIMITS.points} value={values.points} onChange={(ev) => set('points', ev.target.value)} className={`${input} ${e.points ? inputError : ''}`} />}
                        </Field>
                        <Field id="cr-tags" label="Tags" error={e.tags} hint={`Separated by commas. At most ${CR_LIMITS.tags}, ${CR_LIMITS.tagLength} characters each.`} className="sm:col-span-2">
                            {(p) => <input {...p} value={values.tags} onChange={(ev) => set('tags', ev.target.value)} className={`${input} ${e.tags ? inputError : ''}`} />}
                        </Field>
                    </div>
                </Section>

                <Section id="cr-code" title="Code" description="The code members review. It is shown as text, one line per row, and graded by line number.">
                    <p role="note" className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100" data-testid="strip-note">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                            Code and answer text are stored exactly as written, so an exercise can contain <code>&lt;script&gt;</code> tags or <code>on...=</code> attributes (an XSS exercise).
                            Titles, descriptions, tags, finding titles and OWASP names have script-like text removed when you save. Members always see code as text, never as HTML.
                        </span>
                    </p>
                    {stripped && (
                        <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100" data-testid="strip-warning">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>A title, description, tag, finding title or OWASP name looks like it has a script tag or an event handler such as <code>once=</code>. The API removes it when you save. Put code in the code or answer fields, or in backticks.</span>
                        </p>
                    )}
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
                        <Field id="cr-vulnerable-code" label="Vulnerable code" required error={e.vulnerableCode}
                            hint={`${lineCount} ${lineCount === 1 ? 'line' : 'lines'}, ${(bytes / 1024).toFixed(1)} of ${CR_LIMITS.codeBytes / 1024} KB. Line endings and trailing blank lines are normalised when it is saved.`}>
                            {(p) => <textarea {...p} rows={16} wrap="off" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={values.vulnerableCode} onChange={(ev) => set('vulnerableCode', ev.target.value)} className={`${mono} whitespace-pre overflow-x-auto ${e.vulnerableCode ? inputError : ''}`} />}
                        </Field>
                        <div className="min-w-0" data-testid="code-preview">
                            <p className="mb-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">Preview with line numbers</p>
                            {previewActive && (
                                <p className="mb-2 rounded-lg bg-violet-100 px-3 py-2 text-sm text-violet-950 dark:bg-violet-500/20 dark:text-violet-100" data-testid="picking-banner">
                                    Picking lines for finding {picking + 1}: {anchor === null ? 'click the first line.' : `first line ${anchor}. Click the last line.`} Keyboard: arrows move, Space picks, Escape stops.
                                </p>
                            )}
                            {lines.length > 0 ? (
                                <CodeLines
                                    lines={lines}
                                    label="Preview of the code. Lines can be picked for a finding while picking is on."
                                    idPrefix="cr-preview"
                                    bands={bands}
                                    interactive={previewActive}
                                    selection={previewActive ? cursor : null}
                                    showCursor={previewActive && previewFocused}
                                    onLineClick={(n) => { setCursor(selectLine(n, lineCount)); pick(n); }}
                                    onKeyDown={onPreviewKey}
                                    onFocus={() => setPreviewFocused(true)}
                                    onBlur={() => setPreviewFocused(false)}
                                    maxHeight="22rem"
                                />
                            ) : (
                                <p className={`${card} p-4 text-sm ${muted}`}>The preview appears when you type the code.</p>
                            )}
                            <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-gray-800 dark:text-gray-200" data-testid="pick-note">{pickNote}</p>
                            <p className={`text-xs ${muted}`}>Violet lines are findings. Red lines are shared by two findings, which is not allowed.</p>
                        </div>
                    </div>
                </Section>

                <Section id="cr-findings" title="Findings" description="The answer key. Each finding is a range of lines inside the code; findings cannot share lines. Members never see this list: they see a finding only after they find it, or in the solution.">
                    <FindingsEditor rows={values.findings} onChange={(rows) => setList('findings', rows)} errors={e} pickingKey={pickingKey} onPick={startPicking} lineCount={lineCount} disabled={readOnly} />
                </Section>

                <Section id="cr-hints" title="Hints" description="Members open hints one at a time, in this order. Each costs its points once.">
                    <HintsEditor rows={values.hints} onChange={(rows) => setList('hints', rows)} errors={e} disabled={readOnly} />
                </Section>

                <Section id="cr-solution" title="Solution material" description="Shown to a member in the solution, after their first graded attempt. Optional.">
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
                        <Field id="cr-explanation" label="Overview" error={e.explanation} hint={`${values.explanation.length}/${CR_LIMITS.overview}. Markdown or text, shown sanitised.`}>
                            {(p) => <textarea {...p} rows={4} value={values.explanation} onChange={(ev) => set('explanation', ev.target.value)} className={`${input} ${e.explanation ? inputError : ''}`} />}
                        </Field>
                        <Field id="cr-fixed" label="Fixed code" error={e.fixedCode} hint={`At most ${CR_LIMITS.extraCodeBytes / 1024} KB.`}>
                            {(p) => <textarea {...p} rows={6} wrap="off" spellCheck={false} value={values.fixedCode} onChange={(ev) => set('fixedCode', ev.target.value)} className={`${mono} whitespace-pre overflow-x-auto ${e.fixedCode ? inputError : ''}`} />}
                        </Field>
                        <Field id="cr-exploited" label="Exploited code" error={e.exploitedCode}>
                            {(p) => <textarea {...p} rows={6} wrap="off" spellCheck={false} value={values.exploitedCode} onChange={(ev) => set('exploitedCode', ev.target.value)} className={`${mono} whitespace-pre overflow-x-auto ${e.exploitedCode ? inputError : ''}`} />}
                        </Field>
                        <Field id="cr-fixed-exploited" label="Fixed code against the exploit" error={e.fixedExploitedCode}>
                            {(p) => <textarea {...p} rows={6} wrap="off" spellCheck={false} value={values.fixedExploitedCode} onChange={(ev) => set('fixedExploitedCode', ev.target.value)} className={`${mono} whitespace-pre overflow-x-auto ${e.fixedExploitedCode ? inputError : ''}`} />}
                        </Field>
                        <fieldset className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-xl border border-gray-200 p-4 dark:border-neutral-800">
                            <legend className="px-1 text-sm font-medium text-gray-800 dark:text-gray-200">Exploit example (optional)</legend>
                            <Field id="cr-ex-title" label="Exploit example title" error={e.exploitExample}>
                                {(p) => <input {...p} maxLength={CR_LIMITS.findingTitle} value={values.exploitTitle} onChange={(ev) => set('exploitTitle', ev.target.value)} className={input} />}
                            </Field>
                            <Field id="cr-ex-description" label="Exploit example description">
                                {(p) => <textarea {...p} rows={2} value={values.exploitDescription} onChange={(ev) => set('exploitDescription', ev.target.value)} className={input} />}
                            </Field>
                            <Field id="cr-ex-payload" label="Exploit example payload">
                                {(p) => <textarea {...p} rows={3} spellCheck={false} value={values.exploitPayload} onChange={(ev) => set('exploitPayload', ev.target.value)} className={mono} />}
                            </Field>
                            <Field id="cr-ex-result" label="Exploit example result">
                                {(p) => <textarea {...p} rows={3} spellCheck={false} value={values.exploitResult} onChange={(ev) => set('exploitResult', ev.target.value)} className={mono} />}
                            </Field>
                        </fieldset>
                    </div>
                </Section>
            </fieldset>

            <section aria-labelledby="cr-publish" className={`${card} p-5 sm:p-6`}>
                <h2 id="cr-publish" className="text-lg font-semibold text-gray-900 dark:text-white">Publish</h2>
                <label className="mt-3 flex items-start gap-3 text-sm text-gray-900 dark:text-gray-100">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 accent-orange-700" checked={values.isPublished} disabled={readOnly} onChange={(ev) => set('isPublished', ev.target.checked)} />
                    <span>
                        <span className="font-medium">Published</span>
                        <span className={`block ${muted}`}>Members can see and attempt a published exercise. A draft is visible to staff only. Publishing needs at least one finding. Unpublishing keeps every attempt, pass and point.</span>
                    </span>
                </label>
                {e.findings && values.isPublished && <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300">{e.findings}</p>}

                {!readOnly && (
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <button type="submit" className={btnPrimary} disabled={pending || remove.isPending} data-testid="save-snippet">
                            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                            {edit ? 'Save changes' : values.isPublished ? 'Create and publish' : 'Save as draft'}
                        </button>
                        <Link href="/admin/code-review" className={btnSecondary}>Cancel</Link>
                        {edit && (
                            <button type="button" className={`${btnDanger} ml-auto`} disabled={pending || remove.isPending} onClick={() => setConfirmDelete(true)}>
                                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete exercise
                            </button>
                        )}
                    </div>
                )}
                {readOnly && <div className="mt-6"><Link href="/admin/code-review" className={btnSecondary}>Back to the list</Link></div>}
            </section>

            <ConfirmDialog
                open={keyChange !== null}
                variant="warning"
                title="Change an exercise members have solved?"
                description={keyChange ? keyChangeText(keyChange.info) : ''}
                confirmText="Save the change"
                cancelText="Keep editing"
                onCancel={() => setKeyChange(null)}
                onConfirm={confirmKeyChange}
            />

            <ConfirmDialog
                open={confirmDelete}
                variant="danger"
                title="Delete this exercise?"
                description="The exercise, its answer key, every attempt and every member's progress on it are removed. This cannot be undone. If a member passed it, it cannot be deleted: unpublish it instead."
                confirmText="Delete exercise"
                cancelText="Keep it"
                onCancel={() => setConfirmDelete(false)}
                onConfirm={doDelete}
            />
        </form>
    );
}
