'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { btnSecondary } from '@/components/events/styles';

/** Asks the server to render the page again: for a page whose data failed to load */
export function RefreshButton({ label = 'Try again' }: { label?: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    return (
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => start(() => router.refresh())}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} {label}
        </button>
    );
}
