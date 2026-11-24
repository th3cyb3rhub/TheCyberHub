'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, GraduationCap, MailWarning, PauseCircle, PlayCircle, ShieldAlert, Trophy } from 'lucide-react';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import {
    useEligibility, useMyMentorProfile, useRegisterMentor, useToggleMentorPause, useUpdateMentorProfile,
} from '@/hooks/queries/useMentorship';
import { spotsLabel } from '@/lib/mentorship/display';
import { MentorApplicationForm } from './MentorApplicationForm';
import { MentorshipNav } from './MentorshipNav';
import { EmptyBlock, ErrorState, MentorStatusChip, RowSkeleton } from './shared';
import { btnPrimary, btnSecondary, cardPad, muted } from './styles';

function PointsProgress({ points, required }: { points: number; required: number }) {
    const pct = Math.min(100, Math.round((points / Math.max(1, required)) * 100));
    return (
        <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm text-gray-800 dark:text-gray-200"><span>{points} points</span><span>{required} needed</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800" role="progressbar" aria-valuemin={0} aria-valuemax={required} aria-valuenow={Math.min(points, required)} aria-label="Points towards applying as a mentor">
                <div className="h-full rounded-full bg-orange-700" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export function BecomeMentorView() {
    const { ready } = useRequireLogin('/mentorship/become-mentor');
    const router = useRouter();
    const eligibility = useEligibility(ready);
    const register = useRegisterMentor({ inline: true });

    if (!ready) return <FullPageSpinner />;
    const e = eligibility.data;

    return (
        <PageShell title="Become a mentor" subtitle="Share what you know with someone starting out. The team reviews every application." backHref="/mentorship" backLabel="All mentors">
            <MentorshipNav />
            {eligibility.isLoading ? <RowSkeleton count={2} label="Checking your eligibility" /> : eligibility.isError ? (
                <ErrorState error={eligibility.error} onRetry={() => eligibility.refetch()} title="Could not check your eligibility" />
            ) : e && !e.eligible ? (
                e.reason === 'ALREADY_APPLIED' ? (
                    <EmptyBlock icon={CheckCircle2} title="You already applied" action={<Link href="/mentorship/my-profile" className={btnPrimary}>See my mentor profile</Link>}>
                        Your application is {e.profileStatus === 'approved' ? 'approved' : e.profileStatus === 'pending' ? 'waiting for review' : e.profileStatus ?? 'on file'}.
                    </EmptyBlock>
                ) : e.reason === 'EMAIL_NOT_VERIFIED' ? (
                    <div className={cardPad} data-testid="eligibility-blocked" data-reason={e.reason}>
                        <MailWarning className="mb-3 h-7 w-7 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Verify your email first</h2>
                        <p className={`mt-1 text-sm ${muted}`}>Mentors and mentees contact each other through the platform, so a verified email address is required to apply.</p>
                    </div>
                ) : (
                    <div className={cardPad} data-testid="eligibility-blocked" data-reason={e.reason}>
                        <Trophy className="mb-3 h-7 w-7 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Earn a few more points to apply</h2>
                        <p className={`mt-1 text-sm ${muted}`}>Mentors need {e.requiredPoints} points, which you earn by taking part: forum answers, challenges, events and blog posts. Experienced professionals can also be invited by the team.</p>
                        <PointsProgress points={e.points} required={e.requiredPoints} />
                        <div className="mt-5 flex flex-wrap gap-3">
                            <Link href="/challenges" className={btnPrimary}>Earn points</Link>
                            <Link href="/contact" className={btnSecondary}>Ask the team for an invitation</Link>
                        </div>
                    </div>
                )
            ) : (
                <div className="space-y-4">
                    {e?.invited && <p className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200">The team invited you to apply.</p>}
                    <div className={cardPad}>
                        <MentorApplicationForm
                            mode="apply"
                            pending={register.isPending}
                            error={register.error}
                            submitLabel="Send application"
                            onSubmit={(input) => register.mutate(input, { onSuccess: () => router.push('/mentorship/my-profile') })}
                        />
                    </div>
                </div>
            )}
        </PageShell>
    );
}

export function MyMentorProfileView() {
    const { ready } = useRequireLogin('/mentorship/my-profile');
    const profile = useMyMentorProfile(ready);
    const update = useUpdateMentorProfile({ inline: true });
    const toggle = useToggleMentorPause();

    if (!ready) return <FullPageSpinner />;
    const p = profile.data;

    return (
        <PageShell title="My mentor profile" backHref="/mentorship" backLabel="All mentors">
            <MentorshipNav />
            {profile.isLoading ? <RowSkeleton count={2} label="Loading your profile" /> : profile.isError ? (
                <ErrorState error={profile.error} onRetry={() => profile.refetch()} title="Could not load your profile" />
            ) : !p ? (
                <EmptyBlock icon={GraduationCap} title="You are not a mentor yet" action={<Link href="/mentorship/become-mentor" className={btnPrimary}>Become a mentor</Link>}>
                    Apply to share your experience. It takes a few minutes and the team reviews it.
                </EmptyBlock>
            ) : (
                <div className="space-y-6">
                    <section className={cardPad} aria-label="Status" data-testid="profile-status" data-status={p.status}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3"><MentorStatusChip status={p.status} />{p.status === 'approved' && p.isPaused && <span className="text-sm text-amber-800 dark:text-amber-300">Paused: you are hidden from the directory</span>}</div>
                            {p.status === 'approved' && <Link href={`/mentorship/mentor/${p._id}`} className="text-sm font-medium text-orange-800 hover:underline dark:text-orange-400">View public profile</Link>}
                        </div>
                        {p.status === 'pending' && <p className={`mt-3 flex items-start gap-2 text-sm ${muted}`}><Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> The team is reviewing your application. You will get a notification when there is a decision. You can still edit it.</p>}
                        {p.status === 'rejected' && (
                            <div className="mt-3 text-sm text-gray-800 dark:text-gray-200">
                                <p className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" /> Your application was not approved.</p>
                                {p.reviewNote && <p className="mt-2 rounded-lg bg-gray-100 p-3 dark:bg-neutral-800" data-testid="review-note">{p.reviewNote}</p>}
                                <p className={`mt-2 ${muted}`}>Edit your profile and save it to send it for review again.</p>
                            </div>
                        )}
                        {p.status === 'suspended' && (
                            <div className="mt-3 text-sm text-gray-800 dark:text-gray-200">
                                <p className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" /> Your profile is suspended, so you are not listed and cannot take new mentees.</p>
                                {p.reviewNote && <p className="mt-2 rounded-lg bg-gray-100 p-3 dark:bg-neutral-800" data-testid="review-note">{p.reviewNote}</p>}
                            </div>
                        )}
                        {p.status === 'approved' && (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm text-gray-800 dark:text-gray-200">{p.currentMenteeCount} of {p.maxMentees} spots taken <span className={muted}>({spotsLabel(p)})</span></p>
                                <button type="button" className={btnSecondary} onClick={() => toggle.mutate({ pause: !p.isPaused })} disabled={toggle.isPending} aria-pressed={p.isPaused}>
                                    {p.isPaused ? <><PlayCircle className="h-4 w-4" aria-hidden="true" /> Resume</> : <><PauseCircle className="h-4 w-4" aria-hidden="true" /> Pause new requests</>}
                                </button>
                            </div>
                        )}
                    </section>

                    {p.status !== 'suspended' && (
                        <section className={cardPad} aria-labelledby="edit-heading">
                            <h2 id="edit-heading" className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Edit your profile</h2>
                            <MentorApplicationForm
                                key={p._id}
                                mode="edit"
                                profile={p}
                                pending={update.isPending}
                                error={update.error}
                                submitLabel={p.status === 'rejected' ? 'Save and send for review' : 'Save changes'}
                                onSubmit={(input) => {
                                    const { conductAccepted: _conduct, ...rest } = input;
                                    void _conduct;
                                    update.mutate(rest);
                                }}
                            />
                        </section>
                    )}
                </div>
            )}
        </PageShell>
    );
}

