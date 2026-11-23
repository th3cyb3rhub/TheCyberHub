/* Service worker for web push. It only shows notifications and opens the page a notification points to. */

const DEFAULT_TITLE = 'TheCyberHub';
const FALLBACK_PATH = '/notifications';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

/** Only in-app paths are followed; anything else goes to the notifications page */
function safePath(link) {
    if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//') || link.startsWith('/\\')) {
        return FALLBACK_PATH;
    }
    try {
        const url = new URL(link, self.location.origin);
        return url.origin === self.location.origin ? url.pathname + url.search + url.hash : FALLBACK_PATH;
    } catch (err) {
        return FALLBACK_PATH;
    }
}

self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (err) {
        payload = {};
    }

    const title = typeof payload.title === 'string' && payload.title ? payload.title : DEFAULT_TITLE;
    const tag = typeof payload.tag === 'string' && payload.tag ? payload.tag : undefined;
    const options = {
        body: typeof payload.body === 'string' ? payload.body : '',
        icon: '/logo.png',
        tag,
        // A later push with the same tag replaces the earlier one; say so out loud
        renotify: !!tag,
        data: { path: safePath(payload.link) },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(safePath(event.notification.data && event.notification.data.path), self.location.origin).href;

    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if (new URL(client.url).origin !== self.location.origin) continue;
            try {
                if ('navigate' in client) await client.navigate(target);
                return await client.focus();
            } catch (err) {
                // Fall through to opening a new window
            }
        }
        return self.clients.openWindow(target);
    })());
});
