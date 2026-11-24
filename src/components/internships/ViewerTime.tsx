'use client';

import { useViewerZone } from '@/lib/events/clock';
import { formatDay, formatMoment, formatStamp } from '@/lib/internships/display';

/**
 * A date in the viewer's own zone. The server and the first paint show UTC (the server does not
 * know the visitor's zone), then the text switches, so markup never mismatches the server HTML.
 */
export function ViewerTime({ iso, kind = 'day', className }: { iso: string | null | undefined; kind?: 'day' | 'moment' | 'stamp'; className?: string }) {
    const zone = useViewerZone();
    if (!iso) return null;
    const text = kind === 'moment' ? formatMoment(iso, zone) : kind === 'stamp' ? formatStamp(iso, zone) : formatDay(iso, zone);
    return <time dateTime={iso} className={className}>{kind === 'stamp' && !zone ? `${text} UTC` : text}</time>;
}
