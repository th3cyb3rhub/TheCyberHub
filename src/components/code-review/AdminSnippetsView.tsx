'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Code2, ExternalLink, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/events/PageShell';
import { btnPrimary, btnSecondary, card, focusRing, input, muted } from '@/components/events/styles';
import { ViewerTime } from '@/components/internships/ViewerTime';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/context/ToastContext';
import { useDeleteSnippet, useManagedSnippets, useSetPublished } from '@/hooks/queries/useCodeReview';
import { categoryLabel, languageLabel } from '@/lib/codeReview/constants';
import { plural } from '@/lib/codeReview/display';
import { crErrorCode, crErrorMessage } from '@/lib/codeReview/errors';
import { SEARCH_DEBOUNCE_MS, SEARCH_MAX, SEARCH_MIN } from '@/lib/codeReview/filters';
import type { CrManageCard } from '@/types/codeReview';
import { AdminGate } from './AdminGate';
import { DifficultyBadge, PublishedBadge } from './Badges';
import { ErrorState, ListSkeleton } from './ListStates';

/** A published exercise with no finding cannot be graded: the API refuses to publish one, and the migration puts old ones back to draft */
export const needsFinding = (s: Pick<CrManageCard, 'findingCount'>) => s.findingCount === 0;

function Row({ snippet, canWrite }: { snippet: CrManageCard; canWrite: boolean }) {
    const publish = useSetPublished();
    const remove = useDeleteSnippet();
    const { addToast } = useToast();
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<{ message: string; code?: string } | null>(null);
    const busy = publish.isPending || remove.isPending;
    const empty = needsFinding(snippet);

    const toggle = () => {
        setError(null);
        publish.mutate({ ref: snippet.slug, published: !snippet.isPublished }, {
            onSuccess: () => addToast({ variant: 'success', message: snippet.isPublished ? 'Exercise unpublished. Progress and points stay.' : 'Exercise published.' }),
            onError: (err) => setError({ message: crErrorMessage(err), code: crErrorCode(err) }),
        });
    };

    const doDelete = () => {
        setConfirming(false);
        setError(null);
        remove.mutate({ ref: snippet.slug }, {
            onSuccess: () => addToast({ variant: 'success', message: 'Exercise deleted.' }),
            onError: (err) => setError({ message: crErrorMessage(err), code: crErrorCode(err) }),
        });
    };

    return (
        <li className={`${card} p-4 sm:p-5`} data-testid="admin-snippet" data-published={snippet.isPublished ? 'true' : 'false'}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-[min(100%,18rem)] flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <PublishedBadge published={snippet.isPublished} />
                        <DifficultyBadge difficulty={snippet.difficulty} />
                        <span className={`text-xs ${muted}`}>{categoryLabel(snippet.category)} {'·'} {languageLabel(snippet.language)}</span>
                    </div>
                    <h2 className="break-words text-base font-semibold text-gray-900 dark:text-white">
                        <Link href={`/code-review/${encodeURIComponent(snippet.slug)}`} className={`rounded hover:underline ${focusRing}`}>{snippet.title}</Link>
                    </h2>
                    <p className={`mt-1 flex flex-wrap gap-x-2 text-xs ${muted}`}>
                        <span className="break-all">/code-review/{snippet.slug}</span>
                        <span>{snippet.points} pts</span>
                        <span>updated <ViewerTime iso={snippet.updatedAt} /></span>
                    </p>
                    <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-800 dark:text-gray-200" data-testid="admin-counts">
                        <span><strong>{snippet.findingCount}</strong> {snippet.findingCount === 1 ? 'finding' : 'findings'}</span>
                        <span><strong>{snippet.hintCount}</strong> {snippet.hintCount === 1 ? 'hint' : 'hints'}</span>
                        <span><strong>{snippet.attemptCount}</strong> {snippet.attemptCount === 1 ? 'attempt' : 'attempts'}</span>
                        <span><strong>{snippet.solveCount}</strong> passed</span>
                    </p>
                    {empty && (
                        <p role="note" className="mt-2 inline-flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100" data-testid="no-finding-warning">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>No findings yet, so it cannot be graded or published. {canWrite ? 'Edit it and add one.' : 'An administrator has to add one.'}</span>
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/code-review/${encodeURIComponent(snippet.slug)}`} className={`${btnSecondary} !px-3 !py-2`}><ExternalLink className="h-4 w-4" aria-hidden="true" /> View{' '}<span className="sr-only">{snippet.title}</span></Link>
                    <Link href={`/admin/code-review/${encodeURIComponent(snippet.slug)}/edit`} className={`${btnSecondary} !px-3 !py-2`}>
                        {canWrite ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />} {canWrite ? 'Edit' : 'Open'}{' '}<span className="sr-only">{snippet.title}</span>
                    </Link>
                    {canWrite && (
                        <>
                            <button type="button" className={`${btnSecondary} !px-3 !py-2`} disabled={busy || (!snippet.isPublished && empty)} onClick={toggle}>
                                {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : snippet.isPublished ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                                {snippet.isPublished ? 'Unpublish' : 'Publish'}{' '}<span className="sr-only">{snippet.title}</span>
                            </button>
                            <button type="button" className={`${btnSecondary} !px-3 !py-2 text-red-800 dark:text-red-300`} disabled={busy} onClick={() => setConfirming(true)}>
                                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete{' '}<span className="sr-only">{snippet.title}</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
            {error && (
                <p role="alert" className="mt-3 text-sm text-red-800 dark:text-red-300" data-testid="row-error">
                    {error.message}
                    {error.code === 'CR_HAS_PROGRESS' && snippet.isPublished && <> <button type="button" className="underline" onClick={toggle}>Unpublish it now</button></>}
                </p>
            )}
            <ConfirmDialog
                open={confirming}
                variant="danger"
                title={`Delete ${snippet.title}?`}
                description="The exercise, its answer key, every attempt and every member's progress on it are removed. This cannot be undone. An exercise a member passed cannot be deleted: unpublish it instead."
                confirmText="Delete exercise"
                cancelText="Keep it"
                onCancel={() => setConfirming(false)}
                onConfirm={doDelete}
            />
        </li>
    );
}

const FILTERS: { id: '' | 'published' | 'draft'; label: string }[] = [
    { id: '', label: 'All' }, { id: 'published', label: 'Published' }, { id: 'draft', label: 'Drafts' },
];

function List({ canWrite }: { canWrite: boolean }) {
    const [state, setState] = useState<'' | 'published' | 'draft'>('');
    const [page, setPage] = useState(1);
    const [text, setText] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => {
        const t = window.setTimeout(() => { const s = text.trim().replace(/\s+/g, ' '); setSearch(s.length >= SEARCH_MIN ? s : ''); setPage(1); }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [text]);

    const query = useManagedSnippets({ page, isPublished: state === '' ? '' : state === 'published', search: search || undefined });
    const rows = query.data?.data ?? [];
    const pagination = query.data?.pagination;

    return (
        <PageShell
            title="Code review"
            subtitle={canWrite ? 'Write exercises with their answer key, and decide what is live.' : 'Read-only: moderators can open an exercise to read its answers, but only administrators and owners can change it.'}
            backHref="/admin"
            backLabel="Admin"
            wide
            actions={canWrite ? <Link href="/admin/code-review/new" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden="true" /> New exercise</Link> : undefined}
        >
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <div role="group" aria-label="Filter by state" className="flex flex-wrap gap-2">
                    {FILTERS.map((f) => (
                        <button key={f.id || 'all'} type="button" aria-pressed={state === f.id} onClick={() => { setState(f.id); setPage(1); }}
                            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${focusRing} ${state === f.id
                                ? 'border-orange-700 bg-orange-700 text-white'
                                : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800'}`}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                    <label htmlFor="cr-admin-search" className="sr-only">Search exercises</label>
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                    <input id="cr-admin-search" type="search" value={text} maxLength={SEARCH_MAX} autoComplete="off" onChange={(e) => setText(e.target.value)} placeholder="Search by title or tag" className={`${input} pl-10`} />
                </div>
            </div>

            {query.isLoading ? (
                <ListSkeleton label="Loading exercises" />
            ) : query.isError ? (
                <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load the exercises" />
            ) : rows.length === 0 ? (
                <EmptyState icon={Code2} title={state || search ? 'No exercises match' : 'No exercises yet'} description={state || search ? 'Try another state or search.' : 'Create the first exercise, or load the starter set with the seed script.'} actionLabel={state || search || !canWrite ? undefined : 'New exercise'} actionHref={state || search || !canWrite ? undefined : '/admin/code-review/new'} />
            ) : (
                <>
                    <p className={`mb-3 text-sm ${muted}`} aria-live="polite">{plural(pagination?.total ?? rows.length, 'exercise')}</p>
                    <ul className="space-y-4" aria-label="Exercises">
                        {rows.map((s) => <Row key={s._id} snippet={s} canWrite={canWrite} />)}
                    </ul>
                    {pagination && (pagination.page > 1 || pagination.hasMore) && (
                        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-3">
                            <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button>
                            <p className={`text-sm ${muted}`} aria-live="polite">Page {pagination.page} of {Math.max(1, pagination.pages)}</p>
                            <button type="button" className={btnSecondary} disabled={!pagination.hasMore} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                        </nav>
                    )}
                </>
            )}
        </PageShell>
    );
}

export function AdminSnippetsView() {
    return <AdminGate returnTo="/admin/code-review">{(_user, canWrite) => <List canWrite={canWrite} />}</AdminGate>;
}

