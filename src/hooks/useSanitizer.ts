'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

const subscribe = () => () => {};

/**
 * Whether the code runs in a browser, for what only a browser can do (DOMPurify needs a window).
 * It is false for the server render and for the first render of a page being hydrated, so both
 * produce the same markup, and true right after, without a mismatch. In a client side navigation
 * it is true from the first render.
 */
export const useIsBrowser = (): boolean => useSyncExternalStore(subscribe, () => true, () => false);

/**
 * `sanitizeHtml` for a component that may be rendered on the server and then hydrated: it answers an
 * empty string until the page is in a browser (never unsanitised markup), so the server markup and
 * the first client render agree, and the cleaned HTML replaces it as soon as the page hydrates.
 */
export function useSanitizer(): typeof sanitizeHtml {
    const browser = useIsBrowser();
    return useCallback<typeof sanitizeHtml>((html, config) => (browser ? sanitizeHtml(html, config) : ''), [browser]);
}
