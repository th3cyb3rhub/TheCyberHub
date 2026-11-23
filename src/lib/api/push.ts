import { fetchApi } from '@/lib/api';

export type PushErrorCode = 'PUSH_DISABLED' | 'PUSH_LIMIT_REACHED';

/** The machine-readable code on a failed push call, when the API sent one */
export function pushErrorCode(err: unknown): string | undefined {
    const code = (err as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : undefined;
}

/** The server's public key, or null when push is switched off on the server (the UI then hides itself) */
export async function getPushPublicKey(): Promise<string | null> {
    try {
        const res = await fetchApi('/api/notifications/push/public-key');
        const key = res?.data?.publicKey;
        return typeof key === 'string' && key ? key : null;
    } catch (err) {
        if (pushErrorCode(err) === 'PUSH_DISABLED') return null;
        throw err;
    }
}

export interface PushSubscriptionJson {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

export async function subscribePush(subscription: PushSubscriptionJson): Promise<{ id: string; endpoint: string; createdAt: string }> {
    const body = { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } };
    const res = await fetchApi('/api/notifications/push/subscribe', { method: 'POST', body: JSON.stringify(body) });
    return res.data;
}

/** `token` is for sign-out, when the stored token is already gone by the time the request is made */
export async function unsubscribePush(endpoint: string, token?: string): Promise<boolean> {
    const res = await fetchApi('/api/notifications/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    return !!res?.data?.removed;
}
