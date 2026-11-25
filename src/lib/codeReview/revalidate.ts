import { tokenStore } from '@/lib/api';

/**
 * After an administrator saves an exercise: ask the app server to drop its cached public copies
 * (the list and the exercise pages), so visitors do not wait for the cache to run out. Best effort:
 * a failure changes nothing for the admin, the caches just expire on their own schedule.
 */
export async function refreshPublicCodeReview(): Promise<void> {
    const token = tokenStore.get();
    if (!token) return;
    try {
        await fetch('/api/revalidate/code-review', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true });
    } catch {
        // The caches expire by themselves
    }
}
