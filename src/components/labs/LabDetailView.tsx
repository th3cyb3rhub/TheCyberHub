'use client';

import Link from 'next/link';
import { BookOpen, FlaskConical } from 'lucide-react';
import { btnSecondary, card, cardPad, muted, pageBg } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useLab } from '@/hooks/queries/useLabs';
import { ApiError } from '@/lib/api';
import type { LabDetail } from '@/types/lab';
import { FlagForm } from './FlagForm';
import { LabActionPanel } from './LabActionPanel';
import { LabHeader } from './LabHeader';
import { LabHints } from './LabHints';
import { LabMarkdown } from './LabMarkdown';
import { LabTarget, LabFiles } from './LabResources';
import { LabTopSolvers } from './LeaderboardViews';
import { ErrorState } from './ListStates';

function Shell({ children }: { children: React.ReactNode }) {
    return <div className={pageBg}><div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6">{children}</div></div>;
}

/**
 * One lab. The server renders the public copy (no viewer); a signed-in member's own answer, with
 * the viewer block, replaces it. A visitor reads everything and is asked to sign in to act.
 */
export function LabDetailView({ slug, initialLab, initialUpdatedAt }: { slug: string; initialLab: LabDetail | null; initialUpdatedAt?: number }) {
    const { user, loading } = useAuth();
    const query = useLab(slug, initialLab, initialUpdatedAt);
    const lab = query.data;
    const signedIn = !!user;

    if (!lab) {
        if (loading || query.isLoading || query.isPending) {
            return (
                <div className={pageBg}>
                    <div className="mx-auto max-w-6xl space-y-4 px-4 pb-16 pt-24 sm:px-6" role="status" aria-label="Loading lab">
                        <div className="h-6 w-32 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                        <div className={`${card} h-56 animate-pulse`} />
                        <div className={`${card} h-72 animate-pulse`} />
                    </div>
                </div>
            );
        }
        const missing = query.error instanceof ApiError && query.error.status === 404;
        return (
            <div className={pageBg}>
                <div className="mx-auto max-w-2xl px-4 pb-16 pt-28 text-center sm:px-6">
                    {missing ? (
                        <>
                            <FlaskConical className="mx-auto mb-4 h-10 w-10 text-gray-500" aria-hidden="true" />
                            <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">This lab is not available</h1>
                            <p className={`mb-6 text-sm ${muted}`}>It may have been removed, or it is not published yet.</p>
                            <Link href="/labs" className={btnSecondary}>Back to labs</Link>
                        </>
                    ) : (
                        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this lab" />
                    )}
                </div>
            </div>
        );
    }

    // What the server rendered has no viewer. A signed-in member waits for their own answer: until
    // then the panel is neutral, never the visitor's.
    const viewerKnown = !user || (!query.isPlaceholderData && lab.viewer !== null);
    // Their answer is still loading (not failed, not empty): panels stay neutral and offer no recovery yet
    const viewerLoading = !!user && query.isPlaceholderData;
    const viewer = viewerKnown ? lab.viewer : null;
    const canSubmit = signedIn && viewer?.myStatus !== 'not-started' && viewer !== null;

    return (
        <Shell>
            <LabHeader lab={lab} signedIn={signedIn} />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_auto_1fr] lg:items-start">
                <div className="lg:col-start-2 lg:row-start-1">
                    <LabActionPanel lab={lab} signedIn={signedIn} viewerKnown={viewerKnown} viewerLoading={viewerLoading} onRetry={() => void query.refetch()} />
                </div>

                <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-3 lg:row-start-1">
                    <section aria-labelledby="lab-instructions" className={cardPad}>
                        <h2 id="lab-instructions" className="mb-3 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
                            <BookOpen className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Instructions
                        </h2>
                        {lab.instructions.trim() ? <LabMarkdown content={lab.instructions} /> : <p className={`text-sm ${muted}`}>The author has not written instructions for this lab. Use the description and the files.</p>}
                    </section>
                    <LabTarget url={lab.labUrl} />
                    <LabFiles files={lab.files} />
                    <LabHints lab={viewerKnown ? lab : { ...lab, viewer: null }} signedIn={signedIn} loading={viewerLoading} />
                </div>

                {canSubmit && viewer && (
                    <div className="lg:col-start-2 lg:row-start-2">
                        {/* Keyed by lab so a flag never carries over to another lab */}
                        <FlagForm key={lab._id} lab={lab} onUnlocked={() => void query.refetch()} />
                    </div>
                )}

                <div className="lg:col-start-2 lg:row-start-3">
                    <LabTopSolvers slug={lab.slug} />
                </div>
            </div>
        </Shell>
    );
}
