'use client';

import { Share2 } from 'lucide-react';
import { btnSecondary } from '@/components/events/styles';
import { useToast } from '@/context/ToastContext';

/** Share the canonical address of a job: the system share sheet where there is one, else the clipboard */
export function ShareButton({ title, company, slug }: { title: string; company: string; slug: string }) {
    const { addToast } = useToast();

    const share = async () => {
        const url = new URL(`/jobs/${encodeURIComponent(slug)}`, window.location.origin).toString();
        try {
            if (typeof navigator.share === 'function') {
                await navigator.share({ title: `${title} at ${company}`, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            addToast({ variant: 'success', message: 'Link copied.' });
        } catch (err) {
            // Closing the share sheet is not a failure
            if (err instanceof DOMException && err.name === 'AbortError') return;
            addToast({ variant: 'error', message: 'Could not share the link. Copy it from the address bar.' });
        }
    };

    return (
        <button type="button" onClick={() => void share()} className={btnSecondary}>
            <Share2 className="h-4 w-4" aria-hidden="true" /> Share
        </button>
    );
}
