'use client';

import { useParams } from 'next/navigation';

/** The value of one dynamic segment of the current address (the first one when it is a catch-all), or '' */
export function useRouteSegment(name: string): string {
    const params = useParams<Record<string, string | string[] | undefined>>();
    const raw = params?.[name];
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (!first) return '';
    try {
        return decodeURIComponent(first);
    } catch {
        return '';
    }
}
