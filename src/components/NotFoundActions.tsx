'use client';

import { ArrowLeft, Command, Search } from 'lucide-react';

/** The two buttons of the 404 page that need the browser: one step back, and the site search */
export function GoBackButton() {
    return (
        <button
            type="button"
            onClick={() => window.history.back()}
            className="flex items-center gap-2 rounded-xl border border-gray-300 px-6 py-3 text-gray-700 transition-all hover:border-gray-400 hover:text-gray-900 dark:border-white/10 dark:text-gray-300 dark:hover:border-white/20 dark:hover:text-white"
        >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go Back
        </button>
    );
}

export function SearchSiteButton() {
    return (
        <button
            type="button"
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
        >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>Search the site</span>
            <kbd className="hidden items-center gap-1 rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] sm:flex dark:border-white/10 dark:bg-white/5">
                <Command className="h-3 w-3" aria-hidden="true" />K
            </kbd>
        </button>
    );
}
