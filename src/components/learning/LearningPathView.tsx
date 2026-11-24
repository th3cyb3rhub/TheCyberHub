'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Award, CheckCircle2, Clock, Layers, Loader2, Lock, Pencil, PlayCircle, Plus, Share2, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useBookmarkPath, useEnroll, useLearningPath, useTickNode } from '@/hooks/queries/useLearningPaths';
import { getMyCertificate } from '@/lib/api/learning';
import { learningErrorMessage, isNotFound } from '@/lib/learning/errors';
import { CATEGORY_LABELS, KIND_LABELS, STATUS_LABELS, label, pathHref, plural } from '@/lib/learning/display';
import { groupByStage, nextStep, nodeContext, nodeState, waitingTitles } from '@/lib/learning/progress';
import type { LearningDetail, PathKind } from '@/types/learning';
import { NodeItem } from './NodeItem';
import { BookmarkToggle, Chip, DifficultyChip, EmptyBlock, ErrorState, ProgressBar, Skeleton, useGoToSignIn, useSignInHref } from './shared';
import { btnPrimary, btnSecondary, card, cardPad, focusRing, muted, pageBg } from '@/components/events/styles';

function PageFrame({ kind, children }: { kind: PathKind; children: React.ReactNode }) {
    const back = kind === 'roadmap' ? { href: '/roadmaps', text: 'All roadmaps' } : { href: '/learning-paths', text: 'All learning paths' };
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6">
                <Link href={back.href} className={`mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${focusRing}`}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {back.text}
                </Link>
                {children}
            </div>
        </div>
    );
}

function DetailSkeleton() {
    return (
        <div role="status" aria-label="Loading" className="space-y-6">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <div className={`${cardPad} space-y-3`}><Skeleton className="h-4 w-1/3" /><Skeleton className="h-2.5 w-full" /></div>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
    );
}

/** The certificate button: a link when the id is known, otherwise it asks the API (which issues it on first request) */
function CertificateButton({ path, certificateId }: { path: LearningDetail; certificateId: string | null }) {
    const router = useRouter();
    const { addToast } = useToast();
    const [busy, setBusy] = useState(false);
    if (certificateId) {
        return <Link href={`/certificates/${certificateId}`} className={btnPrimary}><Award className="h-4 w-4" aria-hidden="true" /> Get certificate</Link>;
    }
    return (
        <button
            type="button"
            className={btnPrimary}
            disabled={busy}
            onClick={async () => {
                setBusy(true);
                try {
                    const cert = await getMyCertificate(path.slug);
                    router.push(`/certificates/${cert.certificateId}`);
                } catch (err) {
                    addToast({ variant: 'error', message: learningErrorMessage(err) });
                    setBusy(false);
                }
            }}
        >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Award className="h-4 w-4" aria-hidden="true" />} Get certificate
        </button>
    );
}

function ShareButton({ title }: { title: string }) {
    const { addToast } = useToast();
    return (
        <button
            type="button"
            className={btnSecondary}
            onClick={async () => {
                const url = window.location.href;
                try {
                    if (typeof navigator.share === 'function') await navigator.share({ title, url });
                    else {
                        await navigator.clipboard.writeText(url);
                        addToast({ variant: 'success', message: 'Link copied.' });
                    }
                } catch (err) {
                    // Closing the share sheet is not an error
                    if ((err as { name?: string })?.name !== 'AbortError') addToast({ variant: 'error', message: 'Could not copy the link.' });
                }
            }}
        >
            <Share2 className="h-4 w-4" aria-hidden="true" /> Share
        </button>
    );
}

function StatusBanner({ path }: { path: LearningDetail }) {
    if (path.archived) {
        return <p role="note" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">This {path.kind === 'roadmap' ? 'roadmap' : 'path'} has been retired. Your progress and certificate are kept.</p>;
    }
    if (path.status && path.status !== 'published') {
        return (
            <p role="note" className="mb-6 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                This page is a <strong>{STATUS_LABELS[path.status].toLowerCase()}</strong> and only staff can see it.{path.reviewNote ? ` Reviewer note: ${path.reviewNote}` : ''}
            </p>
        );
    }
    return null;
}

