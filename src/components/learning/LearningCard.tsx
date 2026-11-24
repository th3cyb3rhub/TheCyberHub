'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, Layers, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBookmarkPath } from '@/hooks/queries/useLearningPaths';
import { CATEGORY_LABELS, label, pathHref, plural } from '@/lib/learning/display';
import type { LearningCard as Card } from '@/types/learning';
import { BookmarkToggle, Chip, DifficultyChip, ProgressBar } from './shared';
import { card, muted } from '@/components/events/styles';

/** One roadmap or learning path in the catalogue, with the viewer's own progress when they have one */
export function LearningCardView({ path, footer }: { path: Card; footer?: React.ReactNode }) {
    const { user } = useAuth();
    const bookmark = useBookmarkPath();
    const viewer = path.viewer;
    const href = pathHref(path.kind, path.slug);
    const done = viewer?.status === 'completed';

    return (
        <article className={`${card} group relative flex h-full flex-col p-5 transition-shadow focus-within:ring-2 focus-within:ring-orange-500 hover:shadow-md`} data-testid="learning-card">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold leading-snug text-gray-900 dark:text-white">
                        <Link href={href} className="rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">{path.title}</Link>
                    </h3>
                    <p className={`mt-0.5 text-xs ${muted}`}>{label(CATEGORY_LABELS, path.category)}</p>
                </div>
                {user && viewer && (
                    <BookmarkToggle
                        className="relative z-10 shrink-0"
                        label={path.title}
                        bookmarked={viewer.bookmarked}
                        pending={bookmark.isPending && bookmark.variables?.id === path.id}
                        onToggle={() => bookmark.mutate({ id: path.id, slug: path.slug, bookmarked: !viewer.bookmarked })}
                    />
                )}
            </div>

            <p className={`mt-3 line-clamp-3 text-sm ${muted}`}>{path.shortDescription}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <DifficultyChip difficulty={path.difficulty} />
                {path.estimatedDuration && <Chip icon={Clock}>{path.estimatedDuration}</Chip>}
                <Chip icon={Layers}>{plural(path.moduleCount, 'step')}</Chip>
                {path.enrollmentCount > 0 && <Chip icon={Users}>{plural(path.enrollmentCount, 'learner')}</Chip>}
                {path.isFeatured && <Chip tone="orange">Featured</Chip>}
            </div>

            <div className="mt-auto pt-4">
                {viewer?.enrolled ? (
                    <div data-testid="card-progress">
                        <div className="mb-1 flex items-center justify-between text-xs font-medium text-gray-700 dark:text-gray-300">
                            <span className="inline-flex items-center gap-1">{done && <CheckCircle2 className="h-3.5 w-3.5 text-green-700 dark:text-green-400" aria-hidden="true" />}{done ? 'Completed' : 'In progress'}</span>
                            <span>{viewer.percent}%</span>
                        </div>
                        <ProgressBar percent={viewer.percent} label={`Your progress in ${path.title}`} size="sm" />
                    </div>
                ) : null}
                {footer}
            </div>
        </article>
    );
}
