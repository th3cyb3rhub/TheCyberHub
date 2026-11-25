'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Code2, Pencil, Search, Star } from 'lucide-react';
import { btnSecondary, card, cardPad, chip, muted, pageBg } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useCodeSnippet, useSubmitAttempt } from '@/hooks/queries/useCodeReview';
import { ApiError } from '@/lib/api';
import { crErrorMessage, isDailyLimit, isRateLimited, retryAfterSeconds, tooBroadLimits } from '@/lib/codeReview/errors';
import { markLimits, type MarkLimits } from '@/lib/codeReview/constants';
import { isCrReader, isCrWriter } from '@/lib/codeReview/roles';
import { markedLines, splitCode, toPayload, type MarkDraft } from '@/lib/codeReview/selection';
import { plural, pointsText } from '@/lib/codeReview/display';
import type { CrAttemptResult, CrDetail, CrMark } from '@/types/codeReview';
import { CategoryChip, DifficultyBadge, LanguageChip, StatusBadge } from './Badges';
import type { Band } from './CodeLines';
import { AttemptHistory } from './AttemptHistory';
import { HintsPanel } from './HintsPanel';
import { LineMarker } from './LineMarker';
import { ErrorState } from './ListStates';
import { MarksPanel, useCountdown, type SubmitBlock } from './MarksPanel';
import { ProgressPanel } from './ProgressPanel';
import { ResultView } from './ResultView';
import { RulesBox } from './RulesBox';
import { SolutionPanel } from './SolutionPanel';

function Shell({ children }: { children: React.ReactNode }) {
    return <div className={pageBg}><div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">{children}</div></div>;
}

function Header({ snippet, canEdit }: { snippet: CrDetail; canEdit: boolean }) {
    return (
        <header className="mb-6">
            <Link href="/code-review" className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-gray-400 dark:hover:text-white">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All exercises
            </Link>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <DifficultyBadge difficulty={snippet.difficulty} />
                <CategoryChip category={snippet.category} />
                <LanguageChip language={snippet.language} />
                {snippet.progress && <StatusBadge status={snippet.progress.status} />}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="min-w-0 break-words text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">{snippet.title}</h1>
                {canEdit && <Link href={`/admin/code-review/${encodeURIComponent(snippet.slug)}/edit`} className={btnSecondary}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit exercise</Link>}
            </div>
            {snippet.description && <p className="mt-3 max-w-3xl whitespace-pre-line break-words text-sm text-gray-800 dark:text-gray-200" data-testid="description">{snippet.description}</p>}
            <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-gray-800 dark:text-gray-200" aria-label="Exercise details">
                <li className="inline-flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white"><Star className="h-4 w-4 text-orange-700 dark:text-orange-400" aria-hidden="true" /> up to {pointsText(snippet.points)}</li>
                <li className="inline-flex items-center gap-1.5"><Search className="h-4 w-4" aria-hidden="true" /> {snippet.findingCount === 0 ? 'No findings yet' : `${plural(snippet.findingCount, 'issue')} to find`}</li>
                <li className="inline-flex items-center gap-1.5"><Code2 className="h-4 w-4" aria-hidden="true" /> {plural(snippet.lineCount || 0, 'line')}</li>
                <li>{plural(snippet.hintCount, 'hint')}</li>
                <li>{plural(snippet.solveCount, 'member')} passed</li>
            </ul>
            {snippet.tags.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
                    {snippet.tags.map((t) => <li key={t} className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{t}</li>)}
                </ul>
            )}
        </header>
    );
}

/**
 * One exercise. The server renders the public copy (the code, no viewer); a signed-in member's own
 * answer, with the viewer block, replaces it. A visitor reads and marks everything and is asked to
 * sign in to submit. The code is shown as text, line by line, and graded on the server.
 */
/** What an exercise that is not there (or not published, for this viewer) says */
export function ExerciseMissingBody() {
    return (
        <>
            <Code2 className="mx-auto mb-4 h-10 w-10 text-gray-500" aria-hidden="true" />
            <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">This exercise is not available</h1>
            <p className={`mb-6 text-sm ${muted}`}>It may have been removed, or it is not published yet.</p>
            <Link href="/code-review" className={btnSecondary}>Back to the exercises</Link>
        </>
    );
}

