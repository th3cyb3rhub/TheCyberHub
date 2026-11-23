'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Filter, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useActivationFunnel } from '@/hooks/queries/useAdminMetrics';
import { ACTIVATION_WEEK_CHOICES } from '@/lib/api/adminMetrics';
import { FUNNEL_STEPS, formatPercent, percentOf, totalWeeks } from '@/lib/activationFunnel';

const AnalyticsChart = dynamic(() => import('@/components/charts/AnalyticsChart'), { ssr: false });

const DEFAULT_WEEKS = 12;

export default function ActivationFunnelPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [weeks, setWeeks] = useState<number>(DEFAULT_WEEKS);

    const allowed = !!user && ['admin', 'owner'].includes(user.role);
    const { data, isLoading, isError, refetch, isFetching } = useActivationFunnel(weeks, allowed);

    useEffect(() => {
        if (authLoading) return;
        if (!user) router.replace('/auth?redirect=/admin/activation');
        else if (!allowed) router.replace(user.role === 'moderator' ? '/admin' : '/');
    }, [authLoading, user, allowed, router]);

    if (authLoading || !allowed) {
        return (
            <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center" role="status" aria-label="Loading">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" aria-hidden="true" />
            </div>
        );
    }

    const rows = data?.weeks ?? [];
    const total = totalWeeks(rows);
    const hasSignups = total.signups > 0;
    const chartData = rows.map((w) => ({ _id: w.week, count: w.signups }));

    return (
        <div className="min-h-screen bg-[var(--color-background)] pt-24 pb-12 px-4">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8">
                    <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 mb-4 transition-colors">
                        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Dashboard
                    </Link>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center">
                                <Filter className="w-5 h-5 text-white" aria-hidden="true" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activation funnel</h1>
                                <p className="text-sm text-gray-600 dark:text-gray-400">What each week of new members went on to do.</p>
                            </div>
                        </div>
                        <div className="flex gap-2" role="group" aria-label="Weeks to show">
                            {ACTIVATION_WEEK_CHOICES.map((choice) => (
                                <button
                                    key={choice}
                                    type="button"
                                    aria-pressed={weeks === choice}
                                    onClick={() => setWeeks(choice)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${weeks === choice
                                        ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                                        : 'border-white/10 bg-white/5 text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                                        }`}
                                >
                                    {choice} weeks
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-20" role="status" aria-label="Loading the funnel">
                        <Loader2 className="w-8 h-8 animate-spin text-orange-500" aria-hidden="true" />
                    </div>
                ) : isError ? (
                    <div className="text-center py-20">
                        <p className="text-gray-600 dark:text-gray-400 mb-3">The activation funnel could not be loaded.</p>
                        <button onClick={() => refetch()} className="px-4 py-2 bg-white/10 text-gray-900 dark:text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">
                            Try again
                        </button>
                    </div>
                ) : !hasSignups ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] text-center py-20 px-4">
                        <p className="text-gray-700 dark:text-gray-300 font-medium">No sign-ups in the last {weeks} weeks</p>
                        <p className="text-gray-600 dark:text-gray-500 text-sm mt-1">The funnel fills in as new members join. Try a longer range.</p>
                    </div>
                ) : (
                    <div className={`space-y-8 transition-opacity ${isFetching ? 'opacity-60' : ''}`} aria-busy={isFetching}>
                        <section aria-labelledby="funnel-total" className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-5">
                                <h2 id="funnel-total" className="text-lg font-semibold text-gray-900 dark:text-white">Last {weeks} weeks combined</h2>
                                <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{total.signups.toLocaleString()} sign-ups</span>
                            </div>
                            <ul className="space-y-3">
                                {FUNNEL_STEPS.map((step) => {
                                    const value = total[step.key];
                                    const share = percentOf(value, total.signups) ?? 0;
                                    return (
                                        <li key={step.key}>
                                            <div className="flex items-center justify-between text-sm mb-1 gap-3">
                                                <span className="text-gray-700 dark:text-gray-300">{step.label}</span>
                                                <span className="text-gray-600 dark:text-gray-500 flex-shrink-0">
                                                    {value.toLocaleString()} <span className="text-orange-400 font-medium">({formatPercent(value, total.signups)})</span>
                                                </span>
                                            </div>
                                            <div
                                                className="h-2 bg-white/5 rounded-full overflow-hidden"
                                                role="progressbar"
                                                aria-label={`${step.label}: ${formatPercent(value, total.signups)} of sign-ups`}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={Math.min(100, share)}
                                            >
                                                <div className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full" style={{ width: `${Math.min(100, share)}%` }} />
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>

                        <section aria-labelledby="funnel-signups" className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                            <h2 id="funnel-signups" className="text-lg font-semibold text-gray-900 dark:text-white">Sign-ups per week</h2>
                            <AnalyticsChart data={chartData} />
                        </section>

                        <section aria-labelledby="funnel-table" className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                            <h2 id="funnel-table" className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Week by week</h2>
                            <p className="text-xs text-gray-600 dark:text-gray-500 mb-4">
                                Each cell is how many members of that sign-up week reached the step, and their share of the week&apos;s sign-ups.
                                Return rates for recent weeks are still filling in.
                            </p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead>
                                        <tr className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-500">
                                            <th scope="col" className="sticky left-0 z-10 bg-[var(--color-background)] py-2 pr-4 font-medium">Week</th>
                                            {FUNNEL_STEPS.map((step) => (
                                                <th key={step.key} scope="col" className="py-2 px-3 font-medium text-right whitespace-nowrap">{step.short}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {[...rows].reverse().map((w) => (
                                            <tr key={w.week}>
                                                <th scope="row" className="sticky left-0 z-10 bg-[var(--color-background)] py-2 pr-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">{w.week}</th>
                                                {FUNNEL_STEPS.map((step) => (
                                                    <td key={step.key} className="py-2 px-3 text-right whitespace-nowrap">
                                                        <span className="text-gray-900 dark:text-white">{w[step.key].toLocaleString()}</span>
                                                        {step.key !== 'signups' && (
                                                            <span className="block text-xs text-gray-600 dark:text-gray-500">{formatPercent(w[step.key], w.signups)}</span>
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}
