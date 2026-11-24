import { tokenStore } from '@/lib/api';

/**
 * After an administrator saves a competition: ask the app server to drop its cached public copies
 * (the list, the competition pages and the results), so visitors do not wait for the cache to run
 * out. Best effort: a failure changes nothing for the admin, the caches just expire on their own.
 */
export async function refreshPublicCtf(): Promise<void> {
    const token = tokenStore.get();
    if (!token) return;
    try {
        await fetch('/api/revalidate/ctf', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true });
    } catch {
        // The caches expire by themselves
    }
}
