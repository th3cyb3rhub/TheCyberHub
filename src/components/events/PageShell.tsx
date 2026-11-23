'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { btnSecondary, muted, pageBg } from './styles';

/** The signed-in user, or a redirect to sign in that brings them back here */
export function useRequireLogin(returnTo: string) {
    const { user, loading } = useAuth();
    const router = useRouter();
    useEffect(() => {
        if (!loading && !user) router.replace(`/auth?redirect=${encodeURIComponent(returnTo)}`);
    }, [loading, user, router, returnTo]);
    return { user, ready: !loading && !!user };
}

export function PageShell({ title, subtitle, backHref, backLabel, actions, wide = false, children }: {
    title: string;
    subtitle?: string;
    backHref?: string;
    backLabel?: string;
    actions?: React.ReactNode;
    wide?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className={pageBg}>
            <div className={`mx-auto px-4 pb-16 pt-24 sm:px-6 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
                {backHref && (
                    <Link href={backHref} className="mb-4 inline-flex items-center gap-1.5 rounded text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-gray-400 dark:hover:text-white">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {backLabel ?? 'Back'}
                    </Link>
                )}
                <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
                        {subtitle && <p className={`mt-1 text-sm ${muted}`}>{subtitle}</p>}
                    </div>
                    {actions}
                </div>
                {children}
            </div>
        </div>
    );
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
    return (
        <div className={`${pageBg} flex items-center justify-center`} role="status" aria-label={label}>
            <Loader2 className="h-8 w-8 animate-spin text-orange-700 dark:text-orange-400" aria-hidden="true" />
        </div>
    );
}

export function NoAccess({ message, href = '/events', label = 'Back to events' }: { message: string; href?: string; label?: string }) {
    return (
        <div className={pageBg}>
            <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-32 text-center">
                <ShieldAlert className="mb-4 h-10 w-10 text-red-700 dark:text-red-400" aria-hidden="true" />
                <h1 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">You cannot open this page</h1>
                <p className={`mb-6 text-sm ${muted}`}>{message}</p>
                <Link href={href} className={btnSecondary}>{label}</Link>
            </div>
        </div>
    );
}
