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
