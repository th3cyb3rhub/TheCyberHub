'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Stops a person from losing what they typed by accident. While `dirty`:
 * - closing the tab, reloading or leaving the site asks the browser to confirm (`beforeunload`);
 * - a click on a link to another page of the site (Cancel, the back link, the menu) is held, and
 *   a dialog asks whether to leave. The browser's own back button cannot be held by a page.
 * Returns the dialog to render, and nothing else changes when the form is clean.
 */
export function useUnsavedGuard(dirty: boolean): React.ReactNode {
    const router = useRouter();
    const [target, setTarget] = useState<string | null>(null);

    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
            if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
            const url = new URL(link.href, window.location.href);
            // Another site is covered by beforeunload; the same address changes nothing
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname && url.search === window.location.search) return;
            e.preventDefault();
            e.stopPropagation();
            setTarget(`${url.pathname}${url.search}${url.hash}`);
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('click', onClick, true);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            document.removeEventListener('click', onClick, true);
        };
    }, [dirty]);

    return (
        <ConfirmDialog
            open={dirty && target !== null}
            title="Leave without saving?"
            description="What you typed on this page will be lost."
            confirmText="Leave"
            cancelText="Keep editing"
            variant="warning"
            onCancel={() => setTarget(null)}
            onConfirm={() => { const to = target; setTarget(null); if (to) router.push(to); }}
        />
    );
}
