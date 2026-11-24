'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { browserTimeZone } from './time';

const noopSubscribe = () => () => {};

/**
 * The viewer's own time zone. It is null while rendering on the server and during hydration, so
 * markup that depends on it appears after mount and never mismatches the server HTML.
 */
export function useViewerZone(): string | null {
    return useSyncExternalStore(noopSubscribe, browserTimeZone, () => null);
}

/** The current time, refreshed every `intervalMs`. Null until mounted (server and first paint). */
export function useNow(intervalMs = 30_000): Date | null {
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => {
        setNow(new Date());
        const id = window.setInterval(() => setNow(new Date()), intervalMs);
        return () => window.clearInterval(id);
    }, [intervalMs]);
    return now;
}

const PHONE_QUERY = '(max-width: 639px)';

function subscribePhone(onChange: () => void) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const media = window.matchMedia(PHONE_QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
}

const phoneNow = () => (typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY).matches : false);

/**
 * Whether the screen is a phone (under 640px). Null on the server and during hydration, so a page
 * can wait for the answer before it picks a layout.
 */
export function useIsPhone(): boolean | null {
    return useSyncExternalStore(subscribePhone, phoneNow, () => null);
}
