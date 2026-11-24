'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
    AlertTriangle, ArrowLeft, Briefcase, CalendarClock, CalendarDays, CheckCircle2, GraduationCap, ListChecks, Lock, Sparkles,
    Undo2, Users,
} from 'lucide-react';
import { btnPrimary, btnSecondary, card, cardPad, chip, focusRing, muted, pageBg } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useInternship } from '@/hooks/queries/useInternships';
import { useNow } from '@/lib/events/clock';
import { applyView, spotsInfo, TYPE_LABELS } from '@/lib/internships/display';
import { canWithdraw } from '@/lib/internships/review';
import { ApiError } from '@/lib/api';
import type { CohortDetail, ViewerApplication } from '@/types/internship';
import { ApplicationProgress } from './ApplicationTimeline';
import { ErrorState } from './ListStates';
import { ShowcaseList } from './PastCohorts';
import { ApplicationStatusBadge, CohortStatusBadge } from './StatusBadges';
import { ViewerTime } from './ViewerTime';
import { WithdrawDialog } from './WithdrawDialog';

const DAY = 86_400_000;

function Fact({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-neutral-800">
            <Icon className="mb-2 h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" />
            <dt className={`text-xs ${muted}`}>{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">{children}</dd>
        </div>
    );
}

function BulletSection({ id, title, items, icon: Icon }: { id: string; title: string; items: string[]; icon: React.ElementType }) {
    if (items.length === 0) return null;
    return (
        <section aria-labelledby={id} className={cardPad}>
            <h2 id={id} className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
            <ul className="space-y-2.5">
                {items.map((item, i) => (
                    <li key={`${i}-${item}`} className="flex items-start gap-3 text-sm text-gray-800 dark:text-gray-200">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** The panel that says whether and how to apply. One state at a time, never a dead button. */
function ApplyPanel({ cohort, onWithdraw }: { cohort: CohortDetail; onWithdraw: (app: ViewerApplication) => void }) {
    const view = applyView(cohort);
    const mine = cohort.viewer?.userApplication ?? null;
    const applyHref = `/internships/${cohort._id}/apply`;

    if (view.state === 'applied' && mine) {
        return (
            <section aria-labelledby="your-application" className="rounded-2xl border border-orange-300 bg-orange-50 p-5 dark:border-orange-500/30 dark:bg-orange-500/5" data-testid="your-application" data-state="applied">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 id="your-application" tabIndex={-1} className="rounded text-lg font-semibold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-white">Your application</h2>
                        <p className={`text-sm ${muted}`}>Sent <ViewerTime iso={mine.appliedAt} kind="stamp" /></p>
                    </div>
                    <ApplicationStatusBadge status={mine.status} />
                </div>
                <ApplicationProgress status={mine.status} />
                {mine.status === 'withdrawn' && <p className={`mt-1 text-sm ${muted}`}>You withdrew this application. It cannot be sent again.</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                    <Link href="/internships/applications" className={btnSecondary}><ListChecks className="h-4 w-4" aria-hidden="true" /> See my timeline</Link>
                    {canWithdraw(mine.status) && (
                        <button type="button" className={btnSecondary} onClick={() => onWithdraw(mine)}><Undo2 className="h-4 w-4" aria-hidden="true" /> Withdraw</button>
                    )}
                </div>
            </section>
        );
    }

    return (
        <section aria-label="Apply" className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-orange-300 bg-orange-50 p-5 dark:border-orange-500/30 dark:bg-orange-500/5 sm:flex-row sm:items-center" data-testid="apply-panel" data-state={view.state}>
            <div>
                <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                    {view.state === 'closed' || view.state === 'full' ? <Lock className="h-5 w-5" aria-hidden="true" /> : <Sparkles className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" />}
                    {view.state === 'closed' ? 'Applications closed' : view.state === 'full' ? 'This program is full' : 'Ready to join?'}
                </h2>
                <p className={`text-sm ${muted}`}>
                    {view.reason ?? (<>Apply by <ViewerTime iso={cohort.applicationDeadline} kind="moment" />.</>)}
                </p>
            </div>
            {view.state === 'can-apply' && <Link href={applyHref} className={btnPrimary}>Apply now</Link>}
            {view.state === 'anonymous' && <Link href={`/auth?redirect=${encodeURIComponent(applyHref)}`} className={btnPrimary}>Sign in to apply</Link>}
        </section>
    );
}

/** The viewer's own answer is on its way: a neutral panel, so nobody sees a state that is not theirs */
function ApplyPending() {
    return (
        <section aria-label="Apply" aria-busy="true" role="status" className="rounded-2xl border border-gray-200 p-5 dark:border-neutral-800" data-testid="apply-pending">
            <span className="sr-only">Checking your application status</span>
            <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" aria-hidden="true" />
            <div className="mt-3 h-4 w-64 max-w-full animate-pulse rounded bg-gray-200 dark:bg-neutral-800" aria-hidden="true" />
        </section>
    );
}

/** The signed-in answer did not come: say so and offer to ask again, instead of a panel that may be wrong */
function ApplyRetry({ onRetry }: { onRetry: () => void }) {
    return (
        <section aria-label="Apply" className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10 sm:flex-row sm:items-center" data-testid="apply-retry">
            <div>
                <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">We could not check your application</h2>
                <p className={`text-sm ${muted}`}>Try again to see whether you can apply.</p>
            </div>
            <button type="button" className={btnSecondary} onClick={onRetry}>Try again</button>
        </section>
    );
}

function Deadline({ cohort }: { cohort: CohortDetail }) {
    const now = useNow(60_000);
    if (!cohort.applicationsOpen || !now) return null;
    const left = new Date(cohort.applicationDeadline).getTime() - now.getTime();
    if (left <= 0 || left > 7 * DAY) return null;
    const days = Math.floor(left / DAY);
    const hours = Math.max(1, Math.floor(left / 3_600_000));
    return (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" data-testid="deadline-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {days >= 1 ? `${days} ${days === 1 ? 'day' : 'days'} left to apply.` : `Only ${hours} ${hours === 1 ? 'hour' : 'hours'} left to apply.`}
        </p>
    );
}

export function CohortDetailView({ id, initialCohort = null }: { id: string; initialCohort?: CohortDetail | null }) {
    const { user } = useAuth();
    const query = useInternship(id, initialCohort);
    const [withdrawing, setWithdrawing] = useState<ViewerApplication | null>(null);

    // A 404 from the API beats anything cached: the program was hidden after the page was cached
    const missing = query.error instanceof ApiError && query.error.status === 404;
    const cohort = missing ? null : (query.data ?? initialCohort);

    if (!cohort) {
        if (!missing && (query.isLoading || query.isPending)) {
            return (
                <div className={pageBg}>
                    <div className="mx-auto max-w-4xl space-y-4 px-4 pb-16 pt-24 sm:px-6" role="status" aria-label="Loading program">
                        <div className="h-6 w-40 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                        <div className={`${card} h-64 animate-pulse`} />
                    </div>
                </div>
            );
        }
        return (
            <div className={pageBg}>
                <div className="mx-auto max-w-2xl px-4 pb-16 pt-28 text-center sm:px-6">
                    {missing ? (
                        <>
                            <GraduationCap className="mx-auto mb-4 h-10 w-10 text-gray-500" aria-hidden="true" />
                            <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">This program is not available</h1>
                            <p className={`mb-6 text-sm ${muted}`}>It may have been removed, or it is not published yet.</p>
                            <Link href="/internships" className={btnSecondary}>Back to internships</Link>
                        </>
                    ) : (
                        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Could not load this program" />
                    )}
                </div>
            </div>
        );
    }

    // What the server rendered has no viewer. A signed-in member waits for their own answer: until
    // then (or when it failed) the apply panel is neutral, never the visitor's.
    const viewerKnown = !user || (!!query.data && !query.isPlaceholderData && query.data.viewer !== null);

    const spots = spotsInfo(cohort);
    const syllabus = [...cohort.syllabus].sort((a, b) => a.week - b.week);

    return (
        <div className={pageBg}>
            <div className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6">
                <Link href="/internships" className={`mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${focusRing}`}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All programs
                </Link>

                <header className={`${cardPad} mb-6 !p-6 sm:!p-8`}>
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <CohortStatusBadge status={cohort.status} />
                        <span className={`${chip} bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300`}>{TYPE_LABELS[cohort.type] ?? cohort.type}</span>
                        {cohort.viewer?.userApplication && <ApplicationStatusBadge status={cohort.viewer.userApplication.status} />}
                    </div>
                    <h1 className="mb-4 break-words text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">{cohort.title}</h1>
                    <p className="mb-6 whitespace-pre-wrap break-words text-base text-gray-700 dark:text-gray-300">{cohort.description}</p>

                    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Fact icon={CalendarDays} label="Starts"><ViewerTime iso={cohort.startDate} /></Fact>
                        <Fact icon={CalendarDays} label="Ends"><ViewerTime iso={cohort.endDate} /></Fact>
                        <Fact icon={CalendarClock} label="Apply by"><ViewerTime iso={cohort.applicationDeadline} kind="moment" /></Fact>
                        <Fact icon={Users} label="Seats">
                            {spots.unlimited ? 'No limit' : (<><span className={spots.full ? 'text-red-800 dark:text-red-300' : ''}>{spots.label}</span></>)}
                        </Fact>
                    </dl>

                    {cohort.technologies.length > 0 && (
                        <ul className="mt-5 flex flex-wrap gap-1.5" aria-label="Technologies">
                            {cohort.technologies.map((t) => <li key={t} className={`${chip} bg-gray-100 text-gray-800 dark:bg-neutral-800 dark:text-gray-200`}>{t}</li>)}
                        </ul>
                    )}
                </header>

                <div className="space-y-6">
                    <Deadline cohort={cohort} />
                    {cohort.status !== 'completed' && cohort.status !== 'draft' && (
                        viewerKnown
                            ? <ApplyPanel cohort={cohort} onWithdraw={setWithdrawing} />
                            : query.isFetching ? <ApplyPending /> : <ApplyRetry onRetry={() => void query.refetch()} />
                    )}
                    {cohort.status === 'draft' && <p role="status" className={`${cardPad} text-sm ${muted}`}>This program is a draft. Only staff can see it.</p>}

                    <BulletSection id="requirements" title="Requirements" items={cohort.requirements} icon={CheckCircle2} />
                    <BulletSection id="responsibilities" title="What you will do" items={cohort.responsibilities} icon={Briefcase} />
                    <BulletSection id="benefits" title="What you will gain" items={cohort.benefits} icon={Sparkles} />

                    {syllabus.length > 0 && (
                        <section aria-labelledby="syllabus" className={cardPad}>
                            <h2 id="syllabus" className="mb-5 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white"><GraduationCap className="h-5 w-5 text-orange-700 dark:text-orange-400" aria-hidden="true" /> Curriculum</h2>
                            <ol className="space-y-4">
                                {syllabus.map((week) => (
                                    <li key={week.week} className="rounded-xl border border-gray-200 p-4 dark:border-neutral-800" data-testid="syllabus-week">
                                        <h3 className="font-semibold text-gray-900 dark:text-white">Week {week.week}: {week.title}</h3>
                                        {week.description && <p className={`mt-1 whitespace-pre-wrap text-sm ${muted}`}>{week.description}</p>}
                                        {week.topics.length > 0 && (
                                            <div className="mt-3">
                                                <p className={`mb-1 text-xs font-medium uppercase tracking-wide ${muted}`}>Topics</p>
                                                <ul className="flex flex-wrap gap-1.5">{week.topics.map((t, i) => <li key={`${i}-${t}`} className={`${chip} bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300`}>{t}</li>)}</ul>
                                            </div>
                                        )}
                                        {week.deliverables.length > 0 && (
                                            <div className="mt-3">
                                                <p className={`mb-1 text-xs font-medium uppercase tracking-wide ${muted}`}>Deliverables</p>
                                                <ul className="space-y-1">{week.deliverables.map((d, i) => <li key={`${i}-${d}`} className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" />{d}</li>)}</ul>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {cohort.mentors.length > 0 && (
                        <section aria-labelledby="mentors" className={cardPad}>
                            <h2 id="mentors" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Mentors</h2>
                            <ul className="flex flex-wrap gap-3">
                                {cohort.mentors.map((m) => (
                                    <li key={m._id}>
                                        <Link href={`/user/${encodeURIComponent(m.username)}`} className={`flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800 ${focusRing}`}>
                                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-900 dark:bg-orange-500/15 dark:text-orange-300" aria-hidden="true">{m.name.charAt(0).toUpperCase()}</span>
                                            <span><span className="block text-sm font-medium text-gray-900 dark:text-white">{m.name}</span><span className={`block text-xs ${muted}`}>@{m.username}</span></span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {cohort.showcaseProjects.length > 0 && (
                        <section aria-labelledby="showcase" className={cardPad}>
                            <h2 id="showcase" className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">What this cohort built</h2>
                            <ShowcaseList projects={cohort.showcaseProjects} />
                        </section>
                    )}
                </div>
            </div>

            {withdrawing && (
                <WithdrawDialog
                    open
                    onClose={() => setWithdrawing(null)}
                    statusHeadingId="your-application"
                    applicationId={withdrawing._id}
                    cohortId={cohort._id}
                    cohortTitle={cohort.title}
                    accepted={withdrawing.status === 'accepted'}
                />
            )}
        </div>
    );
}
