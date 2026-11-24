import { useEffect, useRef, useState } from 'react';

/** 905 seconds as "15:05", 59 as "0:59" */
export function formatClock(totalSeconds: number): string {
    const s = Math.max(0, Math.ceil(totalSeconds));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Whole seconds left until a client clock instant, 0 when it has passed or there is none */
export function secondsUntil(until: number | null, now: number = Date.now()): number {
    if (until === null) return 0;
    return Math.max(0, Math.ceil((until - now) / 1000));
}

/**
 * Seconds left until `until` (a client clock instant in milliseconds), counted down once a second.
 * `onDone` runs once when the wait ends, so the screen can show the real state again.
 */
export function useCountdown(until: number | null, onDone?: () => void): number {
    const [seconds, setSeconds] = useState(() => secondsUntil(until));
    const done = useRef(onDone);
    done.current = onDone;

    useEffect(() => {
        setSeconds(secondsUntil(until));
        if (until === null || until <= Date.now()) return;
        const timer = window.setInterval(() => {
            const left = secondsUntil(until);
            setSeconds(left);
            if (left <= 0) {
                window.clearInterval(timer);
                done.current?.();
            }
        }, 1000);
        return () => window.clearInterval(timer);
    }, [until]);

    return seconds;
}