/** The page for an address that cannot be an exercise */
export function ExerciseMissing() {
    return (
        <Shell>
            <div className="mx-auto max-w-2xl pt-6 text-center"><ExerciseMissingBody /></div>
        </Shell>
    );
}

export function ExerciseView({ slug, initialSnippet, initialUpdatedAt }: { slug: string; initialSnippet: CrDetail | null; initialUpdatedAt?: number }) {
    const { user, loading } = useAuth();
    const query = useCodeSnippet(slug, initialSnippet, initialUpdatedAt);
    const submit = useSubmitAttempt();
    const snippet = query.data;
    const signedIn = !!user;
    const staff = isCrReader(user?.role);

    const [marks, setMarks] = useState<MarkDraft[]>([]);
    const [outcome, setOutcome] = useState<{ result: CrAttemptResult; marks: CrMark[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [waitUntil, setWaitUntil] = useState<number | null>(null);
    /** The ceilings the API named in a CR_TOO_BROAD answer: they win over the preflight, which is a lower bound */
    const [serverLimits, setServerLimits] = useState<MarkLimits | null>(null);
    const wait = useCountdown(waitUntil);
    const resultRef = useRef<HTMLDivElement>(null);
    const [focusResult, setFocusResult] = useState(false);

    // Nothing of one account stays on screen for the next: the result and the marks go on sign-out or a switch
    const userId = user?.id ?? null;
    const lastUser = useRef(userId);
    useEffect(() => {
        if (lastUser.current !== null && lastUser.current !== userId) {
            setOutcome(null); setMarks([]); setError(null); setWaitUntil(null); setServerLimits(null);
        }
        lastUser.current = userId;
    }, [userId]);

    const code = snippet?.vulnerableCode ?? '';
    const lines = useMemo(() => splitCode(code), [code]);
    // Once the details are revealed the green lines are the findings; before that they are the member's own marks that matched
    const bands = useMemo<Band[]>(() => {
        if (!outcome) return [];
        if (outcome.result.detailsRevealed) return outcome.result.matched.map((m) => ({ start: m.lineStart, end: m.lineEnd, tone: 'match' as const }));
        return outcome.result.marks
            .filter((v) => v.result === 'matched' && outcome.marks[v.index])
            .map((v) => ({ start: outcome.marks[v.index].lineStart, end: outcome.marks[v.index].lineEnd, tone: 'match' as const }));
    }, [outcome]);
    const limits = useMemo<MarkLimits>(() => serverLimits ?? markLimits(snippet?.findingCount ?? 0, lines.length), [serverLimits, snippet?.findingCount, lines.length]);

    // The result takes the focus once it is on the page, so a screen reader reads it and the page scrolls to it
    useEffect(() => {
        if (!focusResult || !outcome) return;
        resultRef.current?.focus({ preventScroll: false });
        setFocusResult(false);
    }, [focusResult, outcome]);

    if (!snippet) {
        if (loading || query.isLoading || query.isPending) {
            return (
                <Shell>
                    <div className="space-y-4" role="status" aria-label="Loading exercise">
                        <div className="h-6 w-32 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                        <div className={`${card} h-40 animate-pulse`} />
                        <div className={`${card} h-72 animate-pulse`} />
                    </div>
                </Shell>
            );
        }
        const missing = query.error instanceof ApiError && query.error.status === 404;
        return (
            <Shell>
                <div className="mx-auto max-w-2xl pt-6 text-center">
                    {missing ? (
                        <ExerciseMissingBody />
                    ) : (
                        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this exercise" />
                    )}
                </div>
            </Shell>
        );
    }

    // What the server rendered has no viewer. A signed-in member waits for their own answer: until then the panels are neutral.
    const viewerKnown = !user || (!query.isPlaceholderData && snippet.viewer !== null);
    const viewerLoading = !!user && !viewerKnown && query.isPlaceholderData;
    const viewer = viewerKnown ? snippet.viewer : null;
    const view: CrDetail = viewerKnown ? snippet : { ...snippet, viewer: null };

    let block: SubmitBlock | null = null;
    // While the session is still being read nobody is asked to sign in (that would flash and vanish)
    if (loading) block = { kind: 'loading' };
    else if (!signedIn) block = { kind: 'signed-out', href: `/auth?redirect=${encodeURIComponent(`/code-review/${snippet.slug}`)}` };
    else if (!viewer) block = { kind: 'loading' };
    else if (snippet.findingCount === 0) block = { kind: 'not-gradable' };
    else if (viewer.attemptsToday > 0 && viewer.attemptsLeftToday <= 0) block = { kind: 'no-attempts' };

    const send = () => {
        const sent = toPayload(marks);
        setError(null);
        // The same check the API makes, so a member rarely waits for a refusal
        if (marks.length > limits.maxMarks || markedLines(marks) > limits.maxLines) {
            setError(`Too many marks or too many lines marked. An answer can hold at most ${limits.maxMarks} marks covering at most ${limits.maxLines} lines. Remove some and send again.`);
            return;
        }
        submit.mutate({ ref: slug, marks: sent }, {
            onSuccess: (result) => { setOutcome({ result, marks: sent }); setWaitUntil(null); setFocusResult(true); },
            onError: (err) => {
                const seconds = retryAfterSeconds(err);
                // The daily cap is a long wait the page states in words; a per-minute limit is a countdown
                if (isRateLimited(err) && !isDailyLimit(err) && seconds) setWaitUntil(Date.now() + seconds * 1000);
                const broad = tooBroadLimits(err);
                if (broad) setServerLimits(broad);
                setError(crErrorMessage(err));
            },
        });
    };

    const attemptsLeft = viewer ? Math.max(0, viewer.attemptsLeftToday) : null;

    return (
        <Shell>
            <Header snippet={snippet} canEdit={isCrWriter(user?.role)} />

            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[repeat(4,auto)_1fr] lg:items-start">
                {viewer && (
                    <div className="lg:col-start-2">
                        <ProgressPanel viewer={viewer} staff={staff} />
                    </div>
                )}

                {user && !viewer && (
                    <div className="lg:col-start-2">
                        <section className={cardPad} aria-busy="true" data-testid="progress-pending">
                            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Your progress</h2>
                            <div className="space-y-2" role="status" aria-label="Loading your progress">
                                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                                <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                            </div>
                            {!viewerLoading && <button type="button" onClick={() => void query.refetch()} className={`${btnSecondary} mt-4`}>Reload my progress</button>}
                        </section>
                    </div>
                )}

                <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-5 lg:row-start-1">
                    <section aria-labelledby="cr-code" className={cardPad} data-testid="code-card">
                        <h2 id="cr-code" className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">Review the code</h2>
                        <p className={`mb-4 text-sm ${muted}`}>Find the lines that are vulnerable. {plural(lines.length, 'line')}, shown as text.</p>
                        {code.trim() ? (
                            <LineMarker lines={lines} marks={marks} onMarksChange={setMarks} bands={bands} limits={limits} />
                        ) : (
                            <p className={`text-sm ${muted}`}>This exercise has no code yet.</p>
                        )}
                        {outcome && bands.length > 0 && (
                            <p className={`mt-3 text-xs ${muted}`} data-testid="legend">Green lines are what you found in your last attempt. Orange lines are your marks.</p>
                        )}
                    </section>

                    <MarksPanel
                        marks={marks}
                        onMarksChange={setMarks}
                        onSubmit={send}
                        submitting={submit.isPending}
                        block={block}
                        error={error}
                        waitSeconds={wait}
                        attemptsLeft={attemptsLeft}
                        hasResult={!!outcome}
                        limits={limits}
                    />

                    {outcome && (
                        <ResultView
                            ref={resultRef}
                            result={outcome.result}
                            marks={outcome.marks}
                            findingCount={snippet.findingCount}
                            staff={staff}
                            solutionViewed={viewer?.solutionViewed ?? false}
                        />
                    )}
                </div>

                {snippet.hints.length > 0 && <div className="lg:col-start-2"><HintsPanel snippet={view} snippetRef={slug} signedIn={signedIn} staff={staff} loading={viewerLoading} /></div>}
                <div className="lg:col-start-2"><SolutionPanel snippet={view} snippetRef={slug} signedIn={signedIn} staff={staff} loading={viewerLoading} /></div>
                {signedIn && !!viewer && viewer.attempts > 0 && <div className="lg:col-start-2"><AttemptHistory slug={slug} enabled /></div>}
                <div className="lg:col-start-2"><RulesBox points={snippet.points} findingCount={snippet.findingCount} lineCount={lines.length} /></div>
            </div>
        </Shell>
    );
}
