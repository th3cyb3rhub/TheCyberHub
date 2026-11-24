import { tokenStore } from '@/lib/api';

/**
 * After an administrator's decision on a job or a company: ask the app server to drop its cached
 * public copies (the list, the job pages, the company pages), so visitors do not wait for the cache
 * to run out. Best effort: moderators are refused (only administrators and owners may purge) and a
 * failure changes nothing for the reviewer, the caches just expire on their own within a minute.
 */
export async function refreshPublicJobs(): Promise<void> {
    const token = tokenStore.get();
    if (!token) return;
    try {
        await fetch('/api/revalidate/jobs', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true });
    } catch {
        // The caches expire by themselves
    }
}
