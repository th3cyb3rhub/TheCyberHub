import { tokenStore } from '@/lib/api';

/**
 * After an administrator saves a lab: ask the app server to drop its cached public copies (the list,
 * the filters and the lab pages), so visitors do not wait for the cache to run out. Best effort: a
 * failure changes nothing for the admin, the caches just expire on their own schedule.
 */
export async function refreshPublicLabs(): Promise<void> {
    const token = tokenStore.get();
    if (!token) return;
    try {
        await fetch('/api/revalidate/labs', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true });
    } catch {
        // The caches expire by themselves
    }
}
