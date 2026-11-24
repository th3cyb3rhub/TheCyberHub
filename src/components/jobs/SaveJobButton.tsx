'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { btnSecondary, focusRing } from '@/components/events/styles';
import { useAuth } from '@/context/AuthContext';
import { useSaveJob } from '@/hooks/queries/useJobs';

interface Props {
    id: string;
    title: string;
    saved: boolean;
    /** The saved state is not known yet (the answer for the signed-in member is on its way) */
    pending?: boolean;
    /** `icon` is a small round button for a card, `button` the labelled one of the job page */
    variant?: 'icon' | 'button';
}

/**
 * Save a job to the member's bookmarks. The state changes at once and goes back when the call
 * fails. A visitor who is not signed in is sent to sign in and brought back here.
 */
export function SaveJobButton({ id, title, saved, pending = false, variant = 'button' }: Props) {
    const { user, loading } = useAuth();
    const pathname = usePathname();
    const save = useSaveJob();
    const Icon = saved ? BookmarkCheck : Bookmark;
    const label = saved ? 'Saved' : 'Save';

    if (!user && !loading) {
        const href = `/auth?redirect=${encodeURIComponent(pathname || '/jobs')}`;
        return variant === 'icon' ? (
            <Link href={href} className={`rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-white ${focusRing}`}>
                <Bookmark className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Sign in to save {title}</span>
            </Link>
        ) : (
            <Link href={href} className={btnSecondary}><Bookmark className="h-4 w-4" aria-hidden="true" /> Sign in to save</Link>
        );
    }

    const toggle = () => save.mutate({ id, saved: !saved });
    const busy = pending || save.isPending || loading;

    if (variant === 'icon') {
        return (
            <button
                type="button"
                onClick={toggle}
                disabled={busy}
                aria-pressed={saved}
                data-testid="save-job"
                className={`rounded-lg p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${saved ? 'text-orange-800 dark:text-orange-400' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-white'} ${focusRing}`}
            >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">{saved ? `Remove ${title} from saved jobs` : `Save ${title}`}</span>
            </button>
        );
    }
    return (
        <button type="button" onClick={toggle} disabled={busy} aria-pressed={saved} data-testid="save-job" className={btnSecondary}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
            {label}
        </button>
    );
}
