'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, ChevronRight, Map } from 'lucide-react';
import { useLearningSummary } from '@/hooks/queries/useLearningPaths';
import { pathHref } from '@/lib/learning/display';
import { learningErrorMessage } from '@/lib/learning/errors';
import { Skeleton } from '@/components/ui/skeleton';

const row = 'group flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-all';

/** The dashboard block: the roadmaps and paths the member is in the middle of, with the next step of each. */
export function DashboardLearning({ fallback }: { fallback: React.ReactNode }) {
    const summary = useLearningSummary();
    const items = summary.data?.continue ?? [];

    return (
        <div data-testid="dashboard-learning">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-blue-500" aria-hidden="true" />
                Continue Learning
            </h2>
            {summary.isLoading ? (
                <div className="space-y-3" role="status" aria-label="Loading your learning progress">
                    {[0, 1].map((i) => <Skeleton key={i} className="h-[76px] w-full rounded-xl" />)}
                </div>
            ) : summary.isError ? (
                <p role="alert" className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    {learningErrorMessage(summary.error)}{' '}
                    <button type="button" onClick={() => void summary.refetch()} className="font-medium underline">Try again</button>
                </p>
            ) : items.length > 0 ? (
                <ul className="space-y-3 list-none">
                    {items.slice(0, 3).map(({ path, progress, next }) => (
                        <li key={path.id}>
                            <Link href={pathHref(path.kind, path.slug)} className={row}>
                                <div className="w-10 h-10 rounded-lg bg-white/5 flex shrink-0 items-center justify-center group-hover:bg-orange-500/10 transition-colors">
                                    <Map className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors" aria-hidden="true" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-medium truncate group-hover:text-orange-400 transition-colors">{path.title}</p>
                                    <div className="mt-1.5 flex items-center gap-2">
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Progress in ${path.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                                            <div className="h-full rounded-full bg-orange-500" style={{ width: `${progress.percent}%` }} />
                                        </div>
                                        <span className="w-9 text-right text-xs text-gray-400">{progress.percent}%</span>
                                    </div>
                                    {next && <p className="mt-1 flex items-center gap-1 text-sm text-gray-400 truncate"><ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" /><span className="sr-only">Next step: </span><span className="truncate">{next.title}</span></p>}
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-orange-500 transition-colors" aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <Link href="/roadmaps" className={`${row} mb-3`} data-testid="dashboard-learning-empty">
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex shrink-0 items-center justify-center group-hover:bg-orange-500/10 transition-colors">
                        <Map className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-medium group-hover:text-orange-400 transition-colors">Start a roadmap</p>
                        <p className="text-sm text-gray-400">Pick a path, tick off steps and earn a certificate</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-orange-500 transition-colors" aria-hidden="true" />
                </Link>
            )}
            {items.length > 0 && <Link href="/roadmaps?tab=mine" className="mb-3 inline-flex items-center gap-1 text-sm text-orange-400 hover:underline">See all your progress <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>}
            <div className="space-y-3">{fallback}</div>
        </div>
    );
}
