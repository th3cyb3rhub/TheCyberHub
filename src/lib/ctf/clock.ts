'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CtfStatus } from '@/types/ctf';
import { effectiveCtfStatus, serverMoment } from './status';
import { serverClockVersion, serverNow, subscribeServerClock } from './serverClock';

type Dated = Parameters<typeof effectiveCtfStatus>[0];

/** Changes when the known server offset changes, so a clock that corrects itself re-renders its readers */
const useClockVersion = () => useSyncExternalStore(subscribeServerClock, serverClockVersion, () => 0);

/** The server's time, refreshed every `intervalMs`. Null until mounted (server and first paint). */
export function useCtfNow(intervalMs = 1000): Date | null {
    const version = useClockVersion();
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => {
        setNow(serverNow());
        const id = window.setInterval(() => setNow(serverNow()), intervalMs);
        return () => window.clearInterval(id);
    }, [intervalMs, version]);
    return now;
}

/**
 * The status the server's clock gives right now. The value is state that only changes when the
 * status does, so the page that holds it re-renders at the start, the freeze and the end, and not
 * once per tick. Before mount it agrees with the status the API sent.
 */
export function useCtfStatus(competition: Dated | null | undefined): CtfStatus {
    const version = useClockVersion();
    const [status, setStatus] = useState<CtfStatus>(() => (competition ? effectiveCtfStatus(competition, serverMoment(competition)) : 'upcoming'));
    useEffect(() => {
        if (!competition) return;
        const read = () => setStatus(effectiveCtfStatus(competition, serverNow()));
        read();
        const id = window.setInterval(read, 1000);
        return () => window.clearInterval(id);
    }, [competition, version]);
    return status;
}
