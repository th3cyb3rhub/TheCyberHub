'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { btnSecondary, card, focusRing, input, muted } from '@/components/events/styles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { useAddCtfChallenge, useCtfPickerChallenges, useRemoveCtfChallenge, useSetCtfChallenges } from '@/hooks/queries/useCtf';
import { categoryLabel, pointsText } from '@/lib/ctf/display';
import { challengesWithSolves, ctfErrorMessage } from '@/lib/ctf/errors';
import { FORM_LIMITS } from '@/lib/ctf/form';
import type { CtfCompetition, CtfPickerChallenge } from '@/types/ctf';
import { CtfDifficultyBadge } from '../Badges';

/** One challenge of the set as the editor shows it */
interface SetRow {
    id: string;
    title: string;
    category?: string;
    difficulty?: string;
    basePoints?: number;
    solveCount?: number;
    missing?: boolean;
}

// aria-disabled, not the disabled attribute: a disabled button drops out of the focus order, so a
// keyboard user who just moved a row would lose their place
const iconBtn = `inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent dark:border-neutral-700 dark:text-gray-300 dark:hover:bg-neutral-800 ${focusRing}`;

/** Where focus goes once the list has changed after a keyboard action */
type FocusRequest =
    | { kind: 'move'; id: string; dir: -1 | 1 }
    | { kind: 'remove'; neighbour: string | null };

/**
 * Keeps keyboard focus where the user is after the set changes: on the moved row's own move button
 * (so the same key moves it again), on the neighbour of a removed row, or on the list heading when
 * nothing is left. The request waits for the new order to arrive (the API answers first when a
 * saved set changes) and is dropped by `cancel` when the call fails.
 */
