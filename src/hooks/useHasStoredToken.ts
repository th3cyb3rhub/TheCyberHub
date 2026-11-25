'use client';

import { useSyncExternalStore } from 'react';
import { tokenStore } from '@/lib/api';

const subscribe = (notify: () => void) => {
    window.addEventListener('storage', notify);
    return () => window.removeEventListener('storage', notify);
};

/**
 * Whether this browser holds a sign-in token. False on the server and before hydration. A page that
 * only a signed-in viewer can still read (a draft) asks the API again when it is true, and leaves a
 * visitor with the server's answer without a request.
 */
export function useHasStoredToken(): boolean {
    return useSyncExternalStore(subscribe, () => Boolean(tokenStore.get()), () => false);
}
