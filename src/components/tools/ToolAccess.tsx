'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Loader2, LogIn, MailCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { btnPrimary, btnSecondary, card, muted } from './styles';

export type ToolAccessState = 'loading' | 'login' | 'verify' | 'ok';

/**
 * Whether the visitor may run a tool that connects to a target. Only a confirmed unverified
 * account is held back here; an account whose state is unknown is left to the API, which answers
 * AUTH_EMAIL_NOT_VERIFIED if it has to.
 */
export function useToolAccess(needsLogin: boolean): ToolAccessState {
    const { user, loading } = useAuth();
    if (!needsLogin) return 'ok';
    if (loading) return 'loading';
    if (!user) return 'login';
    if (user.isVerified === false) return 'verify';
    return 'ok';
}

/** A card that explains what is needed, shown above the (disabled) form */
export function AccessNotice({ state }: { state: ToolAccessState }) {
    const pathname = usePathname();
    const { requestVerification } = useAuth();
    const [sent, setSent] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
    // Where to come back to after signing in, query string included (read after mount: no Suspense needed)
    const [back, setBack] = useState(pathname);
    useEffect(() => { setBack(`${pathname}${window.location.search}`); }, [pathname]);

    if (state === 'ok') return null;
    if (state === 'loading') {
        return (
            <div className={`${card} mb-6 flex items-center gap-3 p-4 text-sm ${muted}`} role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking your account
            </div>
        );
    }

    if (state === 'login') {
        return (
            <div className={`${card} mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`} data-testid="login-gate">
                <div className="flex items-start gap-3">
                    <LogIn className="mt-0.5 h-5 w-5 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                    <div>
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sign in to run this tool</h2>
                        <p className={`mt-0.5 text-sm ${muted}`}>It connects to a target for you, so it is limited to signed-in members with a verified e-mail address. Lookups that only read public data need no account.</p>
                    </div>
                </div>
                <Link href={`/auth?redirect=${encodeURIComponent(back)}`} className={`${btnPrimary} shrink-0`}>Sign in</Link>
            </div>
        );
    }

    return (
        <div className={`${card} mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between`} data-testid="verify-gate">
            <div className="flex items-start gap-3">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden="true" />
                <div>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Verify your e-mail address first</h2>
                    <p className={`mt-0.5 text-sm ${muted}`}>
                        {sent === 'sent' ? 'We sent you a new link. Open it, then come back and reload this page.' : sent === 'failed' ? 'We could not send the e-mail. Try again in a moment.' : 'This tool connects to a target, so it needs a verified account. We can send the link again.'}
                    </p>
                </div>
            </div>
            <button
                type="button"
                className={`${btnSecondary} shrink-0`}
                disabled={sent === 'sending' || sent === 'sent'}
                onClick={async () => {
                    setSent('sending');
                    try { await requestVerification(); setSent('sent'); } catch { setSent('failed'); }
                }}
            >
                {sent === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Send the link again
            </button>
        </div>
    );
}

/** The confirmation every run of a tool that connects to a target needs */
export function AckCheckbox({ checked, onChange, disabled, id = 'ack' }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; id?: string }) {
    return (
        <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-800 dark:text-gray-200">
            <input
                id={id}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600"
            />
            <span>I own this target or have written permission to test it. <span className={muted}>The run is logged with this confirmation.</span></span>
        </label>
    );
}