function useSetFocus(ids: string[]) {
    const listRef = useRef<HTMLOListElement>(null);
    const headingRef = useRef<HTMLParagraphElement>(null);
    const pending = useRef<FocusRequest | null>(null);
    const before = useRef(ids);

    const request = useCallback((req: FocusRequest) => { pending.current = req; }, []);
    const cancel = useCallback(() => { pending.current = null; }, []);

    const key = ids.join('|');
    useEffect(() => {
        const was = before.current;
        before.current = ids;
        const req = pending.current;
        if (!req || was.join('|') === key) return;
        pending.current = null;
        const row = (id: string) => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-testid="set-row"]') ?? []).find((el) => el.dataset.id === id) ?? null;
        if (req.kind === 'move') {
            const target = row(req.id);
            const wanted = target?.querySelector<HTMLElement>(`[data-action="${req.dir === -1 ? 'up' : 'down'}"]`);
            const other = target?.querySelector<HTMLElement>(`[data-action="${req.dir === -1 ? 'down' : 'up'}"]`);
            (wanted && wanted.getAttribute('aria-disabled') !== 'true' ? wanted : other ?? wanted ?? target)?.focus();
        } else {
            (req.neighbour ? row(req.neighbour) : null)?.focus();
            if (!req.neighbour || !row(req.neighbour)) headingRef.current?.focus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return { listRef, headingRef, request, cancel };
}

function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
    const to = index + delta;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
}

function SetList({ rows, busy, onMove, onRemove, removeBlocked, listRef, focus }: {
    rows: SetRow[];
    busy: boolean;
    onMove: (index: number, delta: -1 | 1) => void;
    onRemove: (row: SetRow) => void;
    /** A challenge with solves cannot leave the set */
    removeBlocked: (row: SetRow) => boolean;
    listRef: React.RefObject<HTMLOListElement | null>;
    focus: ReturnType<typeof useSetFocus>['request'];
}) {
    if (rows.length === 0) {
        return <p className={`rounded-xl border border-dashed border-gray-300 p-4 text-sm dark:border-neutral-700 ${muted}`} data-testid="set-empty">No challenges yet. Search below and add the ones players should solve.</p>;
    }
    return (
        <ol ref={listRef} className="space-y-2" aria-label="Challenges in this competition" aria-busy={busy || undefined} data-testid="set-list">
            {rows.map((row, i) => {
                const blocked = removeBlocked(row);
                const first = i === 0;
                const last = i === rows.length - 1;
                return (
                    <li key={row.id} tabIndex={-1} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-neutral-800" data-testid="set-row" data-id={row.id}>
                        <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-gray-600 dark:text-gray-400" aria-hidden="true">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium text-gray-900 dark:text-white">
                                <span className="sr-only">{i + 1}. </span>
                                {row.missing ? 'A deleted challenge' : row.title}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                                {row.missing ? <span>It no longer exists. Remove it from the set.</span> : (
                                    <>
                                        {row.category && <span>{categoryLabel(row.category)}</span>}
                                        {row.difficulty && <CtfDifficultyBadge difficulty={row.difficulty} />}
                                        {row.basePoints !== undefined && <span>{pointsText(row.basePoints)}</span>}
                                    </>
                                )}
                                {row.solveCount !== undefined && row.solveCount > 0 && <span className="font-medium text-gray-800 dark:text-gray-200">{row.solveCount} {row.solveCount === 1 ? 'solve' : 'solves'}: it cannot be removed</span>}
                            </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                            <button type="button" data-action="up" className={iconBtn} aria-disabled={busy || first ? true : undefined}
                                onClick={() => { if (busy || first) return; focus({ kind: 'move', id: row.id, dir: -1 }); onMove(i, -1); }} aria-label={`Move ${row.title} up`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                            <button type="button" data-action="down" className={iconBtn} aria-disabled={busy || last ? true : undefined}
                                onClick={() => { if (busy || last) return; focus({ kind: 'move', id: row.id, dir: 1 }); onMove(i, 1); }} aria-label={`Move ${row.title} down`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                            <button type="button" data-action="remove" className={`${iconBtn} text-red-800 dark:text-red-300`} aria-disabled={busy || blocked ? true : undefined}
                                onClick={() => { if (busy || blocked) return; onRemove(row); }} aria-label={blocked ? `${row.title} has solves and cannot be removed` : `Remove ${row.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

function Picker({ inSet, busy, onAdd, full }: { inSet: Set<string>; busy: boolean; onAdd: (challenge: CtfPickerChallenge) => void; full: boolean }) {
    const [term, setTerm] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => {
        const id = window.setTimeout(() => setSearch(term), 300);
        return () => window.clearTimeout(id);
    }, [term]);
    const query = useCtfPickerChallenges(search);
    const items = query.data?.items ?? [];
    const short = term.trim().length === 1;

    return (
        <div className="mt-6" data-testid="picker">
            <label htmlFor="picker-search" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">Add challenges</label>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                <input id="picker-search" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search challenges by title" autoComplete="off" className={`${input} pl-9`} aria-describedby="picker-hint" />
            </div>
            <p id="picker-hint" className={`mt-1 text-xs ${muted}`}>
                {short ? 'Type at least two characters to search.' : 'Active and draft challenges can be added; archived ones cannot. A challenge in a competition is hidden from the public challenge list until the competition ends.'}
            </p>
            <div className="mt-3" aria-live="polite">
                {query.isLoading ? (
                    <p className={`flex items-center gap-2 text-sm ${muted}`}><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching</p>
                ) : query.isError ? (
                    <p role="alert" className="text-sm text-red-800 dark:text-red-300">{ctfErrorMessage(query.error, 'Could not load challenges.')} <button type="button" className="underline" onClick={() => void query.refetch()}>Try again</button></p>
                ) : items.length === 0 ? (
                    <p className={`text-sm ${muted}`}>{search.trim().length >= 2 ? 'No challenge matches that search.' : 'There are no challenges to add.'}</p>
                ) : (
                    <>
                        <p className="sr-only">{items.length} {items.length === 1 ? 'challenge' : 'challenges'} found</p>
                        <ul className={`${card} max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-neutral-800`} aria-label="Challenges you can add">
                            {items.map((c) => {
                                const added = inSet.has(c._id);
                                return (
                                    <li key={c._id} className="flex items-center gap-3 px-3 py-2.5" data-testid="picker-row" data-id={c._id}>
                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-medium text-gray-900 dark:text-white">{c.title}</p>
                                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                                                <span>{categoryLabel(c.category)}</span>
                                                {c.difficulty && <CtfDifficultyBadge difficulty={c.difficulty} />}
                                                <span>{pointsText(c.basePoints)}</span>
                                                {c.status === 'draft' && <span className="font-medium text-amber-900 dark:text-amber-300">Draft challenge</span>}
                                            </p>
                                        </div>
                                        <button type="button" className={`${btnSecondary} !px-3 !py-1.5 text-xs aria-disabled:cursor-not-allowed aria-disabled:opacity-60`} aria-disabled={added || busy || full ? true : undefined}
                                            onClick={() => { if (added || busy || full) return; onAdd(c); }} aria-label={added ? `${c.title} is in the set` : `Add ${c.title}`}>
                                            {added ? 'In the set' : <><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add</>}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        {query.data?.hasMore && <p className={`mt-2 text-xs ${muted}`}>More challenges match. Type more of the title to narrow the list.</p>}
                    </>
                )}
            </div>
        </div>
    );
}

function Header({ count, headingRef }: { count: number; headingRef: React.RefObject<HTMLParagraphElement | null> }) {
    return (
        <p ref={headingRef} tabIndex={-1} className={`mb-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${muted}`} aria-live="polite" data-testid="set-count">
            {count} of {FORM_LIMITS.challengesMax} challenges. Players see them in this order.
        </p>
    );
}

/**
 * A new competition keeps its set in the form and sends it with the create call. An existing one
 * changes its set at once, with the API's own calls (add, remove, reorder), because a challenge with
 * solves is refused there and the page must show the truth right away.
 */
export function NewSetEditor({ value, onChange, error }: { value: string[]; onChange: (ids: string[]) => void; error?: string }) {
    const [known, setKnown] = useState<Record<string, CtfPickerChallenge>>({});
    const rows: SetRow[] = value.map((id) => ({ id, title: known[id]?.title ?? id, category: known[id]?.category, difficulty: known[id]?.difficulty, basePoints: known[id]?.basePoints }));
    const focus = useSetFocus(value);
    return (
        <div data-testid="set-editor" data-mode="create">
            <Header count={value.length} headingRef={focus.headingRef} />
            <SetList rows={rows} busy={false} removeBlocked={() => false} listRef={focus.listRef} focus={focus.request}
                onMove={(i, d) => onChange(move(value, i, d))}
                onRemove={(row) => {
                    const at = value.indexOf(row.id);
                    focus.request({ kind: 'remove', neighbour: value[at + 1] ?? value[at - 1] ?? null });
                    onChange(value.filter((id) => id !== row.id));
                }} />
            {error && <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300">{error}</p>}
            <Picker inSet={new Set(value)} busy={false} full={value.length >= FORM_LIMITS.challengesMax}
                onAdd={(c) => { setKnown((k) => ({ ...k, [c._id]: c })); onChange([...value, c._id]); }} />
        </div>
    );
}

export function SavedSetEditor({ competition }: { competition: CtfCompetition }) {
    const { addToast } = useToast();
    const add = useAddCtfChallenge();
    const remove = useRemoveCtfChallenge();
    const reorder = useSetCtfChallenges();
    const [removing, setRemoving] = useState<SetRow | null>(null);
    const [error, setError] = useState<string | null>(null);
    const busy = add.isPending || remove.isPending || reorder.isPending;

    const ids = competition.challenges;
    const rows = useMemo<SetRow[]>(() => {
        const details = new Map((competition.challengeDetails ?? []).map((d) => [d._id, d]));
        return ids.map((id) => {
            const d = details.get(id);
            return {
                id,
                title: d?.title ?? id,
                category: d?.category,
                difficulty: d?.difficulty,
                basePoints: d?.basePoints,
                solveCount: d?.solveCount,
                missing: d?.missing,
            };
        });
    }, [ids, competition.challengeDetails]);

    const focus = useSetFocus(ids);
    const fail = (err: unknown) => {
        focus.cancel();
        const blocked = challengesWithSolves(err);
        const names = blocked.map((id) => rows.find((r) => r.id === id)?.title ?? id);
        setError(blocked.length ? `${ctfErrorMessage(err)} (${names.join(', ')})` : ctfErrorMessage(err));
    };

    const doAdd = (c: CtfPickerChallenge) => {
        setError(null);
        add.mutate({ id: competition._id, challengeId: c._id }, {
            onSuccess: () => addToast({ variant: 'success', message: `${c.title} added.` }),
            onError: fail,
        });
    };
    const doMove = (index: number, delta: -1 | 1) => {
        setError(null);
        reorder.mutate({ id: competition._id, challenges: move(ids, index, delta) }, { onError: fail });
    };
    const doRemove = () => {
        const row = removing;
        setRemoving(null);
        if (!row) return;
        setError(null);
        const at = ids.indexOf(row.id);
        focus.request({ kind: 'remove', neighbour: ids[at + 1] ?? ids[at - 1] ?? null });
        remove.mutate({ id: competition._id, challengeId: row.id }, {
            onSuccess: () => addToast({ variant: 'success', message: `${row.title} removed.` }),
            onError: fail,
        });
    };

    return (
        <div data-testid="set-editor" data-mode="edit">
            <Header count={ids.length} headingRef={focus.headingRef} />
            <p className={`mb-3 text-xs ${muted}`}>Changes to the set are saved as soon as you make them; they do not wait for the Save button.</p>
            <SetList rows={rows} busy={busy} listRef={focus.listRef} focus={focus.request}
                removeBlocked={(row) => (row.solveCount ?? 0) > 0}
                onMove={doMove}
                onRemove={setRemoving} />
            <div aria-live="polite">{error && <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-300" data-testid="set-error">{error}</p>}</div>
            <Picker inSet={new Set(ids)} busy={busy} full={ids.length >= FORM_LIMITS.challengesMax} onAdd={doAdd} />
            <ConfirmDialog
                open={!!removing}
                variant="danger"
                title={removing ? `Remove ${removing.title}?` : 'Remove this challenge?'}
                description="Players no longer see it in this competition. A challenge that already has solves cannot be removed: the points earned stay."
                confirmText="Remove challenge"
                onCancel={() => setRemoving(null)}
                onConfirm={doRemove}
            />
        </div>
    );
}

/** The set of a new competition lives in the form; the set of a saved one saves by itself */
export function ChallengeSetEditor({ competition, value, onChange, error }: { competition?: CtfCompetition; value: string[]; onChange: (ids: string[]) => void; error?: string }) {
    return competition ? <SavedSetEditor competition={competition} /> : <NewSetEditor value={value} onChange={onChange} error={error} />;
}