export function LearningPathView({ slug, kind, initialPath }: { slug: string; kind: PathKind; initialPath?: LearningDetail | null }) {
    const router = useRouter();
    const { user } = useAuth();
    const query = useLearningPath(slug, initialPath);
    const tick = useTickNode();
    const enroll = useEnroll();
    const bookmark = useBookmarkPath();
    const goToSignIn = useGoToSignIn();
    const signInHref = useSignInHref();
    const path = query.data;

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [pending, setPending] = useState<Set<string>>(new Set());

    const ctx = useMemo(() => (path ? nodeContext(path) : null), [path]);
    // Signed out visitors see the first step as the place to start
    const nextNode = useMemo(() => {
        if (!path) return null;
        if (path.viewer) return path.viewer.next;
        return nextStep(path.modules, []);
    }, [path]);
    const nextId = nextNode?.id ?? null;

    // The step to do next is open, and follows the member as they tick
    useEffect(() => {
        if (nextId) setExpanded((prev) => (prev.has(nextId) ? prev : new Set(prev).add(nextId)));
    }, [nextId]);

    // A roadmap opened under the learning-paths address (or the other way round) moves to its own page
    useEffect(() => {
        if (path && path.kind !== kind) router.replace(pathHref(path.kind, path.slug));
    }, [path, kind, router]);

    const toggleExpanded = useCallback((id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    if (!path) {
        if (query.isError) {
            return (
                <PageFrame kind={kind}>
                    {isNotFound(query.error) ? (
                        <EmptyBlock icon={Layers} title={`This ${kind === 'roadmap' ? 'roadmap' : 'path'} is not available`} action={<Link href={kind === 'roadmap' ? '/roadmaps' : '/learning-paths'} className={btnPrimary}>Browse {kind === 'roadmap' ? 'roadmaps' : 'learning paths'}</Link>}>
                            It may have been unpublished or removed.
                        </EmptyBlock>
                    ) : <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this page" />}
                </PageFrame>
            );
        }
        return <PageFrame kind={kind}><DetailSkeleton /></PageFrame>;
    }
    if (path.kind !== kind) return <PageFrame kind={kind}><DetailSkeleton /></PageFrame>;

    const viewer = path.viewer;
    const progress = viewer?.progress ?? null;
    const completed = ctx?.completed ?? new Set<string>();
    const stages = groupByStage(path);
    const done = progress?.status === 'completed';
    const percent = progress?.percent ?? 0;
    const certificateId = viewer?.certificateId ?? progress?.certificateId ?? null;
    const requiredLeft = Math.max(0, (progress?.requiredCount ?? 0) - (progress?.requiredCompleted ?? 0));
    const prereqOpen = path.prerequisites.filter((p) => !p.completed);
    let counter = 0;

    const onTick = (nodeId: string, value: boolean) => {
        if (!user) {
            goToSignIn();
            return;
        }
        setPending((prev) => new Set(prev).add(nodeId));
        tick.mutate({ slug: path.slug, nodeId, done: value, title: path.title }, {
            onSettled: () => setPending((prev) => {
                const next = new Set(prev);
                next.delete(nodeId);
                return next;
            }),
        });
    };

    const goToNext = () => {
        if (!nextId) return;
        setExpanded((prev) => new Set(prev).add(nextId));
        window.setTimeout(() => {
            const el = document.getElementById(`node-${nextId}`);
            el?.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            el?.querySelector<HTMLButtonElement>('button[aria-expanded], button[aria-pressed]')?.focus({ preventScroll: true });
        }, 0);
    };

    return (
        <PageFrame kind={kind}>
            <StatusBanner path={path} />

            <header className="mb-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Chip tone={path.kind === 'roadmap' ? 'blue' : 'gray'}>{KIND_LABELS[path.kind]}</Chip>
                    <span className={`text-xs ${muted}`}>{label(CATEGORY_LABELS, path.category)}</span>
                </div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <h1 className="min-w-0 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">{path.title}</h1>
                    <div className="flex flex-wrap items-center gap-2">
                        {user && viewer && (
                            <BookmarkToggle
                                label={path.title}
                                bookmarked={viewer.bookmarked}
                                pending={bookmark.isPending}
                                onToggle={() => bookmark.mutate({ id: path.id, slug: path.slug, bookmarked: !viewer.bookmarked })}
                            />
                        )}
                        <ShareButton title={path.title} />
                        {viewer?.canEdit && <Link href={`/admin/learning-paths/${path.id}`} className={btnSecondary}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</Link>}
                    </div>
                </div>
                <p className="mt-3 max-w-3xl whitespace-pre-line text-base text-gray-700 dark:text-gray-300">{path.description || path.shortDescription}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <DifficultyChip difficulty={path.difficulty} />
                    {path.estimatedDuration && <Chip icon={Clock}>{path.estimatedDuration}</Chip>}
                    <Chip icon={Layers}>{plural(path.moduleCount || path.modules.length, 'step')}</Chip>
                    {path.enrollmentCount > 0 && <Chip icon={Users}>{plural(path.enrollmentCount, 'learner')}</Chip>}
                    {path.skills.slice(0, 6).map((s) => <Chip key={s}>{s}</Chip>)}
                </div>
            </header>

            {path.prerequisites.length > 0 && (
                <section aria-labelledby="prereq-heading" className={`${cardPad} mb-6`}>
                    <h2 id="prereq-heading" className="text-sm font-semibold text-gray-900 dark:text-white">
                        {path.kind === 'roadmap' ? 'Recommended first' : 'Finish these first'}
                    </h2>
                    <p className={`mt-0.5 text-xs ${muted}`}>
                        {path.kind === 'roadmap' ? 'This is advice. You can start any time.' : 'These paths are required before you can start this one.'}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                        {path.prerequisites.map((p) => (
                            <li key={p.id}>
                                <Link href={pathHref(p.kind, p.slug)} className={`inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-800 hover:border-orange-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 ${focusRing}`}>
                                    {p.completed ? <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden="true" /> : <Lock className="h-4 w-4 text-gray-500" aria-hidden="true" />}
                                    {p.title}
                                    <span className="sr-only">{p.completed ? ' (completed)' : viewer ? ' (not completed)' : ''}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section aria-label="Your progress" className="sticky top-16 z-20 -mx-4 mb-8 border-y border-gray-200 bg-gray-50/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-white sm:p-5 sm:backdrop-blur-none dark:border-neutral-800 dark:bg-black/90 sm:dark:bg-neutral-900/60" data-testid="progress-panel">
                {!user ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className={`text-sm ${muted}`}>Sign in to tick off steps and keep your progress on every device.</p>
                        <Link href={signInHref} className={btnPrimary}>Sign in to track progress</Link>
                    </div>
                ) : !viewer && !query.isError ? (
                    // Signed in, but the page still holds the public copy: the member's own state is on its way
                    <div role="status" aria-label="Loading your progress" className="space-y-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-9 w-48" /></div>
                ) : !viewer?.enrolled ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className={`text-sm ${muted}`}>
                            {prereqOpen.length > 0 && path.kind === 'path'
                                ? `Finish ${prereqOpen.map((p) => p.title).join(', ')} first.`
                                : 'Start when you are ready. Ticking your first step also joins.'}
                        </p>
                        <button type="button" className={btnPrimary} disabled={enroll.isPending} onClick={() => enroll.mutate({ slug: path.slug, title: path.title })}>
                            {enroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />} Start this {path.kind === 'roadmap' ? 'roadmap' : 'path'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 text-sm font-medium text-gray-900 dark:text-white">
                            <span aria-live="polite" data-testid="progress-text">{progress?.requiredCompleted ?? 0} of {progress?.requiredCount ?? 0} required steps · {percent}%</span>
                            {done && <Chip tone="green" icon={CheckCircle2}>Completed</Chip>}
                        </div>
                        <ProgressBar percent={percent} label={`Your progress in ${path.title}`} />
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            {done ? <CertificateButton path={path} certificateId={certificateId} /> : nextNode && (
                                <button type="button" className={btnPrimary} onClick={goToNext}>
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" /> Continue: {nextNode.title}
                                </button>
                            )}
                            {!done && requiredLeft > 0 && <span className={`text-xs ${muted}`}>{plural(requiredLeft, 'required step')} to go</span>}
                            {done && <span className={`text-xs ${muted}`}>Self-paced completion. Optional steps do not count.</span>}
                        </div>
                    </div>
                )}
            </section>

            {user && viewer?.enrolled === false && nextNode && (
                <section aria-labelledby="next-heading" className={`${card} mb-8 border-orange-300 p-5 dark:border-orange-500/40`} data-testid="next-card">
                    <h2 id="next-heading" className="text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-400">Where to start</h2>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{nextNode.title}</p>
                    {nextNode.description && <p className={`mt-1 line-clamp-2 text-sm ${muted}`}>{nextNode.description}</p>}
                </section>
            )}
            {user && viewer?.enrolled && !done && nextNode && (
                <section aria-labelledby="next-heading" className={`${card} mb-8 border-orange-300 p-5 dark:border-orange-500/40`} data-testid="next-card">
                    <h2 id="next-heading" className="text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-400">Your next step</h2>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{nextNode.title}</p>
                    <p className={`mt-1 text-sm ${muted}`}>
                        {nextNode.reason === 'blocked' && ctx
                            ? `Works best after: ${waitingTitles(nextNode, path, ctx.keyDone).join(', ')}. You can still do it now.`
                            : nextNode.reason === 'optional'
                                ? 'Every required step is done. This one is optional.'
                                : nextNode.description || 'Ready when you are.'}
                    </p>
                </section>
            )}

            {path.modules.length === 0 ? (
                <EmptyBlock icon={Layers} title="No steps yet">This {path.kind === 'roadmap' ? 'roadmap' : 'path'} has no steps. Check back soon.</EmptyBlock>
            ) : (
                <div className="space-y-10">
                    {stages.map((stage, si) => {
                        const doneInStage = stage.nodes.filter((n) => completed.has(n.id)).length;
                        return (
                            <section key={`${stage.title}-${si}`} aria-labelledby={`stage-${si}`}>
                                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                                    <h2 id={`stage-${si}`} className="text-xl font-semibold text-gray-900 dark:text-white">
                                        {stage.title ? <><span className={`mr-2 text-sm font-medium ${muted}`}>Stage {si + 1}</span>{stage.title}</> : 'Steps'}
                                    </h2>
                                    {viewer?.enrolled && <span className={`text-xs ${muted}`}>{doneInStage} of {stage.nodes.length} done</span>}
                                </div>
                                <ol className="list-none">
                                    {stage.nodes.map((node, ni) => {
                                        counter += 1;
                                        const state = ctx ? nodeState(node, { completed: ctx.completed, keyDone: ctx.keyDone, nextId: viewer ? ctx.nextId : nextId }) : 'open';
                                        return (
                                            <NodeItem
                                                key={node.id}
                                                node={node}
                                                number={counter}
                                                state={state}
                                                waitingFor={ctx ? waitingTitles(node, path, ctx.keyDone) : []}
                                                expanded={expanded.has(node.id)}
                                                pending={pending.has(node.id)}
                                                onToggleExpanded={() => toggleExpanded(node.id)}
                                                onTick={(value) => onTick(node.id, value)}
                                                last={ni === stage.nodes.length - 1}
                                            />
                                        );
                                    })}
                                </ol>
                            </section>
                        );
                    })}
                </div>
            )}

            <aside className={`${cardPad} mt-12 flex flex-wrap items-center justify-between gap-3`}>
                <div>
                    <p className="font-medium text-gray-900 dark:text-white">Know a resource that belongs here?</p>
                    <p className={`text-sm ${muted}`}>Suggest it for the library. Moderators review every link before it is shown.</p>
                </div>
                <Link href={`/resources/submit?from=${encodeURIComponent(path.slug)}`} className={btnSecondary}><Plus className="h-4 w-4" aria-hidden="true" /> Suggest a resource</Link>
            </aside>
        </PageFrame>
    );
}
