'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, Bookmark, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import { useCallback } from 'react';
import { learningErrorMessage } from '@/lib/learning/errors';
import { btnSecondary, card, chip, focusRing, muted } from '@/components/events/styles';

export { EmptyBlock, LoadMore, Modal, Skeleton, Field, fieldClass, CountBadge } from '@/components/mentorship/shared';

export function ErrorState({ error, onRetry, title = 'Could not load this' }: { error: unknown; onRetry?: () => void; title?: string }) {
    return (
        <div role="alert" className="flex flex-col items-center rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-500/30 dark:bg-red-500/10">
            <AlertTriangle className="mb-3 h-8 w-8 text-red-700 dark:text-red-400" aria-hidden="true" />
            <h2 className="mb-1 text-base font-semibold text-red-950 dark:text-red-100">{title}</h2>
            <p className="mb-4 max-w-md text-sm text-red-900 dark:text-red-200">{learningErrorMessage(error)}</p>
            {onRetry && <button type="button" className={btnSecondary} onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</button>}
        </div>
    );
}

/** A banner for a problem inside a form or panel */
export function InlineError({ children, id }: { children: React.ReactNode; id?: string }) {
    return <p id={id} role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{children}</p>;
}

export const TONES = {
    green: 'bg-green-100 text-green-900 dark:bg-green-500/15 dark:text-green-300',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
    blue: 'bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-300',
    red: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300',
    orange: 'bg-orange-100 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300',
    gray: 'bg-gray-200 text-gray-800 dark:bg-neutral-700/60 dark:text-gray-300',
} as const;
export type Tone = keyof typeof TONES;

export function Chip({ tone = 'gray', children, icon: Icon, title }: { tone?: Tone; children: React.ReactNode; icon?: LucideIcon; title?: string }) {
    return (
        <span className={`${chip} ${TONES[tone]}`} title={title}>
            {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
            {children}
        </span>
    );
}

const DIFFICULTY_TONE = { beginner: 'green', intermediate: 'amber', advanced: 'red' } as const;
export function DifficultyChip({ difficulty }: { difficulty: string }) {
    const tone = (DIFFICULTY_TONE as Record<string, Tone>)[difficulty] ?? 'gray';
    return <Chip tone={tone}>{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</Chip>;
}

/** A percentage bar with the semantics of a progress bar */
export function ProgressBar({ percent, label, size = 'md', className = '' }: { percent: number; label: string; size?: 'sm' | 'md'; className?: string }) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            className={`overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800 ${size === 'sm' ? 'h-1.5' : 'h-2.5'} ${className}`}
        >
            <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${value >= 100 ? 'bg-green-600 dark:bg-green-500' : 'bg-orange-600 dark:bg-orange-500'}`} style={{ width: `${value}%` }} />
        </div>
    );
}

/** The sign-in page address that brings the visitor back to this page */
export function useSignInHref() {
    const pathname = usePathname();
    return `/auth?redirect=${encodeURIComponent(pathname || '/')}`;
}

export function useGoToSignIn() {
    const router = useRouter();
    const href = useSignInHref();
    return useCallback(() => router.push(href), [router, href]);
}

/** A bookmark toggle. Hidden for signed-out visitors by the caller (they have nothing to toggle). */
export function BookmarkToggle({ bookmarked, onToggle, pending = false, label, className = '' }: { bookmarked: boolean; onToggle: () => void; pending?: boolean; label: string; className?: string }) {
    return (
        <button
            type="button"
            aria-pressed={bookmarked}
            aria-label={`${bookmarked ? 'Remove bookmark from' : 'Bookmark'} ${label}`}
            disabled={pending}
            onClick={onToggle}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-300 dark:hover:bg-neutral-800 ${focusRing} ${className}`}
        >
            {pending
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <Bookmark className={`h-4 w-4 ${bookmarked ? 'fill-orange-600 text-orange-700 dark:fill-orange-400 dark:text-orange-400' : ''}`} aria-hidden="true" />}
        </button>
    );
}

export function SignInNote({ children }: { children: React.ReactNode }) {
    const href = useSignInHref();
    return (
        <p className={`rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/60 ${muted}`}>
            {children} <Link href={href} className="font-medium text-orange-800 underline dark:text-orange-400">Sign in</Link>
        </p>
    );
}

export function CardGridSkeleton({ count = 6, label = 'Loading' }: { count?: number; label?: string }) {
    return (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={label}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className={`${card} p-5`}>
                    <div className="h-5 w-2/3 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-neutral-800" />
                    <div className="mt-3 h-3 w-full animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-neutral-800" />
                    <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-neutral-800" />
                    <div className="mt-5 flex gap-2"><div className="h-5 w-16 animate-pulse rounded-full bg-gray-200 motion-reduce:animate-none dark:bg-neutral-800" /><div className="h-5 w-20 animate-pulse rounded-full bg-gray-200 motion-reduce:animate-none dark:bg-neutral-800" /></div>
                </div>
            ))}
        </div>
    );
}
