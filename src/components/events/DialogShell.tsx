'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { X } from 'lucide-react';

interface DialogShellProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    wide?: boolean;
    /**
     * Where focus goes when the dialog closes, instead of the element that had it before. Return
     * null (or nothing) to use that element. For a dialog whose action removes its own opener.
     */
    restoreFocusTo?: () => HTMLElement | null;
}

/** A dialog for content (the day of a calendar, an address to copy). Radix handles focus, Escape and the backdrop. */
export function DialogShell({ open, onOpenChange, title, description, children, footer, wide = false, restoreFocusTo }: DialogShellProps) {
    // These dialogs are opened by state, not by a Radix trigger, so remember what had focus and give it back on close
    const opener = useRef<HTMLElement | null>(null);
    const wasOpen = useRef(false);
    if (open && !wasOpen.current && typeof document !== 'undefined') {
        opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    }
    wasOpen.current = open;

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content
                    onCloseAutoFocus={(e) => {
                        const target = restoreFocusTo?.() ?? opener.current;
                        if (target?.isConnected) { e.preventDefault(); target.focus(); }
                    }}
                    className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 ${wide ? 'max-w-xl' : 'max-w-md'}`}>
                    <Dialog.Close asChild>
                        <button type="button" aria-label="Close" className="absolute right-4 top-4 rounded p-1 text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:hover:text-white">
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </Dialog.Close>
                    <Dialog.Title className="pr-6 text-lg font-semibold text-gray-900 dark:text-white">{title}</Dialog.Title>
                    {description ? (
                        <Dialog.Description className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</Dialog.Description>
                    ) : (
                        <Dialog.Description className="sr-only">{title}</Dialog.Description>
                    )}
                    <div className="mt-4">{children}</div>
                    {footer && <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div>}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
