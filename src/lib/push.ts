import { subscribePush, unsubscribePush, type PushSubscriptionJson } from '@/lib/api/push';

const WORKER_URL = '/sw.js';

/** True only in a browser that can show push notifications; always false while rendering on the server */
export function isPushSupported(): boolean {
    return typeof window !== 'undefined'
        && 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window;
}

export function currentPermission(): NotificationPermission {
    return typeof Notification === 'undefined' ? 'default' : Notification.permission;
}

/** Web Push wants the VAPID key as bytes; the server sends it URL-safe base64 */
export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
    const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
    const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

function sameKey(existing: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
    if (!existing) return false;
    const a = new Uint8Array(existing);
    return a.length === wanted.length && a.every((b, i) => b === wanted[i]);
}

async function registration(): Promise<ServiceWorkerRegistration> {
    await navigator.serviceWorker.register(WORKER_URL, { scope: '/' });
    return navigator.serviceWorker.ready;
}

function toJson(subscription: PushSubscription): PushSubscriptionJson {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('The browser returned an incomplete push subscription.');
    return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** Subscribes this browser (reusing the subscription it already has) and tells the server about it */
export async function subscribeThisDevice(publicKey: string): Promise<void> {
    const reg = await registration();
    const key = urlBase64ToBytes(publicKey);
    let subscription = await reg.pushManager.getSubscription();
    // A subscription made for another key can never be used again
    if (subscription && !sameKey(subscription.options?.applicationServerKey, key)) {
        await subscription.unsubscribe();
        subscription = null;
    }
    const created = !subscription;
    if (!subscription) subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    try {
        await subscribePush(toJson(subscription));
    } catch (err) {
        // Do not leave a browser subscription the server never accepted
        if (created) await subscription.unsubscribe().catch(() => false);
        throw err;
    }
}

/** Removes this browser's subscription from the server and from the browser */
export async function unsubscribeThisDevice(): Promise<void> {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const subscription = await reg?.pushManager.getSubscription();
    if (!subscription) return;
    try {
        await unsubscribePush(subscription.endpoint);
    } catch {
        // The server drops dead endpoints on its own; the browser side must still go
    }
    await subscription.unsubscribe();
}

const DISMISSED_KEY = 'push-prompt-dismissed';

/** Storage can be blocked or full; the prompt then just comes back next visit */
export function readPromptDismissed(): boolean {
    try {
        return window.localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
        return false;
    }
}

export function writePromptDismissed(): void {
    try {
        window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
        // Nothing to do
    }
}
