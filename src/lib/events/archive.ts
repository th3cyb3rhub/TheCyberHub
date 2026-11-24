import { EVENT_CATEGORIES, type ArchiveFilters, type EventCategory } from '@/types/event';
import { parseDay } from './calendar';

export interface ArchiveState { category: EventCategory | ''; from: string; to: string; q: string }

/** `?category=ctf&from=2026-01-01&to=2026-06-30&q=web`. Broken values are dropped, not passed on. */
export function parseArchiveParams(params: URLSearchParams): ArchiveState {
    const category = params.get('category');
    return {
        category: category && (EVENT_CATEGORIES as readonly string[]).includes(category) ? (category as EventCategory) : '',
        from: parseDay(params.get('from')) ?? '',
        to: parseDay(params.get('to')) ?? '',
        q: (params.get('q') ?? '').trim().slice(0, 100),
    };
}

export function archiveSearch(state: Partial<ArchiveState>): string {
    const params = new URLSearchParams();
    if (state.category) params.set('category', state.category);
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    if (state.q?.trim()) params.set('q', state.q.trim().slice(0, 100));
    return params.toString();
}

/** The API refuses a range that ends before it starts */
export const archiveRangeInvalid = (state: Pick<ArchiveState, 'from' | 'to'>) => !!state.from && !!state.to && state.to < state.from;

export function toArchiveFilters(state: ArchiveState): ArchiveFilters {
    return {
        category: state.category || undefined,
        from: state.from || undefined,
        to: state.to || undefined,
        q: state.q || undefined,
    };
}

/** The API stops answering past this page, so "load more" stops here and asks for narrower filters */
export const ARCHIVE_MAX_PAGE = 200;
