'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { FullPageSpinner, PageShell, useRequireLogin } from '@/components/events/PageShell';
import { btnSecondary, card, muted } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { isJobPoster, isJobReviewer } from '@/lib/jobs/roles';
import { CompanyForm } from './CompanyForm';

/**
 * Become an employer: a member with a confirmed organisation email registers the company. The
 * account is upgraded by the server; the page then reads the account again so the menus follow.
 * The server refuses an unconfirmed address (EMAIL_NOT_VERIFIED) and a consumer provider
 * (EMPLOYER_EMAIL_NOT_ORG), and the form shows its message in place.
 */
export function SetupView() {
    const router = useRouter();
    const { addToast } = useToast();
    const { loading, refreshUser } = useAuth();
    const { user, ready } = useRequireLogin('/employer/setup');
    const poster = isJobPoster(user?.role);

    useEffect(() => {
        if (poster) router.replace('/employer');
    }, [poster, router]);

    if (loading || !ready || !user || poster) return <FullPageSpinner label="Loading your account" />;

    const reviewer = isJobReviewer(user.role);

    return (
        <PageShell title="Become an employer" subtitle="Post security jobs for your organisation." backHref="/jobs" backLabel="Back to jobs">
            <div className="space-y-6">
                {reviewer && (
                    <p className={`${card} p-4 text-sm text-gray-800 dark:text-gray-200`} role="note">
                        You are a moderator, so your role stays as it is. Registering a company is possible, but you review jobs rather than post them. <Link href="/admin/jobs" className="font-medium text-orange-800 underline dark:text-orange-300">Open the review queue</Link>.
                    </p>
                )}
                <div className={`${card} flex items-start gap-3 p-4`}>
                    <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                    <div className="text-sm text-gray-800 dark:text-gray-200">
                        <p className="font-medium">What we check</p>
                        <ul className={`mt-1 list-disc space-y-1 pl-5 ${muted}`}>
                            <li>Your account email must be confirmed, and it must be a company address. Free mail providers are not accepted.</li>
                            <li>A reviewer checks your company profile. Until it is verified, each job you post is reviewed before it goes live.</li>
                            <li>Your account email ({user.email}) is only shown on a job if you give no other way to apply.</li>
                        </ul>
                        {!user.isVerified && <p className="mt-2 font-medium text-amber-900 dark:text-amber-300">Your email is not confirmed yet. Confirm it first, then come back. <Link href="/verify-email" className="underline">Confirm your email</Link></p>}
                    </div>
                </div>
                <CompanyForm
                    mode="setup"
                    fallbackName={user.organization?.name ?? ''}
                    onSaved={async () => {
                        addToast({ variant: 'success', message: 'You are registered as an employer.' });
                        try { await refreshUser(); } catch { /* the dashboard reads the account again */ }
                        router.replace('/employer');
                    }}
                />
                <p className="text-center"><Link href="/jobs" className={btnSecondary}>Not now</Link></p>
            </div>
        </PageShell>
    );
}
