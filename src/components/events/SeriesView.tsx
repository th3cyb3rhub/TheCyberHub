'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CalendarX, CheckCircle2, Clock, PauseCircle, PlayCircle, RefreshCw, Repeat } from 'lucide-react';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { useAuth } from '@/context/AuthContext';
import { useEventSeries } from '@/hooks/queries/useEventSeries';
import { eventErrorMessage } from '@/lib/events/errors';
import { CATEGORY_LABELS, FORMAT_LABELS } from '@/lib/events/form';
import { describeRecurrence, formatDuration, SERIES_STATUS_LABELS } from '@/lib/events/series';
import { isModeratorRole } from '@/lib/roles';
import type { Series, SeriesStatus } from '@/types/event';
import { EventDescription } from './EventDescription';
import { EventTimes } from './EventTimes';
import { SeriesManagePanel } from './SeriesManagePanel';
import { StatusBadge } from './StatusBadge';
import { btnPrimary, btnSecondary, cardPad, chip, muted, pageBg } from './styles';

const STATUS_STYLE: Record<SeriesStatus, { className: string; icon: React.ElementType }> = {
    active: { className: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300', icon: PlayCircle },
    paused: { className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300', icon: PauseCircle },
    ended: { className: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300', icon: CheckCircle2 },
};

export function SeriesStatusChip({ status }: { status: SeriesStatus }) {
    const { className, icon: Icon } = STATUS_STYLE[status];
    return <span className={`${chip} ${className}`} data-status={status}><Icon className="h-3 w-3" aria-hidden="true" /> {SERIES_STATUS_LABELS[status]}</span>;
}

export function SeriesSkeleton() {
    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6" role="status" aria-label="Loading the series">
                <div className="mb-4 h-4 w-48 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="mb-3 h-9 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="mb-8 h-5 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-neutral-800" />
            </div>
        </div>
    );
}

function Occurrences({ series }: { series: Series }) {
    const items = series.nextOccurrences;
    return (
        <section aria-labelledby="next-heading" className={cardPad}>
            <h2 id="next-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">Next dates</h2>
            {items.length === 0 ? (
                <p className={`text-sm ${muted}`} data-testid="no-occurrences">
                    {series.status === 'ended' ? 'This series has ended, so no more dates are planned.'
                        : series.status === 'paused' ? 'This series is paused. New dates appear when it runs again.'
                            : 'No upcoming dates are published yet. New ones appear a little before they happen.'}
                </p>
            ) : (
                <ol className="space-y-3" data-testid="occurrences">
                    {items.map((item) => (
                        <li key={item.id} className="rounded-xl border border-gray-200 p-3 dark:border-neutral-800">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <Link href={`/events/${item.slug}`} className="min-w-0 rounded text-sm font-semibold text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-white">
                                    {item.title}
                                </Link>
                                {(item.status === 'live' || item.status === 'cancelled') && <StatusBadge status={item.status} />}
                            </div>
                            <div className="mt-1"><EventTimes event={item} compact /></div>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

export function SeriesView({ id, initialSeries }: { id: string; initialSeries?: Series | null }) {
    const { user } = useAuth();
    const query = useEventSeries(id, initialSeries);
    const series = query.data;

    if (!series) {
        if (query.isError) {
            const missing = (query.error as { status?: number } | null)?.status === 404;
            return (
                <div className={pageBg}>
                    <div className="mx-auto flex max-w-xl flex-col items-center px-4 pb-16 pt-32 text-center">
                        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-500/10">
                            {missing ? <CalendarX className="h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" /> : <AlertTriangle className="h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" />}
                        </div>
                        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">{missing ? 'Series not found' : 'Could not load this series'}</h1>
                        <p className={`mb-6 text-sm ${muted}`} role="alert">{missing ? 'It may have been removed.' : eventErrorMessage(query.error, 'Please try again.')}</p>
                        <div className="flex gap-3">
                            {!missing && <button type="button" className={btnPrimary} onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>}
                            <Link href="/events" className={btnSecondary}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All events</Link>
                        </div>
                    </div>
                </div>
            );
        }
        return <SeriesSkeleton />;
    }

    const canManage = !!user && isModeratorRole(user.role) && !!series.counts;
    const r = series.recurrence;

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6">
                <Breadcrumbs items={[{ label: 'Events', href: '/events' }, { label: series.title }]} />

                <header className="mb-8">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <SeriesStatusChip status={series.status} />
                        <span className={`${chip} bg-purple-100 text-purple-900 dark:bg-purple-500/15 dark:text-purple-300`}><Repeat className="h-3 w-3" aria-hidden="true" /> Recurring</span>
                        <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{CATEGORY_LABELS[series.category] ?? series.category}</span>
                        <span className={`${chip} bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300`}>{FORMAT_LABELS[series.format] ?? series.format}</span>
                    </div>
                    <h1 className="text-3xl font-bold leading-tight text-gray-900 dark:text-white sm:text-4xl">{series.title}</h1>
                    {series.shortDescription && <p className={`mt-2 max-w-3xl text-lg ${muted}`}>{series.shortDescription}</p>}
                    <p className="mt-3 flex items-start gap-2 text-base font-medium text-gray-900 dark:text-white" data-testid="series-rule">
                        <Clock className="mt-1 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                        <span>{describeRecurrence(r)}</span>
                    </p>
                    <p className={`mt-1 text-sm ${muted}`}>Each date lasts {formatDuration(r.durationMinutes)}. Hosted by <span className="font-medium text-gray-900 dark:text-white">{series.organizer}</span>.</p>
                </header>

                <div className="space-y-6">
                    {canManage && <SeriesManagePanel series={series} />}
                    <Occurrences series={series} />
                    {series.description && (
                        <section aria-labelledby="about-heading" className={cardPad}>
                            <h2 id="about-heading" className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">About this series</h2>
                            <EventDescription content={series.description} />
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}
