import { useSyncExternalStore } from 'react';

const subscribe = (notify: () => void) => {
    document.addEventListener('visibilitychange', notify);
    return () => document.removeEventListener('visibilitychange', notify);
};

/** True while the tab is in front. It changes when the person switches tabs, unlike a one-off read of `document.visibilityState`. */
export function useDocumentVisible(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => document.visibilityState === 'visible',
        () => true,
    );
}
